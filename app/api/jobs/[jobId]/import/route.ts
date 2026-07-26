import { NextResponse } from 'next/server'
import { importExtractionJob, type DialogueAudioFile } from '@/lib/db/importJob'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params

  const contentType = request.headers.get('content-type') ?? ''
  const dialogueAudioFiles: DialogueAudioFile[] = []
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const files = form.getAll('audioFiles') as File[]
    for (const file of files) {
      dialogueAudioFiles.push({ filename: file.name, buffer: await file.arrayBuffer() })
    }
  }

  try {
    const result = await importExtractionJob(jobId, dialogueAudioFiles)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
