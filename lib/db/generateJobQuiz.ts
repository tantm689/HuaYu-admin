import { createServerSupabase } from '@/lib/supabase/server'
import { ExtractionResultSchema } from '@/lib/gemini/schema'
import { generateQuiz } from '@/lib/gemini/generateQuiz'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'
import type { JobStatus } from '@/lib/db/types'

export class JobNotReadyForQuizError extends Error {}

async function loadJob(supabase: ReturnType<typeof createServerSupabase>, jobId: string) {
  const { data: job, error } = await supabase.from('extraction_jobs').select().eq('id', jobId).single()
  if (error || !job) throw new Error('extraction job not found')
  return job
}

// Generates a fresh set of 30 quiz questions from the job's reviewed
// content, overwriting any existing quiz draft. Only reachable once audio
// has been generated ('audio_ready' or later), matching the pipeline order:
// text -> audio -> quiz -> import.
export async function generateJobQuiz(jobId: string): Promise<QuizQuestion[]> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)

  if (job.status !== 'audio_ready' && job.status !== 'quiz_ready') {
    throw new JobNotReadyForQuizError('Công việc cần hoàn tất bước "Sinh & duyệt Audio" trước khi sinh quiz.')
  }

  const result = ExtractionResultSchema.parse(job.raw_json)
  const quizQuestions = await generateQuiz(result)

  await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions } })
    .eq('id', jobId)

  return quizQuestions
}

// Saves admin-edited quiz questions into the job's raw_json and advances
// status to 'quiz_ready' (only from 'audio_ready' - re-saving edits on an
// already quiz_ready job is a no-op status-wise, same pattern as the job
// PATCH route for text edits).
export async function saveJobQuiz(jobId: string, quizQuestions: QuizQuestion[]): Promise<JobStatus> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)

  const result = ExtractionResultSchema.parse(job.raw_json)
  const nextStatus: JobStatus = job.status === 'audio_ready' ? 'quiz_ready' : job.status

  await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions }, status: nextStatus })
    .eq('id', jobId)

  return nextStatus
}
