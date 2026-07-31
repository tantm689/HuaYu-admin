import { createServerSupabase } from '@/lib/supabase/server'

export interface DialogueLineTrim {
  id: string
  audioUrl: string
  startTime: number
  endTime: number
}

// Updates ONLY audio_url/start_time/end_time for each given dialogue_lines
// row. Deliberately separate from lib/db/updateLessonFull.ts's
// syncDialogueLines - that function's payload schema (LessonFullUpdate)
// carries text_zh/speaker_zh/etc and has no notion of these trim fields, so
// routing trims through it would risk either silently dropping trim data or
// requiring every future edit-page save to also carry trim state around.
// This function is the only place that ever writes these three columns.
export async function updateDialogueLineTrims(lines: DialogueLineTrim[]): Promise<void> {
  const supabase = createServerSupabase()

  for (const line of lines) {
    const { error } = await supabase
      .from('dialogue_lines')
      .update({ audio_url: line.audioUrl, start_time: line.startTime, end_time: line.endTime })
      .eq('id', line.id)
    if (error) throw new Error(error.message)
  }
}
