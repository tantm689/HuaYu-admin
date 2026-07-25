import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import type { LessonStatus } from '@/lib/db/types'

const ALLOWED_TRANSITIONS: Record<LessonStatus, LessonStatus[]> = {
  draft: ['reviewed'],
  reviewed: ['published', 'draft'],
  published: ['draft'],
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const { status: nextStatus } = (await request.json()) as { status: LessonStatus }
  const supabase = createServerSupabase()

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select()
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'lesson not found' }, { status: 404 })
  }

  if (!ALLOWED_TRANSITIONS[lesson.status as LessonStatus].includes(nextStatus)) {
    return NextResponse.json(
      { error: `cannot transition from ${lesson.status} to ${nextStatus}` },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('lessons').update({ status: nextStatus }).eq('id', lessonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: nextStatus })
}
