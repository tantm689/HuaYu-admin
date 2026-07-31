import { createServerSupabase } from '@/lib/supabase/server'
import { ExtractionResultSchema } from '@/lib/gemini/schema'
import { deleteLessonAndAudio } from '@/lib/db/deleteLesson'

export class JobAlreadyImportedError extends Error {}
export class JobNotReadyForImportError extends Error {}

export async function importExtractionJob(jobId: string): Promise<{ lessonId: string }> {
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select()
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw new Error('extraction job not found')
  }

  if (job.status === 'imported') {
    // Re-importing would try to INSERT a lesson that already exists (unique
    // book_id+lesson_no), and would blow away any post-import edits made via
    // the lesson editor. Once imported, further changes go through
    // /lessons/[lessonId]/edit instead.
    throw new JobAlreadyImportedError('Công việc này đã được nhập vào cơ sở dữ liệu rồi, không thể nhập lại.')
  }

  // Import is reachable once text has been reviewed. Audio and Quiz are no
  // longer steps in the job pipeline - they're generated later, on the
  // imported lesson's own Audio/Quiz tabs (lib/db/generateLessonAudio.ts,
  // lib/db/generateLessonQuiz.ts), which operate on real DB rows instead of
  // a job's draft raw_json.
  if (job.status !== 'reviewed') {
    throw new JobNotReadyForImportError(
      'Công việc cần được duyệt (bấm "Lưu") trước khi import vào cơ sở dữ liệu.'
    )
  }

  const result = ExtractionResultSchema.parse(job.raw_json)

  // Overwrite mode: the admin already confirmed (client-side, before calling
  // this) that a lesson for this book_id+lesson_no exists and should be
  // replaced - e.g. re-extracting a lesson with an improved prompt. Delete
  // its audio files first since the DB cascade on lesson delete won't touch
  // storage, then delete the lesson row itself (cascades its children).
  const { data: existing } = await supabase
    .from('lessons')
    .select('id')
    .eq('book_id', job.book_id)
    .eq('lesson_no', result.lesson.lessonNo)
    .maybeSingle()

  if (existing) {
    await deleteLessonAndAudio(existing.id)
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .insert({
      book_id: job.book_id,
      lesson_no: result.lesson.lessonNo,
      title_zh: result.lesson.titleZh,
      title_vi: result.lesson.titleVi,
      theme: result.lesson.theme,
      objectives: result.lesson.objectives,
      status: 'draft',
    })
    .select()
    .single()

  if (lessonError || !lesson) {
    throw new Error(lessonError?.message ?? 'failed to insert lesson')
  }

  try {
    for (const dialogue of result.dialogues) {
      const { data: dlgRow, error: dlgError } = await supabase
        .from('dialogues')
        .insert({
          lesson_id: lesson.id,
          order: dialogue.order,
          kind: dialogue.kind,
          audio_code: dialogue.audioCode,
        })
        .select()
        .single()

      if (dlgError || !dlgRow) throw new Error(dlgError?.message ?? 'failed to insert dialogue')

      if (dialogue.lines.length > 0) {
        const { error: linesError } = await supabase.from('dialogue_lines').insert(
          dialogue.lines.map((line) => ({
            dialogue_id: dlgRow.id,
            order: line.order,
            speaker_zh: line.speakerZh,
            speaker_pinyin: line.speakerPinyin,
            text_zh: line.textZh,
            pinyin: line.pinyin,
            translation_vi: line.translationVi,
          }))
        )
        if (linesError) throw new Error(linesError.message)
      }

      if (dialogue.vocabulary.length > 0) {
        const { error: vocabError } = await supabase.from('vocabulary').insert(
          dialogue.vocabulary.map((vocab) => ({
            dialogue_id: dlgRow.id,
            order: vocab.order,
            word_zh: vocab.wordZh,
            pinyin: vocab.pinyin,
            meaning_vi: vocab.meaningVi,
          }))
        )
        if (vocabError) throw new Error(vocabError.message)
      }
    }

    async function insertExamples(grammarSectionId: string, examples: { order: number; textZh: string; pinyin: string | null; translationVi: string | null }[]) {
      if (examples.length === 0) return
      const { error: exError } = await supabase.from('grammar_examples').insert(
        examples.map((ex) => ({
          grammar_section_id: grammarSectionId,
          order: ex.order,
          text_zh: ex.textZh,
          pinyin: ex.pinyin,
          translation_vi: ex.translationVi,
        }))
      )
      if (exError) throw new Error(exError.message)
    }

    async function insertSections(
      sections: (typeof result.grammarPoints)[number]['sections'],
      owner: { grammar_point_id: string } | { grammar_sub_point_id: string } | { parent_section_id: string }
    ) {
      for (const section of sections) {
        const { data: secRow, error: secError } = await supabase
          .from('grammar_sections')
          .insert({
            ...owner,
            order: section.order,
            label: section.label,
            content: section.content,
          })
          .select()
          .single()

        if (secError || !secRow) throw new Error(secError?.message ?? 'failed to insert grammar section')

        await insertExamples(secRow.id, section.examples)

        if (section.items.length > 0) {
          await insertSections(
            section.items.map((item) => ({ ...item, items: [] })),
            { parent_section_id: secRow.id }
          )
        }
      }
    }

    for (const gp of result.grammarPoints) {
      const { data: gpRow, error: gpError } = await supabase
        .from('grammar_points')
        .insert({
          lesson_id: lesson.id,
          order: gp.order,
          title_vi: gp.titleVi,
        })
        .select()
        .single()

      if (gpError || !gpRow) throw new Error(gpError?.message ?? 'failed to insert grammar point')

      await insertSections(gp.sections, { grammar_point_id: gpRow.id })

      for (const sp of gp.subPoints) {
        const { data: spRow, error: spError } = await supabase
          .from('grammar_sub_points')
          .insert({
            grammar_point_id: gpRow.id,
            order: sp.order,
            label: sp.label,
            title_vi: sp.titleVi,
          })
          .select()
          .single()

        if (spError || !spRow) throw new Error(spError?.message ?? 'failed to insert grammar sub-point')

        await insertSections(sp.sections, { grammar_sub_point_id: spRow.id })
      }
    }

  } catch (err) {
    // A partial import (lesson committed, some children inserted) can never
    // be retried cleanly - the unique (book_id, lesson_no) constraint blocks
    // re-inserting the lesson. Delete the lesson row so cascades clean up
    // whatever children were inserted, leaving the job cleanly retryable.
    await supabase.from('lessons').delete().eq('id', lesson.id)
    throw err
  }

  await supabase.from('extraction_jobs').update({ status: 'imported' }).eq('id', jobId)

  if (job.sliced_pdf_path) {
    try {
      await supabase.storage.from('book-pdfs').remove([job.sliced_pdf_path])
      await supabase.from('extraction_jobs').update({ sliced_pdf_path: null }).eq('id', jobId)
    } catch {
      // Best effort cleanup; a leftover sliced PDF is harmless once the job
      // is imported, it's just wasted storage that can be removed manually.
    }
  }

  return { lessonId: lesson.id }
}
