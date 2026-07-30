import { createServerSupabase } from '@/lib/supabase/server'
import { ExtractionResultSchema } from '@/lib/gemini/schema'
import { generateQuizPart1, generateQuizPart2 } from '@/lib/gemini/generateQuiz'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'
import type { JobStatus } from '@/lib/db/types'

export class JobNotReadyForQuizError extends Error {}

async function loadJob(supabase: ReturnType<typeof createServerSupabase>, jobId: string) {
  const { data: job, error } = await supabase.from('extraction_jobs').select().eq('id', jobId).single()
  if (error || !job) throw new Error('extraction job not found')
  return job
}

function requireQuizReady(status: string) {
  if (status !== 'audio_ready' && status !== 'quiz_ready') {
    throw new JobNotReadyForQuizError('Công việc cần hoàn tất bước "Sinh & duyệt Audio" trước khi sinh quiz.')
  }
}

export type GenerateJobQuizResult = { quizQuestions: QuizQuestion[]; usedFallbackModel: boolean }

// Generates a fresh Part 1 (15 questions: pinyin_choice/listening_choice/
// tone_choice) from the job's reviewed content, overwriting only Part 1 of
// any existing quiz draft - Part 2 (if already generated) is left untouched,
// so a Part 2 failure/regenerate never has to redo Part 1. Only reachable
// once audio has been generated ('audio_ready' or later), matching the
// pipeline order: text -> audio -> quiz -> import.
export async function generateJobQuizPart1(jobId: string): Promise<GenerateJobQuizResult> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)
  requireQuizReady(job.status)

  const result = ExtractionResultSchema.parse(job.raw_json)
  const { questions: part1Questions, usedFallbackModel } = await generateQuizPart1(result)
  const existingPart2 = result.quizQuestions.filter((q) => q.part === 2)
  const quizQuestions = [...part1Questions, ...existingPart2]

  const { error: updateError } = await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions } })
    .eq('id', jobId)

  if (updateError) throw new Error(updateError.message)

  return { quizQuestions, usedFallbackModel }
}

// Generates a fresh Part 2 (15 questions: matching/fill_blank/sentence_order),
// overwriting only Part 2 of any existing quiz draft - mirrors
// generateJobQuizPart1 for Part 1.
export async function generateJobQuizPart2(jobId: string): Promise<GenerateJobQuizResult> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)
  requireQuizReady(job.status)

  const result = ExtractionResultSchema.parse(job.raw_json)
  const { questions: part2Questions, usedFallbackModel } = await generateQuizPart2(result)
  const existingPart1 = result.quizQuestions.filter((q) => q.part === 1)
  const quizQuestions = [...existingPart1, ...part2Questions]

  const { error: updateError } = await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions } })
    .eq('id', jobId)

  if (updateError) throw new Error(updateError.message)

  return { quizQuestions, usedFallbackModel }
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

  const { error: updateError } = await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions }, status: nextStatus })
    .eq('id', jobId)

  if (updateError) throw new Error(updateError.message)

  return nextStatus
}
