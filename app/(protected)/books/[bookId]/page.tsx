import Link from "next/link"
import { notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { Book, ExtractionJob, Lesson } from "@/lib/db/types"
import type { VariantProps } from "class-variance-authority"

interface Props {
  params: Promise<{ bookId: string }>
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

const lessonStatusLabel: Record<Lesson["status"], string> = {
  draft: "Nháp",
  reviewed: "Đã duyệt",
  published: "Đã xuất bản",
}

const lessonStatusVariant: Record<Lesson["status"], BadgeVariant> = {
  draft: "pending",
  reviewed: "info",
  published: "success",
}

const jobStatusLabel: Record<ExtractionJob["status"], string> = {
  pending: "Đang chờ",
  reviewed: "Đã duyệt",
  imported: "Đã nhập",
  failed: "Lỗi",
}

const jobStatusVariant: Record<ExtractionJob["status"], BadgeVariant> = {
  pending: "pending",
  reviewed: "info",
  imported: "success",
  failed: "destructive",
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

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Bài học
        </h2>
        {lessonRows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có bài học nào.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {lessonRows.map((lesson) => (
              <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
                <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
                  <CardHeader>
                    <CardTitle>
                      Bài {lesson.lesson_no}: {lesson.title_vi || lesson.title_zh}
                    </CardTitle>
                    <CardDescription>
                      <Badge variant={lessonStatusVariant[lesson.status]}>
                        {lessonStatusLabel[lesson.status]}
                      </Badge>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Công việc trích xuất
        </h2>
        {jobRows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có công việc trích xuất nào.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {jobRows.map((job) => (
              <Link key={job.id} href={`/books/${bookId}/jobs/${job.id}`}>
                <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
                  <CardHeader>
                    <CardTitle>
                      Bài {job.lesson_no} · Trang {job.page_start}–{job.page_end}
                    </CardTitle>
                    <CardDescription>
                      <Badge variant={jobStatusVariant[job.status]}>
                        {jobStatusLabel[job.status]}
                      </Badge>
                    </CardDescription>
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
