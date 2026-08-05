import { createServerSupabase } from '@/lib/supabase/server'
import { LessonFullUpdateSchema, type LessonFullUpdate } from '@/lib/db/lessonFull'

export class LessonNotEditableError extends Error {}

// Shared guard for the audio/quiz mutation routes (and any other future
// lesson-scoped mutation) - mirrors the inline check in updateLessonFull so
// a lesson can only be mutated while it's still a draft.
export async function requireLessonDraft(lessonId: string): Promise<void> {
  const supabase = createServerSupabase()
  const { data: lesson, error } = await supabase.from('lessons').select('status').eq('id', lessonId).single()
  if (error || !lesson) throw new Error('Không tìm thấy bài học.')
  if (lesson.status !== 'draft') {
    throw new LessonNotEditableError('Bài học phải ở trạng thái Nháp mới được sửa. Hãy "Chuyển về nháp" trước.')
  }
}

// Applies admin edits made after import directly onto the live tables.
// Existing rows (id present) are UPDATEd in place so columns the editor
// never shows - audio_url on dialogues/vocabulary - are left untouched.
// Rows with no id are newly added in the editor and get INSERTed; rows that
// existed before the edit but are missing from the payload were deleted in
// the editor and get DELETEd (cascading to their own children).
export async function updateLessonFull(lessonId: string, rawPayload: unknown): Promise<void> {
  const payload: LessonFullUpdate = LessonFullUpdateSchema.parse(rawPayload)
  const supabase = createServerSupabase()

  const { data: currentLesson, error: fetchError } = await supabase
    .from('lessons')
    .select('status')
    .eq('id', lessonId)
    .single()
  if (fetchError || !currentLesson) throw new Error(fetchError?.message ?? 'lesson not found')
  if (currentLesson.status !== 'draft') {
    throw new LessonNotEditableError('Bài học phải ở trạng thái Nháp mới được sửa. Hãy "Chuyển về nháp" trước.')
  }

  const { error: lessonError } = await supabase
    .from('lessons')
    .update({
      title_zh: payload.titleZh,
      title_vi: payload.titleVi,
      theme: payload.theme,
      objectives: payload.objectives,
      grammar_markdown: payload.grammarMarkdown,
    })
    .eq('id', lessonId)
  if (lessonError) throw new Error(lessonError.message)

  await syncDialogues(supabase, lessonId, payload.dialogues)
}

type Supabase = ReturnType<typeof createServerSupabase>

async function syncDialogues(supabase: Supabase, lessonId: string, dialogues: LessonFullUpdate['dialogues']) {
  const { data: existingRows } = await supabase.from('dialogues').select('id').eq('lesson_id', lessonId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(dialogues.filter((d) => d.id).map((d) => d.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.storage.from('audio').remove(toDelete.map((id) => `dialogues/${id}.mp3`))
    await supabase.from('dialogues').delete().in('id', toDelete)
  }

  for (const dialogue of dialogues) {
    let dialogueId = dialogue.id
    if (dialogueId) {
      const { error } = await supabase
        .from('dialogues')
        .update({
          order: dialogue.order,
          kind: dialogue.kind,
          audio_code: dialogue.audioCode,
        })
        .eq('id', dialogueId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await supabase
        .from('dialogues')
        .insert({
          lesson_id: lessonId,
          order: dialogue.order,
          kind: dialogue.kind,
          audio_code: dialogue.audioCode,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'failed to insert dialogue')
      dialogueId = data.id
    }

    await syncDialogueLines(supabase, dialogueId!, dialogue.lines)
    await syncVocabulary(supabase, dialogueId!, dialogue.vocabulary)
  }
}

async function syncDialogueLines(
  supabase: Supabase,
  dialogueId: string,
  lines: LessonFullUpdate['dialogues'][number]['lines']
) {
  const { data: existingRows } = await supabase.from('dialogue_lines').select('id').eq('dialogue_id', dialogueId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.storage.from('audio').remove(toDelete.map((id) => `dialogue-lines/${id}.wav`))
    await supabase.from('dialogue_lines').delete().in('id', toDelete)
  }

  for (const line of lines) {
    const row = {
      dialogue_id: dialogueId,
      order: line.order,
      speaker_zh: line.speakerZh,
      speaker_pinyin: line.speakerPinyin,
      text_zh: line.textZh,
      pinyin: line.pinyin,
      translation_vi: line.translationVi,
    }
    if (line.id) {
      const { error } = await supabase.from('dialogue_lines').update(row).eq('id', line.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('dialogue_lines').insert(row)
      if (error) throw new Error(error.message)
    }
  }
}

async function syncVocabulary(
  supabase: Supabase,
  dialogueId: string,
  vocabulary: LessonFullUpdate['dialogues'][number]['vocabulary']
) {
  const { data: existingRows } = await supabase.from('vocabulary').select('id').eq('dialogue_id', dialogueId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(vocabulary.filter((v) => v.id).map((v) => v.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.storage.from('audio').remove(toDelete.map((id) => `vocab/${id}.mp3`))
    await supabase.from('vocabulary').delete().in('id', toDelete)
  }

  for (const vocab of vocabulary) {
    if (vocab.id) {
      const { error } = await supabase
        .from('vocabulary')
        .update({ order: vocab.order, word_zh: vocab.wordZh, pinyin: vocab.pinyin, meaning_vi: vocab.meaningVi })
        .eq('id', vocab.id)
      if (error) throw new Error(error.message)
      continue
    }

    const { error } = await supabase.from('vocabulary').insert({
      dialogue_id: dialogueId,
      order: vocab.order,
      word_zh: vocab.wordZh,
      pinyin: vocab.pinyin,
      meaning_vi: vocab.meaningVi,
    })
    if (error) throw new Error(error.message)
  }
}
