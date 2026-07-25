import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { sliceBookPdf } from '@/lib/pdf/slice'
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

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select()
    .eq('id', job.book_id)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'book not found' }, { status: 404 })
  }

  try {
    const { data: pdfFile, error: downloadError } = await supabase.storage
      .from('book-pdfs')
      .download(book.pdf_path)

    if (downloadError || !pdfFile) {
      throw new Error(downloadError?.message ?? 'failed to download book PDF')
    }

    const sourceBytes = new Uint8Array(await pdfFile.arrayBuffer())
    const sliced = await sliceBookPdf(sourceBytes, job.page_start, job.page_end)
    const result = await extractLessonFromPdf(sliced, job.lesson_no)

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
