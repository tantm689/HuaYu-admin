import { createServerSupabase } from '@/lib/supabase/server'
import { generateVocabAudio } from '@/lib/tts/edgeTts'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const VOCAB_TTS_TIMEOUT_MS = 15_000

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

  const result = ExtractionResultSchema.parse(job.raw_json)

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
          title_zh: dialogue.titleZh,
          title_vi: dialogue.titleVi,
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
    }

    for (const vocab of result.vocabulary) {
      const { data: vocabRow, error: vocabError } = await supabase
        .from('vocabulary')
        .insert({
          lesson_id: lesson.id,
          order: vocab.order,
          category: vocab.category,
          word_zh: vocab.wordZh,
          pinyin: vocab.pinyin,
          meaning_vi: vocab.meaningVi,
        })
        .select()
        .single()

      if (vocabError || !vocabRow) throw new Error(vocabError?.message ?? 'failed to insert vocabulary')

      try {
        const audioBytes = await withTimeout(
          generateVocabAudio(vocab.wordZh),
          VOCAB_TTS_TIMEOUT_MS,
          'TTS timeout'
        )
        const path = `vocab/${vocabRow.id}.mp3`
        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(path, audioBytes, { contentType: 'audio/mpeg' })
        if (uploadError) throw uploadError

        const { data: publicUrl } = supabase.storage.from('audio').getPublicUrl(path)
        await supabase.from('vocabulary').update({ audio_url: publicUrl.publicUrl }).eq('id', vocabRow.id)
      } catch {
        // TTS/upload failure never blocks import; audio_url stays null for
        // the admin to regenerate later. A hung TTS call is bounded by
        // withTimeout so it fails within VOCAB_TTS_TIMEOUT_MS instead of
        // hanging the whole import request forever.
      }
    }

    for (const gp of result.grammarPoints) {
      const { data: gpRow, error: gpError } = await supabase
        .from('grammar_points')
        .insert({
          lesson_id: lesson.id,
          order: gp.order,
          title_zh: gp.titleZh,
          title_vi: gp.titleVi,
          structure_note: gp.structureNote,
        })
        .select()
        .single()

      if (gpError || !gpRow) throw new Error(gpError?.message ?? 'failed to insert grammar point')

      if (gp.examples.length > 0) {
        const { error: exError } = await supabase.from('grammar_examples').insert(
          gp.examples.map((ex) => ({
            grammar_point_id: gpRow.id,
            order: ex.order,
            text_zh: ex.textZh,
            pinyin: ex.pinyin,
            translation_vi: ex.translationVi,
          }))
        )
        if (exError) throw new Error(exError.message)
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

  return { lessonId: lesson.id }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}
