import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { bookId, lessonNo, pageStart, pageEnd } = await request.json()

  if (pageStart > pageEnd) {
    return NextResponse.json({ error: 'pageStart must be <= pageEnd' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('extraction_jobs')
    .insert({ book_id: bookId, lesson_no: lessonNo, page_start: pageStart, page_end: pageEnd, status: 'pending' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
