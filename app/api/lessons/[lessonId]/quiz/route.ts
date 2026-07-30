import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import {
  generateLessonQuizPart1,
  generateLessonQuizPart2,
  getLessonQuizQuestions,
  updateQuizQuestion,
  updateQuizQuestionOrder,
  deleteQuizQuestion,
} from '@/lib/db/generateLessonQuiz'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params

  try {
    const questions = await getLessonQuizQuestions(lessonId)
    return NextResponse.json(questions)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error loading quiz questions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const url = new URL(request.url)
  const part = url.searchParams.get('part')

  if (part !== '1' && part !== '2') {
    return NextResponse.json({ error: 'part query param must be "1" or "2"' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)
    const { questions, usedFallbackModel } =
      part === '1' ? await generateLessonQuizPart1(lessonId) : await generateLessonQuizPart2(lessonId)
    return NextResponse.json({ questions, usedFallbackModel })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown quiz generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Accepts `payload` (a hand-edit to one question's type-specific fields),
// `order` (a reorder), or both in the same call - the Quiz tab sends
// `payload` for field edits and `order` for move-up/move-down, never both
// at once, but the route doesn't need to forbid combining them.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const { id, payload, order } = body as { id?: string; payload?: unknown; order?: number }

  if (!id || (payload === undefined && order === undefined)) {
    return NextResponse.json({ error: 'id and at least one of payload/order are required' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)
    if (payload !== undefined) await updateQuizQuestion(lessonId, id, payload)
    if (order !== undefined) await updateQuizQuestionOrder(lessonId, id, order)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error updating quiz question'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const url = new URL(request.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)
    await deleteQuizQuestion(lessonId, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error deleting quiz question'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
