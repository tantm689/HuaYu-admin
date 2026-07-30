import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { generateLessonAudio, regenerateAllLessonAudio, regenerateLessonAudioItem } from '@/lib/db/generateLessonAudio'
import type { TtsVoice } from '@/lib/tts/generateAudio'

// edge-tts talks raw WebSocket to Microsoft's TTS endpoint, which isn't
// supported in the Edge Runtime.
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const voice = body.voice as TtsVoice | undefined
  const mode = (body.mode as 'fill' | 'regenerateAll' | undefined) ?? 'fill'

  try {
    if (mode === 'regenerateAll') {
      await regenerateAllLessonAudio(lessonId, voice)
    } else {
      await generateLessonAudio(lessonId, voice)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown audio generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  await params
  const body = await request.json().catch(() => ({}))
  const { id, voice } = body as { id?: string; voice?: TtsVoice }

  if (!id || !voice) {
    return NextResponse.json({ error: 'id and voice are required' }, { status: 400 })
  }

  try {
    await regenerateLessonAudioItem(id, voice)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown audio regeneration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
