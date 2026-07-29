"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge, type badgeVariants } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import type { ExtractionJob, Lesson } from "@/lib/db/types"
import type { VariantProps } from "class-variance-authority"

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
  reviewed: "Đã duyệt text",
  audio_ready: "Đã duyệt audio",
  quiz_ready: "Đã duyệt quiz",
  imported: "Đã nhập",
  failed: "Lỗi",
}

const jobStatusVariant: Record<ExtractionJob["status"], BadgeVariant> = {
  pending: "pending",
  reviewed: "info",
  audio_ready: "info",
  quiz_ready: "info",
  imported: "success",
  failed: "destructive",
}

function DeleteButton({ onDelete, isDeleting }: { onDelete: () => void; isDeleting: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={isDeleting}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDelete()
      }}
    >
      {isDeleting ? "Đang xoá..." : "Xoá"}
    </Button>
  )
}

function JobCard({
  bookId,
  job,
  onDelete,
  isDeleting,
}: {
  bookId: string
  job: ExtractionJob
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <Link href={`/books/${bookId}/jobs/${job.id}`}>
      <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
        <CardHeader className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              Bài {job.lesson_no} · Trang {job.page_start}–{job.page_end}
            </CardTitle>
            <CardDescription>
              <Badge variant={jobStatusVariant[job.status]}>{jobStatusLabel[job.status]}</Badge>
            </CardDescription>
          </div>
          <DeleteButton onDelete={onDelete} isDeleting={isDeleting} />
        </CardHeader>
      </Card>
    </Link>
  )
}

interface Props {
  bookId: string
  lessons: Lesson[]
  jobs: ExtractionJob[]
}

export function BookTabs({ bookId, lessons, jobs }: Props) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeJobs = jobs.filter((job) => job.status !== "imported")
  const importedJobs = jobs.filter((job) => job.status === "imported")

  async function handleDeleteLesson(lesson: Lesson) {
    if (!window.confirm(`Xoá bài "${lesson.title_vi || lesson.title_zh}"? Hành động này không thể hoàn tác.`)) {
      return
    }
    setDeletingId(lesson.id)
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Xoá bài học thất bại.")
      }
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Xoá bài học thất bại.")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDeleteJob(job: ExtractionJob) {
    if (!window.confirm(`Xoá công việc trích xuất "Bài ${job.lesson_no} · Trang ${job.page_start}–${job.page_end}"? Hành động này không thể hoàn tác.`)) {
      return
    }
    setDeletingId(job.id)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Xoá công việc trích xuất thất bại.")
      }
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Xoá công việc trích xuất thất bại.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Tabs defaultValue="lessons">
      <TabsList>
        <TabsIndicator />
        <TabsTab value="lessons">Bài học ({lessons.length})</TabsTab>
        <TabsTab value="jobs">Công việc trích xuất ({jobs.length})</TabsTab>
      </TabsList>

      <TabsPanel value="lessons">
        {lessons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có bài học nào.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {lessons.map((lesson) => (
              <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
                <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
                  <CardHeader className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>
                        Bài {lesson.lesson_no}: {lesson.title_vi || lesson.title_zh}
                      </CardTitle>
                      <CardDescription>
                        <Badge variant={lessonStatusVariant[lesson.status]}>
                          {lessonStatusLabel[lesson.status]}
                        </Badge>
                      </CardDescription>
                    </div>
                    {lesson.status !== "published" && (
                      <DeleteButton
                        onDelete={() => handleDeleteLesson(lesson)}
                        isDeleting={deletingId === lesson.id}
                      />
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </TabsPanel>

      <TabsPanel value="jobs">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có công việc trích xuất nào.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {activeJobs.map((job) => (
              <JobCard
                key={job.id}
                bookId={bookId}
                job={job}
                onDelete={() => handleDeleteJob(job)}
                isDeleting={deletingId === job.id}
              />
            ))}

            {importedJobs.length > 0 && (
              <Accordion>
                <AccordionItem value="imported-jobs">
                  <AccordionTrigger className="text-sm text-muted-foreground">
                    Đã nhập ({importedJobs.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4 pt-1">
                      {importedJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          bookId={bookId}
                          job={job}
                          onDelete={() => handleDeleteJob(job)}
                          isDeleting={deletingId === job.id}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        )}
      </TabsPanel>
    </Tabs>
  )
}
