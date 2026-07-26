import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

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
  return NextResponse.json(data)
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

  const { error } = await supabase
    .from('extraction_jobs')
    .update({ raw_json, status: 'reviewed' })
    .eq('id', jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ status: 'reviewed' })
}
