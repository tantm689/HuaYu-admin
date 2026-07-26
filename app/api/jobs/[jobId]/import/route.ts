import { NextResponse } from 'next/server'
import { importExtractionJob, JobAlreadyImportedError } from '@/lib/db/importJob'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  try {
    const result = await importExtractionJob(jobId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof JobAlreadyImportedError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
