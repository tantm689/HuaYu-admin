import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { title, volume } = await request.json()

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('books')
    .insert({ title, volume: volume || null })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
