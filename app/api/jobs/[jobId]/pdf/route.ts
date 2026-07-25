import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = createServerSupabase()
  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select('sliced_pdf_path')
    .eq('id', jobId)
    .single()

  if (jobError || !job || !job.sliced_pdf_path) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('book-pdfs')
    .createSignedUrl(job.sliced_pdf_path, 60 * 10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
