import { notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { LessonStatusControls } from "./status-controls"
import type {
  Dialogue,
  DialogueLine,
  GrammarExample,
  GrammarPoint,
  Lesson,
  VocabularyEntry,
} from "@/lib/db/types"

interface Props {
  params: Promise<{ lessonId: string }>
}

export default async function LessonDetailPage({ params }: Props) {
  const { lessonId } = await params
  const supabase = createServerSupabase()

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single()

  if (!lesson) {
    notFound()
  }

  const lessonRow = lesson as Lesson

  const [{ data: dialogues }, { data: vocabulary }, { data: grammarPoints }] =
    await Promise.all([
      supabase
        .from("dialogues")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order", { ascending: true }),
      supabase
        .from("vocabulary")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order", { ascending: true }),
      supabase
        .from("grammar_points")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order", { ascending: true }),
    ])

  const dialogueRows = (dialogues ?? []) as Dialogue[]
  const vocabRows = (vocabulary ?? []) as VocabularyEntry[]
  const grammarRows = (grammarPoints ?? []) as GrammarPoint[]

  const dialogueIds = dialogueRows.map((d) => d.id)
  const grammarIds = grammarRows.map((g) => g.id)

  const [{ data: dialogueLines }, { data: grammarExamples }] = await Promise.all([
    dialogueIds.length > 0
      ? supabase
          .from("dialogue_lines")
          .select("*")
          .in("dialogue_id", dialogueIds)
          .order("order", { ascending: true })
      : Promise.resolve({ data: [] as DialogueLine[] }),
    grammarIds.length > 0
      ? supabase
          .from("grammar_examples")
          .select("*")
          .in("grammar_point_id", grammarIds)
          .order("order", { ascending: true })
      : Promise.resolve({ data: [] as GrammarExample[] }),
  ])

  const linesByDialogue = new Map<string, DialogueLine[]>()
  for (const line of (dialogueLines ?? []) as DialogueLine[]) {
    const list = linesByDialogue.get(line.dialogue_id) ?? []
    list.push(line)
    linesByDialogue.set(line.dialogue_id, list)
  }

  const examplesByGrammar = new Map<string, GrammarExample[]>()
  for (const example of (grammarExamples ?? []) as GrammarExample[]) {
    const list = examplesByGrammar.get(example.grammar_point_id) ?? []
    list.push(example)
    examplesByGrammar.set(example.grammar_point_id, list)
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div>
          <h1 className="text-lg font-semibold">
            Bài {lessonRow.lesson_no}: {lessonRow.title_vi || lessonRow.title_zh}
          </h1>
          {lessonRow.theme && (
            <p className="text-sm text-muted-foreground">{lessonRow.theme}</p>
          )}
        </div>
        <LessonStatusControls lessonId={lessonRow.id} status={lessonRow.status} />
      </div>

      {lessonRow.objectives?.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Mục tiêu</h2>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {lessonRow.objectives.map((objective, idx) => (
              <li key={idx}>{objective}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">Bài khoá ({dialogueRows.length})</h2>
        {dialogueRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có bài khoá nào.</p>
        ) : (
          <Card>
            <CardContent className="px-4">
              <Accordion>
                {dialogueRows.map((dialogue, idx) => {
                  const lines = linesByDialogue.get(dialogue.id) ?? []
                  return (
                    <AccordionItem key={dialogue.id} value={dialogue.id}>
                      <AccordionTrigger>
                        Hội thoại {idx + 1}
                        {dialogue.title_vi
                          ? ` — ${dialogue.title_vi}`
                          : dialogue.title_zh
                            ? ` — ${dialogue.title_zh}`
                            : ""}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col gap-3">
                          {dialogue.audio_url && (
                            <audio
                              controls
                              preload="none"
                              src={dialogue.audio_url}
                              className="h-8 w-full max-w-sm"
                            />
                          )}
                          <div className="flex flex-col gap-2">
                            {lines.map((line) => (
                              <div key={line.id} className="rounded-md border bg-muted/20 p-2.5">
                                {line.speaker_zh && (
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {line.speaker_zh}
                                    {line.speaker_pinyin ? ` (${line.speaker_pinyin})` : ""}
                                  </p>
                                )}
                                <p className="text-sm font-medium">{line.text_zh}</p>
                                {line.pinyin && (
                                  <p className="text-sm text-muted-foreground">{line.pinyin}</p>
                                )}
                                {line.translation_vi && (
                                  <p className="text-sm">{line.translation_vi}</p>
                                )}
                              </div>
                            ))}
                            {lines.length === 0 && (
                              <p className="text-xs text-muted-foreground">Chưa có câu thoại nào.</p>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Từ vựng ({vocabRows.length})</h2>
        {vocabRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có từ vựng nào.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {vocabRows.map((vocab) => (
              <Card key={vocab.id} size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {vocab.word_zh}
                      {vocab.pinyin ? ` · ${vocab.pinyin}` : ""}
                      {vocab.zhuyin ? ` · ${vocab.zhuyin}` : ""}
                    </p>
                    {vocab.meaning_vi && (
                      <p className="text-sm text-muted-foreground">{vocab.meaning_vi}</p>
                    )}
                    {vocab.category && (
                      <p className="text-xs text-muted-foreground">{vocab.category}</p>
                    )}
                  </div>
                  {vocab.audio_url && (
                    <audio controls preload="none" src={vocab.audio_url} className="h-8 max-w-[12rem]" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Ngữ pháp ({grammarRows.length})</h2>
        {grammarRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có điểm ngữ pháp nào.</p>
        ) : (
          <Card>
            <CardContent className="px-4">
              <Accordion>
                {grammarRows.map((point, idx) => {
                  const examples = examplesByGrammar.get(point.id) ?? []
                  return (
                    <AccordionItem key={point.id} value={point.id}>
                      <AccordionTrigger>
                        Ngữ pháp {idx + 1}
                        {point.title_vi ? ` — ${point.title_vi}` : ` — ${point.title_zh}`}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col gap-3">
                          {point.structure_note && (
                            <p className="text-sm text-muted-foreground">{point.structure_note}</p>
                          )}
                          <div className="flex flex-col gap-2">
                            {examples.map((example) => (
                              <div key={example.id} className="rounded-md border bg-muted/20 p-2.5">
                                <p className="text-sm font-medium">{example.text_zh}</p>
                                {example.pinyin && (
                                  <p className="text-sm text-muted-foreground">{example.pinyin}</p>
                                )}
                                {example.translation_vi && (
                                  <p className="text-sm">{example.translation_vi}</p>
                                )}
                              </div>
                            ))}
                            {examples.length === 0 && (
                              <p className="text-xs text-muted-foreground">Chưa có ví dụ nào.</p>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  )
}
