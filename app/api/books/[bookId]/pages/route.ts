import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params
  const supabase = createServerSupabase()
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('pdf_path')
    .eq('id', bookId)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'book not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('book-pdfs')
    .createSignedUrl(book.pdf_path, 60 * 10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
