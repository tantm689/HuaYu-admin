import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { generateJobAudioItem, markJobAudioReady, JobNotEditableForAudioError } from '@/lib/db/generateJobAudio'
import type { TtsVoice } from '@/lib/tts/generateAudio'

// edge-tts talks raw WebSocket to Microsoft's TTS endpoint, which isn't
// supported in the Edge Runtime.
export const runtime = 'nodejs'

// Generates/regenerates audio for exactly one vocab word, identified by its
// position in raw_json (works whether it already has a synthetic id or not -
// see generateJobAudioItem). The client drives this one word at a time so it
// can show live X/Y progress instead of firing one opaque batch request.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const body = await request.json().catch(() => ({}))
  const { dialogueIndex, vocabIndex, voice } = body as {
    dialogueIndex?: number
    vocabIndex?: number
    voice?: TtsVoice
  }

  if (dialogueIndex === undefined || vocabIndex === undefined || !voice) {
    return NextResponse.json({ error: 'dialogueIndex, vocabIndex and voice are required' }, { status: 400 })
  }

  try {
    const audioUrl = await generateJobAudioItem(jobId, dialogueIndex, vocabIndex, voice)
    return NextResponse.json({ audioUrl })
  } catch (err) {
    if (err instanceof JobNotEditableForAudioError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown audio generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Called once the client has generated every vocab word's audio, to advance
// the job's status to 'audio_ready'.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params

  try {
    await markJobAudioReady(jobId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error marking audio ready'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
