import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { extractLessonFromPdf } from '@/lib/gemini/extract'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select()
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  try {
    if (!job.sliced_pdf_path) {
      throw new Error('job has no sliced PDF')
    }

    const { data: pdfFile, error: downloadError } = await supabase.storage
      .from('book-pdfs')
      .download(job.sliced_pdf_path)

    if (downloadError || !pdfFile) {
      throw new Error(downloadError?.message ?? 'failed to download sliced PDF')
    }

    const bytes = new Uint8Array(await pdfFile.arrayBuffer())
    const result = await extractLessonFromPdf(bytes, job.lesson_no)

    await supabase
      .from('extraction_jobs')
      .update({ status: 'pending', raw_json: result, error_message: null })
      .eq('id', job.id)

    return NextResponse.json({ status: 'pending', raw_json: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown extraction error'
    await supabase
      .from('extraction_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', job.id)

    return NextResponse.json({ status: 'failed', error_message: message })
  }
}
