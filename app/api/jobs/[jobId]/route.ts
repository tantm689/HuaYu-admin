import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { checkExistingLesson } from '@/lib/db/checkExistingLesson'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('extraction_jobs').select().eq('id', jobId).single()

  if (error || !data) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  const lessonNo = (data.raw_json as { lesson?: { lessonNo?: number } } | null)?.lesson?.lessonNo
  const existingLesson =
    data.status !== 'imported' && typeof lessonNo === 'number'
      ? await checkExistingLesson(data.book_id, lessonNo)
      : null

  return NextResponse.json({ ...data, existingLesson })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const { raw_json } = await request.json()
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status === 'imported') {
    return NextResponse.json(
      { error: 'Công việc này đã được nhập vào cơ sở dữ liệu rồi, không thể sửa lại ở đây.' },
      { status: 400 }
    )
  }

  // Only 'pending'/'reviewed' jobs advance to 'reviewed' on save. A job past
  // that (audio_ready/quiz_ready) keeps its status - otherwise saving a text
  // tweak here would silently regress it back behind the audio/quiz gate
  // it already cleared.
  const nextStatus = job.status === 'pending' || job.status === 'reviewed' ? 'reviewed' : job.status

  const { error } = await supabase
    .from('extraction_jobs')
    .update({ raw_json, status: nextStatus })
    .eq('id', jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ status: nextStatus })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select('sliced_pdf_path')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.sliced_pdf_path) {
    await supabase.storage.from('book-pdfs').remove([job.sliced_pdf_path])
  }

  const { error } = await supabase.from('extraction_jobs').delete().eq('id', jobId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
