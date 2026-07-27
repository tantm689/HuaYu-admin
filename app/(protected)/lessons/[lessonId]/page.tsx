import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { LessonStatusControls } from "./status-controls"
import { getLessonFull } from "@/lib/db/getLessonFull"

interface Props {
  params: Promise<{ lessonId: string }>
}

export default async function LessonDetailPage({ params }: Props) {
  const { lessonId } = await params
  const lesson = await getLessonFull(lessonId)

  if (!lesson) {
    notFound()
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
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
          <Card>
            <CardContent className="px-4">
              <Accordion>
                {lesson.dialogues.map((dialogue, idx) => (
                  <AccordionItem key={dialogue.id} value={dialogue.id}>
                    <AccordionTrigger>
                      Hội thoại {idx + 1}
                      {dialogue.titleVi
                        ? ` — ${dialogue.titleVi}`
                        : dialogue.titleZh
                          ? ` — ${dialogue.titleZh}`
                          : ""}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-3">
                        {dialogue.audioUrl && (
                          <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                        )}
                        <div className="flex flex-col gap-2">
                          {dialogue.lines.map((line) => (
                            <div key={line.id} className="rounded-md border bg-muted/20 p-2.5">
                              {line.speakerZh && (
                                <p className="text-xs font-medium text-muted-foreground">
                                  {line.speakerZh}
                                  {line.speakerPinyin ? ` (${line.speakerPinyin})` : ""}
                                </p>
                              )}
                              <p className="text-sm font-medium">{line.textZh}</p>
                              {line.pinyin && <p className="text-sm text-muted-foreground">{line.pinyin}</p>}
                              {line.translationVi && <p className="text-sm">{line.translationVi}</p>}
                            </div>
                          ))}
                          {dialogue.lines.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa có câu thoại nào.</p>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Từ vựng ({lesson.vocabulary.length})
        </h2>
        {lesson.vocabulary.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có từ vựng nào.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {lesson.vocabulary.map((vocab) => (
              <Card key={vocab.id} size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {vocab.wordZh}
                      {vocab.pinyin ? ` · ${vocab.pinyin}` : ""}
                    </p>
                    {vocab.meaningVi && <p className="text-sm text-muted-foreground">{vocab.meaningVi}</p>}
                  </div>
                  {vocab.audioUrl && (
                    <audio controls preload="none" src={vocab.audioUrl} className="h-8 max-w-[12rem]" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Ngữ pháp ({lesson.grammarPoints.length})
        </h2>
        {lesson.grammarPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có điểm ngữ pháp nào.</p>
        ) : (
          <Card>
            <CardContent className="px-4">
              <Accordion>
                {lesson.grammarPoints.map((point, idx) => (
                  <AccordionItem key={point.id} value={point.id}>
                    <AccordionTrigger>
                      Ngữ pháp {idx + 1}
                      {point.titleVi ? ` — ${point.titleVi}` : ` — ${point.titleZh}`}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-3">
                        {point.structureNote && (
                          <p className="text-sm whitespace-pre-line text-muted-foreground">
                            {point.structureNote}
                          </p>
                        )}
                        <div className="flex flex-col gap-2">
                          {point.examples.map((example) => (
                            <div key={example.id} className="rounded-md border bg-muted/20 p-2.5">
                              <p className="text-sm font-medium">{example.textZh}</p>
                              {example.pinyin && <p className="text-sm text-muted-foreground">{example.pinyin}</p>}
                              {example.translationVi && <p className="text-sm">{example.translationVi}</p>}
                            </div>
                          ))}
                        </div>

                        {point.subPoints.map((sub) => (
                          <div key={sub.id} className="flex flex-col gap-2 rounded-md border p-3">
                            <p className="text-sm font-semibold">
                              {sub.label}.{sub.titleVi ? ` ${sub.titleVi}` : sub.titleZh ? ` ${sub.titleZh}` : ""}
                            </p>
                            {sub.structureNote && (
                              <p className="text-sm whitespace-pre-line text-muted-foreground">
                                {sub.structureNote}
                              </p>
                            )}
                            <div className="flex flex-col gap-2">
                              {sub.examples.map((example) => (
                                <div key={example.id} className="rounded-md border bg-muted/20 p-2.5">
                                  <p className="text-sm font-medium">{example.textZh}</p>
                                  {example.pinyin && (
                                    <p className="text-sm text-muted-foreground">{example.pinyin}</p>
                                  )}
                                  {example.translationVi && <p className="text-sm">{example.translationVi}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {point.examples.length === 0 && point.subPoints.length === 0 && (
                          <p className="text-xs text-muted-foreground">Chưa có ví dụ nào.</p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  )
}
