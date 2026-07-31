import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export async function POST(request: Request) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const form = await request.formData()
  const bookId = form.get('bookId')
  const lessonNoRaw = form.get('lessonNo')
  const pageStartRaw = form.get('pageStart')
  const pageEndRaw = form.get('pageEnd')
  const file = form.get('file')

  if (typeof bookId !== 'string' || bookId.trim() === '') {
    return NextResponse.json({ error: 'bookId is required' }, { status: 400 })
  }

  const lessonNo = Number(lessonNoRaw)
  if (typeof lessonNoRaw !== 'string' || lessonNoRaw.trim() === '' || !Number.isFinite(lessonNo)) {
    return NextResponse.json({ error: 'lessonNo must be a valid number' }, { status: 400 })
  }

  const pageStart = Number(pageStartRaw)
  if (typeof pageStartRaw !== 'string' || pageStartRaw.trim() === '' || !Number.isFinite(pageStart)) {
    return NextResponse.json({ error: 'pageStart must be a valid number' }, { status: 400 })
  }

  const pageEnd = Number(pageEndRaw)
  if (typeof pageEndRaw !== 'string' || pageEndRaw.trim() === '' || !Number.isFinite(pageEnd)) {
    return NextResponse.json({ error: 'pageEnd must be a valid number' }, { status: 400 })
  }

  if (pageStart > pageEnd) {
    return NextResponse.json({ error: 'pageStart must be <= pageEnd' }, { status: 400 })
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
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
    await supabase.from('extraction_jobs').delete().eq('id', job.id)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data, error: updateError } = await supabase
    .from('extraction_jobs')
    .update({ sliced_pdf_path: path })
    .eq('id', job.id)
    .select()
    .single()

  if (updateError) {
    await supabase.from('extraction_jobs').delete().eq('id', job.id)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
