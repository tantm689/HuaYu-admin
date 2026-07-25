import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { matchFilesToDialogues } from '@/lib/audio/matchDialogueAudio'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params
  const form = await request.formData()
  const files = form.getAll('files') as File[]

  const supabase = createServerSupabase()

  const { data: dialogues, error: dialoguesError } = await supabase
    .from('dialogues')
    .select('id, audio_code, lessons!inner(book_id)')
    .eq('lessons.book_id', bookId)

  if (dialoguesError) {
    return NextResponse.json({ error: dialoguesError.message }, { status: 500 })
  }

  const { matched, unmatched } = matchFilesToDialogues(
    files.map((f) => f.name),
    dialogues ?? []
  )

  for (const { dialogueId, filename } of matched) {
    const file = files.find((f) => f.name === filename)!
    const path = `dialogues/${dialogueId}.mp3`

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, await file.arrayBuffer(), {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    if (uploadError) continue

    const { data: publicUrlData } = supabase.storage.from('audio').getPublicUrl(path)

    await supabase
      .from('dialogues')
      .update({ audio_url: publicUrlData.publicUrl })
      .eq('id', dialogueId)
  }

  return NextResponse.json({ matchedCount: matched.length, unmatched })
}
