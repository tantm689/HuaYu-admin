import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { updateDialogueLineTrims, type DialogueLineTrim } from '@/lib/db/trimDialogueLines'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; dialogueId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const lines = body.lines as DialogueLineTrim[] | undefined

  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'lines must be an array' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)
    await updateDialogueLineTrims(lines)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error saving trimmed audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
