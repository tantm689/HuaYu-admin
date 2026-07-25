import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const form = await request.formData()
  const title = form.get('title') as string
  const volume = (form.get('volume') as string) || null
  const file = form.get('file') as File

  const supabase = createServerSupabase()
  const path = `books/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('book-pdfs')
    .upload(path, await file.arrayBuffer(), { contentType: 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('books')
    .insert({ title, volume, pdf_path: path })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
