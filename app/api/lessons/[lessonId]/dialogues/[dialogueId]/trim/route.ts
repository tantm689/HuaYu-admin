import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { updateDialogueLineTrims } from '@/lib/db/trimDialogueLines'

const TrimLineSchema = z
  .object({
    id: z.string().uuid(),
    audioUrl: z.string().url(),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
  })
  .refine((l) => l.endTime > l.startTime, { message: 'endTime must be greater than startTime' })

const TrimBodySchema = z.object({ lines: z.array(TrimLineSchema) })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; dialogueId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const result = TrimBodySchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { lines } = result.data

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
