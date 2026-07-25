import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
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
  const { jobId } = await params
  const { raw_json } = await request.json()
  const supabase = createServerSupabase()

  const { error } = await supabase
    .from('extraction_jobs')
    .update({ raw_json, status: 'reviewed' })
    .eq('id', jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ status: 'reviewed' })
}
