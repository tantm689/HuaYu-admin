import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const form = await request.formData()
  const bookId = form.get('bookId') as string
  const lessonNo = Number(form.get('lessonNo'))
  const pageStart = Number(form.get('pageStart'))
  const pageEnd = Number(form.get('pageEnd'))
  const file = form.get('file') as File

  if (pageStart > pageEnd) {
    return NextResponse.json({ error: 'pageStart must be <= pageEnd' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: job, error: insertError } = await supabase
    .from('extraction_jobs')
    .insert({ book_id: bookId, lesson_no: lessonNo, page_start: pageStart, page_end: pageEnd, status: 'pending' })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const path = `jobs/${job.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('book-pdfs')
    .upload(path, await file.arrayBuffer(), { contentType: 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data, error: updateError } = await supabase
    .from('extraction_jobs')
    .update({ sliced_pdf_path: path })
    .eq('id', job.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
