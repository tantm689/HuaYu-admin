import Link from "next/link"
import { notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { BookTabs } from "./book-tabs"
import type { Book, ExtractionJob, Lesson } from "@/lib/db/types"

interface Props {
  params: Promise<{ bookId: string }>
}

export default async function BookDetailPage({ params }: Props) {
  const { bookId } = await params
  const supabase = createServerSupabase()

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single()

  if (!book) {
    notFound()
  }

  const [{ data: lessons }, { data: jobs }] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("book_id", bookId)
      .order("lesson_no", { ascending: true }),
    supabase
      .from("extraction_jobs")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false }),
  ])

  const bookRow = book as Book
  const lessonRows = (lessons ?? []) as Lesson[]
  const jobRows = (jobs ?? []) as ExtractionJob[]

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{bookRow.title}</h1>
          {bookRow.volume && (
            <p className="mt-1 text-sm text-muted-foreground">Tập {bookRow.volume}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/books/${bookId}/audio`}>Gắn audio hội thoại</Link>} />
          <Button nativeButton={false} render={<Link href={`/books/${bookId}/jobs/new`}>Tạo bài học mới</Link>} />
        </div>
      </div>

      <BookTabs bookId={bookId} lessons={lessonRows} jobs={jobRows} />
    </main>
  )
}
