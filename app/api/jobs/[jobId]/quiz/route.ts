import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { generateJobQuiz, saveJobQuiz, JobNotReadyForQuizError } from '@/lib/db/generateJobQuiz'
import { QuizQuestionSchema } from '@/lib/gemini/quizSchema'
import { z } from 'zod'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params

  try {
    const quizQuestions = await generateJobQuiz(jobId)
    return NextResponse.json({ quizQuestions })
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
