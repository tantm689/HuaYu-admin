import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import {
  generateJobQuizPart1,
  generateJobQuizPart2,
  saveJobQuiz,
  JobNotReadyForQuizError,
} from '@/lib/db/generateJobQuiz'
import { QuizQuestionSchema } from '@/lib/gemini/quizSchema'
import { z } from 'zod'

// Generates one part (1 or 2) of the job's quiz, driven by ?part=1|2 -
// split into two smaller calls instead of one 30-question call so each
// request is faster and a failure in one part doesn't require redoing the
// other (see lib/gemini/generateQuiz.ts).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const url = new URL(request.url)
  const part = url.searchParams.get('part')

  if (part !== '1' && part !== '2') {
    return NextResponse.json({ error: 'part query param must be "1" or "2"' }, { status: 400 })
  }

  try {
    const { quizQuestions, usedFallbackModel } =
      part === '1' ? await generateJobQuizPart1(jobId) : await generateJobQuizPart2(jobId)
    return NextResponse.json({ quizQuestions, usedFallbackModel })
  } catch (err) {
    if (err instanceof JobNotReadyForQuizError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown quiz generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const SaveQuizBodySchema = z.object({
  quizQuestions: z.array(QuizQuestionSchema),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const body = await request.json().catch(() => null)
  const parsed = SaveQuizBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'quizQuestions is required and must match the quiz question schema' }, { status: 400 })
  }

  try {
    const status = await saveJobQuiz(jobId, parsed.data.quizQuestions)
    return NextResponse.json({ status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error saving quiz'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
