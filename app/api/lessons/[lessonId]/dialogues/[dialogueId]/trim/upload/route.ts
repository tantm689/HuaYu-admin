import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; dialogueId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const form = await request.formData()
  const file = form.get('file') as File | null
  const path = form.get('path') as string | null

  if (!file || !path) {
    return NextResponse.json({ error: 'file and path are required' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)

    const supabase = createServerSupabase()
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, await file.arrayBuffer(), { contentType: 'audio/wav', upsert: true })
    if (uploadError) throw new Error(uploadError.message)

    const { data } = supabase.storage.from('audio').getPublicUrl(path)
    return NextResponse.json({ publicUrl: data.publicUrl })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error uploading trimmed audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
