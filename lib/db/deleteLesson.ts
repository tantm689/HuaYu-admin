import { createServerSupabase } from '@/lib/supabase/server'

// Deletes a lesson and its DB cascade (dialogues/dialogue_lines/vocabulary/
// grammar_points/grammar_examples), plus the audio files the cascade never
// touches since it only deletes rows, not storage objects. Shared by the
// lesson DELETE route and importJob.ts's overwrite-on-import path.
export async function deleteLessonAndAudio(lessonId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { data: dialogues } = await supabase.from('dialogues').select('id').eq('lesson_id', lessonId)
  const dialogueIds = (dialogues ?? []).map((d: { id: string }) => d.id)

  const { data: vocabulary } =
    dialogueIds.length > 0
      ? await supabase.from('vocabulary').select('id').in('dialogue_id', dialogueIds)
      : { data: [] as { id: string }[] }

  const audioPaths = [
    ...dialogueIds.map((id) => `dialogues/${id}.mp3`),
    ...(vocabulary ?? []).map((v: { id: string }) => `vocab/${v.id}.mp3`),
  ]
  if (audioPaths.length > 0) {
    await supabase.storage.from('audio').remove(audioPaths)
  }

  const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
  if (error) throw new Error(error.message)
}
