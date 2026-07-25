import { NextResponse } from 'next/server'
import { importExtractionJob } from '@/lib/db/importJob'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  try {
    const result = await importExtractionJob(jobId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
