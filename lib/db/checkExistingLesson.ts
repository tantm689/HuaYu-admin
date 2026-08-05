import { createServerSupabase } from '@/lib/supabase/server'

export interface ExistingLessonSummary {
  id: string
  titleZh: string
  titleVi: string
  status: string
  dialogueCount: number
  vocabularyCount: number
}

// Used both to warn the admin before an overwrite-on-import and by the
// import itself to find what to delete. Looks up by (book_id, lessonNo)
// rather than the job's own lesson_no column, because that's the value
// importJob.ts actually writes to lessons.lesson_no (taken from the
// extraction's raw_json, not the admin's original job-creation input).
export async function checkExistingLesson(bookId: string, lessonNo: number): Promise<ExistingLessonSummary | null> {
  const supabase = createServerSupabase()

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title_zh, title_vi, status')
    .eq('book_id', bookId)
    .eq('lesson_no', lessonNo)
    .maybeSingle()

  if (!lesson) return null

  const [{ count: dialogueCount }, { count: vocabularyCount }] = await Promise.all([
    supabase.from('dialogues').select('id', { count: 'exact', head: true }).eq('lesson_id', lesson.id),
    supabase.from('vocabulary').select('id', { count: 'exact', head: true }).eq('lesson_id', lesson.id),
  ])

  return {
    id: lesson.id,
    titleZh: lesson.title_zh,
    titleVi: lesson.title_vi,
    status: lesson.status,
    dialogueCount: dialogueCount ?? 0,
    vocabularyCount: vocabularyCount ?? 0,
  }
}
