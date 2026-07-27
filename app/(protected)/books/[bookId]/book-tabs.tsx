"use client"

import Link from "next/link"
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
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

function JobCard({ bookId, job }: { bookId: string; job: ExtractionJob }) {
  return (
    <Link href={`/books/${bookId}/jobs/${job.id}`}>
      <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
        <CardHeader>
          <CardTitle>
            Bài {job.lesson_no} · Trang {job.page_start}–{job.page_end}
          </CardTitle>
          <CardDescription>
            <Badge variant={jobStatusVariant[job.status]}>{jobStatusLabel[job.status]}</Badge>
          </CardDescription>
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
  const activeJobs = jobs.filter((job) => job.status !== "imported")
  const importedJobs = jobs.filter((job) => job.status === "imported")

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
          <div className="flex flex-col gap-3">
            {lessons.map((lesson) => (
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
      </TabsPanel>

      <TabsPanel value="jobs">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chưa có công việc trích xuất nào.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {activeJobs.map((job) => (
              <JobCard key={job.id} bookId={bookId} job={job} />
            ))}

            {importedJobs.length > 0 && (
              <Accordion>
                <AccordionItem value="imported-jobs">
                  <AccordionTrigger className="text-sm text-muted-foreground">
                    Đã nhập ({importedJobs.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-3">
                      {importedJobs.map((job) => (
                        <JobCard key={job.id} bookId={bookId} job={job} />
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
