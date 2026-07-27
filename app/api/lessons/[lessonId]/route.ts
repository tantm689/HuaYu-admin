import { NextResponse } from 'next/server'
import { getLessonFull } from '@/lib/db/getLessonFull'
import { updateLessonFull, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { deleteLessonAndAudio } from '@/lib/db/deleteLesson'
import { createServerSupabase } from '@/lib/supabase/server'
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
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown update error'
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
  const supabase = createServerSupabase()

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('status')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'lesson not found' }, { status: 404 })
  }

  if (lesson.status === 'published') {
    return NextResponse.json(
      { error: 'Bài học đang xuất bản, không thể xoá. Hãy "Chuyển về nháp" trước.' },
      { status: 400 }
    )
  }

  try {
    await deleteLessonAndAudio(lessonId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown delete error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
