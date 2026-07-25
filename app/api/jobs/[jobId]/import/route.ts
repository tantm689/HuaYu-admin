import { NextResponse } from 'next/server'
import { importExtractionJob } from '@/lib/db/importJob'
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
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
