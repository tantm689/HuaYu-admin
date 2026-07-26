import { NextResponse } from 'next/server'
import { getLessonFull } from '@/lib/db/getLessonFull'
import { updateLessonFull } from '@/lib/db/updateLessonFull'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const lesson = await getLessonFull(lessonId)
  if (!lesson) {
    return NextResponse.json({ error: 'lesson not found' }, { status: 404 })
  }
  return NextResponse.json(lesson)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  try {
    const body = await request.json()
    await updateLessonFull(lessonId, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown update error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
