import Link from "next/link"
import { notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Book, ExtractionJob, Lesson } from "@/lib/db/types"

interface Props {
  params: Promise<{ bookId: string }>
}

const lessonStatusLabel: Record<Lesson["status"], string> = {
  draft: "Nháp",
  reviewed: "Đã duyệt",
  published: "Đã xuất bản",
}

const jobStatusLabel: Record<ExtractionJob["status"], string> = {
  pending: "Đang chờ",
  reviewed: "Đã duyệt",
  imported: "Đã nhập",
  failed: "Lỗi",
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
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{bookRow.title}</h1>
          {bookRow.volume && (
            <p className="text-sm text-muted-foreground">Tập {bookRow.volume}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/books/${bookId}/audio`}>Gắn audio hội thoại</Link>} />
          <Button render={<Link href={`/books/${bookId}/jobs/new`}>Tạo bài học mới</Link>} />
        </div>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">Bài học</h2>
        {lessonRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có bài học nào.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lessonRows.map((lesson) => (
              <Card key={lesson.id}>
                <CardHeader>
                  <CardTitle>
                    Bài {lesson.lesson_no}: {lesson.title_vi || lesson.title_zh}
                  </CardTitle>
                  <CardDescription>
                    {lessonStatusLabel[lesson.status]}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Công việc trích xuất</h2>
        {jobRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có công việc trích xuất nào.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {jobRows.map((job) => (
              <Link key={job.id} href={`/books/${bookId}/jobs/${job.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>
                      Bài {job.lesson_no} · Trang {job.page_start}–{job.page_end}
                    </CardTitle>
                    <CardDescription>{jobStatusLabel[job.status]}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
