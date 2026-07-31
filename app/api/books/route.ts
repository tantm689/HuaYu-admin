import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export async function POST(request: Request) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

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
