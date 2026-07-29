import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { LessonStatusControls } from "./status-controls"
import { getLessonFull } from "@/lib/db/getLessonFull"
import { BackLink } from "@/components/back-link"
import { dialogueDisplayNames } from "@/lib/dialogueDisplayName"

interface Props {
  params: Promise<{ lessonId: string }>
}

function VocabTable({
  vocabulary,
}: {
  vocabulary: { id: string; wordZh: string; pinyin: string | null; meaningVi: string | null; audioUrl: string | null }[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Chữ Hán</TableHead>
          <TableHead className="w-32">Pinyin</TableHead>
          <TableHead>Nghĩa</TableHead>
          <TableHead className="w-40 text-right">Audio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vocabulary.map((vocab) => (
          <TableRow key={vocab.id}>
            <TableCell className="text-lg font-bold text-foreground">{vocab.wordZh}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{vocab.pinyin}</TableCell>
            <TableCell className="text-base text-foreground/80">{vocab.meaningVi}</TableCell>
            <TableCell className="text-right">
              {vocab.audioUrl && (
                <audio controls preload="none" src={vocab.audioUrl} className="ml-auto h-7 max-w-[9rem]" />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ExampleBlock({
  example,
}: {
  example: { id: string; textZh: string; pinyin: string | null; translationVi: string | null }
}) {
  return (
    <div className="border-l-2 border-primary/40 py-1 pl-4">
      <p className="text-lg font-semibold text-foreground">{example.textZh}</p>
      {example.pinyin && <p className="text-sm whitespace-pre-line text-muted-foreground">{example.pinyin}</p>}
      {example.translationVi && <p className="text-base text-foreground/80">{example.translationVi}</p>}
    </div>
  )
}

function SectionBlock({
  section,
}: {
  section: {
    id: string
    label: string
    content: string | null
    examples: { id: string; textZh: string; pinyin: string | null; translationVi: string | null }[]
    items: {
      id: string
      label: string
      content: string | null
      examples: { id: string; textZh: string; pinyin: string | null; translationVi: string | null }[]
    }[]
  }
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <Badge variant="outline" className="w-fit px-3 py-1 text-base font-bold">
        {section.label}
      </Badge>
      {section.content && (
        <p className="text-base leading-relaxed whitespace-pre-line text-foreground/90">{section.content}</p>
      )}
      {section.examples.length > 0 && (
        <div className="flex flex-col gap-3">
          {section.examples.map((example) => (
            <ExampleBlock key={example.id} example={example} />
          ))}
        </div>
      )}
      {section.items.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <p className="text-sm font-bold text-foreground">{item.label}.</p>
          {item.content && (
            <p className="text-base leading-relaxed whitespace-pre-line text-foreground/90">{item.content}</p>
          )}
          <div className="flex flex-col gap-3">
            {item.examples.map((example) => (
              <ExampleBlock key={example.id} example={example} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function LessonDetailPage({ params }: Props) {
  const { lessonId } = await params
  const lesson = await getLessonFull(lessonId)

  if (!lesson) {
    notFound()
  }

  const dialogueLabels = dialogueDisplayNames(lesson.dialogues)

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/books/${lesson.bookId}`} label="Quay lại sách" />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Bài {lesson.lessonNo}: {lesson.titleVi || lesson.titleZh}
          </h1>
          {lesson.theme && <p className="text-sm text-muted-foreground">{lesson.theme}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lesson.status === "draft" && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/lessons/${lesson.id}/edit`}>Sửa</Link>}
            />
          )}
          <LessonStatusControls lessonId={lesson.id} status={lesson.status} />
        </div>
      </div>

      {lesson.objectives.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Mục tiêu
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
            {lesson.objectives.map((objective, idx) => (
              <li key={idx}>{objective}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Bài khoá ({lesson.dialogues.length})
        </h2>
        {lesson.dialogues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có bài khoá nào.</p>
        ) : (
          <Accordion className="flex flex-col gap-3">
            {lesson.dialogues.map((dialogue, idx) => (
              <AccordionItem key={dialogue.id} value={dialogue.id} className="rounded-lg border bg-card px-4">
                <AccordionTrigger>{dialogueLabels[idx]}</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-6">
                    {dialogue.audioUrl && (
                      <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                    )}
                    {dialogue.kind === "passage" ? (
                      dialogue.lines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Chưa có câu văn nào.</p>
                      ) : (
                        <div className="rounded-lg border bg-muted/30 p-4">
                          <p className="text-xl leading-relaxed font-semibold text-foreground">
                            {dialogue.lines.map((line) => (
                              <span key={line.id}>{line.textZh}</span>
                            ))}
                          </p>
                          <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
                            {dialogue.lines.map((line) => (
                              <div key={line.id}>
                                {line.pinyin && (
                                  <p className="text-sm whitespace-pre-line text-muted-foreground">{line.pinyin}</p>
                                )}
                                {line.translationVi && <p className="text-base">{line.translationVi}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-3">
                        {dialogue.lines.map((line) => (
                          <div key={line.id} className="rounded-lg border bg-card p-3">
                            {line.speakerZh && (
                              <p className="mb-1 inline-block w-fit rounded-md bg-muted/50 px-2 py-1 text-xs font-semibold text-foreground/80">
                                {line.speakerZh}
                                {line.speakerPinyin ? ` (${line.speakerPinyin})` : ""}
                              </p>
                            )}
                            <p className="text-xl leading-snug font-semibold text-foreground">{line.textZh}</p>
                            {line.pinyin && (
                              <p className="text-sm whitespace-pre-line text-muted-foreground">{line.pinyin}</p>
                            )}
                            {line.translationVi && <p className="text-base">{line.translationVi}</p>}
                          </div>
                        ))}
                        {dialogue.lines.length === 0 && (
                          <p className="text-xs text-muted-foreground">Chưa có câu thoại nào.</p>
                        )}
                      </div>
                    )}

                    <div>
                      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Từ mới ({dialogue.vocabulary.length})
                      </h3>
                      {dialogue.vocabulary.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                      ) : (
                        <div className="rounded-lg border">
                          <VocabTable vocabulary={dialogue.vocabulary} />
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Ngữ pháp ({lesson.grammarPoints.length})
        </h2>
        {lesson.grammarPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có điểm ngữ pháp nào.</p>
        ) : (
          <Accordion className="flex flex-col gap-3">
            {lesson.grammarPoints.map((point, idx) => (
              <AccordionItem key={point.id} value={point.id} className="rounded-lg border bg-card px-4">
                <AccordionTrigger>
                  <div className="text-left">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Ngữ pháp {idx + 1}
                    </p>
                    <p className="text-xl font-bold text-foreground">{point.titleVi || "Chưa có tiêu đề"}</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-4 pb-2">
                    {point.sections.map((section) => (
                      <SectionBlock key={section.id} section={section} />
                    ))}

                    {point.subPoints.map((sub) => (
                      <div key={sub.id} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
                        <p className="text-lg font-bold text-foreground">
                          {sub.label}.{sub.titleVi ? ` ${sub.titleVi}` : ""}
                        </p>
                        {sub.sections.map((section) => (
                          <SectionBlock key={section.id} section={section} />
                        ))}
                      </div>
                    ))}

                    {point.sections.length === 0 && point.subPoints.length === 0 && (
                      <p className="text-xs text-muted-foreground">Chưa có ví dụ nào.</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
      </main>
    </>
  )
}
