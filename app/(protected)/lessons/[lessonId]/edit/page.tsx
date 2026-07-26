"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { LessonFullView } from "@/lib/db/getLessonFull"

interface Props {
  params: Promise<{ lessonId: string }>
}

type Dialogue = LessonFullView["dialogues"][number]
type DialogueLine = Dialogue["lines"][number]
type VocabularyEntry = LessonFullView["vocabulary"][number]
type GrammarPoint = LessonFullView["grammarPoints"][number]
type GrammarExample = GrammarPoint["examples"][number]

let tempIdCounter = 0
function tempId() {
  tempIdCounter += 1
  return `temp-${tempIdCounter}`
}

function emptyLine(order: number): DialogueLine {
  return { id: tempId(), order, speakerZh: null, speakerPinyin: null, textZh: "", pinyin: null, translationVi: null }
}

function emptyDialogue(order: number): Dialogue {
  return { id: tempId(), order, titleZh: null, titleVi: null, audioCode: null, audioUrl: null, lines: [emptyLine(1)] }
}

function emptyVocab(order: number): VocabularyEntry {
  return { id: tempId(), order, wordZh: "", pinyin: null, meaningVi: null, audioUrl: null }
}

function emptyExample(order: number): GrammarExample {
  return { id: tempId(), order, textZh: "", pinyin: null, translationVi: null }
}

function emptyGrammarPoint(order: number): GrammarPoint {
  return { id: tempId(), order, titleZh: "", titleVi: null, structureNote: null, examples: [emptyExample(1)] }
}

// Rows added in this editor get a client-only "temp-*" id so React has a
// stable key; the API only treats an id as real when it isn't temp-prefixed,
// everything else is submitted with id: null so the server INSERTs it.
function toApiId(id: string): string | null {
  return id.startsWith("temp-") ? null : id
}

export default function LessonEditPage({ params }: Props) {
  const { lessonId } = use(params)
  const router = useRouter()

  const [data, setData] = useState<LessonFullView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được bài học.")
      }
      const json: LessonFullView = await res.json()
      setData(json)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được bài học.")
    } finally {
      setIsLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function handleSave() {
    if (!data) return
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const payload = {
        titleZh: data.titleZh,
        titleVi: data.titleVi,
        theme: data.theme,
        dialogues: data.dialogues.map((d) => ({ ...d, id: toApiId(d.id), lines: d.lines.map((l) => ({ ...l, id: toApiId(l.id) })) })),
        vocabulary: data.vocabulary.map((v) => ({ ...v, id: toApiId(v.id) })),
        grammarPoints: data.grammarPoints.map((g) => ({
          ...g,
          id: toApiId(g.id),
          examples: g.examples.map((e) => ({ ...e, id: toApiId(e.id) })),
        })),
      }
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu thất bại.")
      }
      setSaveSuccess(true)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Lưu thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  function updateLesson(patch: Partial<Pick<LessonFullView, "titleZh" | "titleVi" | "theme">>) {
    setData((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function updateDialogue(dIdx: number, patch: Partial<Dialogue>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => (i === dIdx ? { ...d, ...patch } : d))
      return { ...prev, dialogues }
    })
  }

  function addDialogue() {
    setData((prev) =>
      prev ? { ...prev, dialogues: [...prev.dialogues, emptyDialogue(prev.dialogues.length + 1)] } : prev
    )
  }

  function removeDialogue(dIdx: number) {
    setData((prev) => (prev ? { ...prev, dialogues: prev.dialogues.filter((_, i) => i !== dIdx) } : prev))
  }

  function updateDialogueLine(dIdx: number, lIdx: number, patch: Partial<DialogueLine>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => {
        if (i !== dIdx) return d
        return { ...d, lines: d.lines.map((l, j) => (j === lIdx ? { ...l, ...patch } : l)) }
      })
      return { ...prev, dialogues }
    })
  }

  function addDialogueLine(dIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: [...d.lines, emptyLine(d.lines.length + 1)] } : d
      )
      return { ...prev, dialogues }
    })
  }

  function removeDialogueLine(dIdx: number, lIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: d.lines.filter((_, j) => j !== lIdx) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function updateVocab(vIdx: number, patch: Partial<VocabularyEntry>) {
    setData((prev) => {
      if (!prev) return prev
      const vocabulary = prev.vocabulary.map((v, i) => (i === vIdx ? { ...v, ...patch } : v))
      return { ...prev, vocabulary }
    })
  }

  function addVocab() {
    setData((prev) =>
      prev ? { ...prev, vocabulary: [...prev.vocabulary, emptyVocab(prev.vocabulary.length + 1)] } : prev
    )
  }

  function removeVocab(vIdx: number) {
    setData((prev) => (prev ? { ...prev, vocabulary: prev.vocabulary.filter((_, i) => i !== vIdx) } : prev))
  }

  function updateGrammar(gIdx: number, patch: Partial<GrammarPoint>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => (i === gIdx ? { ...g, ...patch } : g))
      return { ...prev, grammarPoints }
    })
  }

  function addGrammar() {
    setData((prev) =>
      prev
        ? { ...prev, grammarPoints: [...prev.grammarPoints, emptyGrammarPoint(prev.grammarPoints.length + 1)] }
        : prev
    )
  }

  function removeGrammar(gIdx: number) {
    setData((prev) =>
      prev ? { ...prev, grammarPoints: prev.grammarPoints.filter((_, i) => i !== gIdx) } : prev
    )
  }

  function updateGrammarExample(gIdx: number, eIdx: number, patch: Partial<GrammarExample>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return { ...g, examples: g.examples.map((e, j) => (j === eIdx ? { ...e, ...patch } : e)) }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addGrammarExample(gIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, examples: [...g.examples, emptyExample(g.examples.length + 1)] } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function removeGrammarExample(gIdx: number, eIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, examples: g.examples.filter((_, j) => j !== eIdx) } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? "Không tìm thấy bài học."}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-16">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Sửa Bài {data.lessonNo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
          <Button variant="outline" nativeButton={false} onClick={() => router.push(`/lessons/${lessonId}`)}>
            Quay lại
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Thông tin bài học</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleZh">Tiêu đề (Trung)</Label>
            <Input id="titleZh" value={data.titleZh} onChange={(e) => updateLesson({ titleZh: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titleVi">Tiêu đề (Việt)</Label>
            <Input id="titleVi" value={data.titleVi} onChange={(e) => updateLesson({ titleVi: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="theme">Chủ đề</Label>
            <Input
              id="theme"
              value={data.theme ?? ""}
              onChange={(e) => updateLesson({ theme: e.target.value || null })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Bài khoá ({data.dialogues.length})</h2>
          <Button type="button" variant="ghost" size="sm" onClick={addDialogue}>
            + Thêm hội thoại
          </Button>
        </div>
        <Accordion>
          {data.dialogues.map((dialogue, dIdx) => (
            <AccordionItem key={dialogue.id} value={dialogue.id}>
              <AccordionTrigger>
                Hội thoại {dIdx + 1}
                {dialogue.titleVi ? ` — ${dialogue.titleVi}` : dialogue.titleZh ? ` — ${dialogue.titleZh}` : ""}
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Tiêu đề (Trung)</Label>
                      <Input
                        value={dialogue.titleZh ?? ""}
                        onChange={(e) => updateDialogue(dIdx, { titleZh: e.target.value || null })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Tiêu đề (Việt)</Label>
                      <Input
                        value={dialogue.titleVi ?? ""}
                        onChange={(e) => updateDialogue(dIdx, { titleVi: e.target.value || null })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Mã audio</Label>
                      <Input
                        value={dialogue.audioCode ?? ""}
                        onChange={(e) => updateDialogue(dIdx, { audioCode: e.target.value || null })}
                      />
                    </div>
                  </div>

                  {dialogue.audioUrl && (
                    <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                  )}

                  <div className="flex flex-col gap-2">
                    {dialogue.lines.map((line, lIdx) => (
                      <div key={line.id} className="rounded-md border bg-muted/20 p-2.5">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Người nói (Trung)"
                            value={line.speakerZh ?? ""}
                            onChange={(e) => updateDialogueLine(dIdx, lIdx, { speakerZh: e.target.value || null })}
                          />
                          <Input
                            placeholder="Người nói (pinyin)"
                            value={line.speakerPinyin ?? ""}
                            onChange={(e) =>
                              updateDialogueLine(dIdx, lIdx, { speakerPinyin: e.target.value || null })
                            }
                          />
                        </div>
                        <Textarea
                          className="mt-2"
                          placeholder="Câu thoại (Trung)"
                          value={line.textZh}
                          onChange={(e) => updateDialogueLine(dIdx, lIdx, { textZh: e.target.value })}
                        />
                        <Input
                          className="mt-2"
                          placeholder="Pinyin"
                          value={line.pinyin ?? ""}
                          onChange={(e) => updateDialogueLine(dIdx, lIdx, { pinyin: e.target.value || null })}
                        />
                        <Textarea
                          className="mt-2"
                          placeholder="Dịch (Việt)"
                          value={line.translationVi ?? ""}
                          onChange={(e) =>
                            updateDialogueLine(dIdx, lIdx, { translationVi: e.target.value || null })
                          }
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDialogueLine(dIdx, lIdx)}
                          >
                            Xoá câu
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addDialogueLine(dIdx)}>
                      + Thêm câu thoại
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeDialogue(dIdx)}
                    >
                      Xoá hội thoại
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.dialogues.length === 0 && <p className="text-xs text-muted-foreground">Chưa có hội thoại nào.</p>}
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Từ vựng ({data.vocabulary.length})</h2>
          <Button type="button" variant="ghost" size="sm" onClick={addVocab}>
            + Thêm từ
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {data.vocabulary.map((vocab, vIdx) => (
            <div key={vocab.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Từ (Trung)"
                  value={vocab.wordZh}
                  onChange={(e) => updateVocab(vIdx, { wordZh: e.target.value })}
                />
                <Input
                  placeholder="Pinyin"
                  value={vocab.pinyin ?? ""}
                  onChange={(e) => updateVocab(vIdx, { pinyin: e.target.value || null })}
                />
                <Input
                  placeholder="Nghĩa (Việt)"
                  value={vocab.meaningVi ?? ""}
                  onChange={(e) => updateVocab(vIdx, { meaningVi: e.target.value || null })}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeVocab(vIdx)}>
                    Xoá
                  </Button>
                </div>
              </div>
              {vocab.audioUrl && <audio controls preload="none" src={vocab.audioUrl} className="h-8 max-w-[12rem]" />}
            </div>
          ))}
          {data.vocabulary.length === 0 && <p className="text-xs text-muted-foreground">Chưa có từ vựng nào.</p>}
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ngữ pháp ({data.grammarPoints.length})</h2>
          <Button type="button" variant="ghost" size="sm" onClick={addGrammar}>
            + Thêm điểm ngữ pháp
          </Button>
        </div>
        <Accordion>
          {data.grammarPoints.map((point, gIdx) => (
            <AccordionItem key={point.id} value={point.id}>
              <AccordionTrigger>
                Ngữ pháp {gIdx + 1}
                {point.titleVi ? ` — ${point.titleVi}` : point.titleZh ? ` — ${point.titleZh}` : ""}
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>Tiêu đề (Trung)</Label>
                      <Input value={point.titleZh} onChange={(e) => updateGrammar(gIdx, { titleZh: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Tiêu đề (Việt)</Label>
                      <Input
                        value={point.titleVi ?? ""}
                        onChange={(e) => updateGrammar(gIdx, { titleVi: e.target.value || null })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Ghi chú cấu trúc</Label>
                    <Textarea
                      value={point.structureNote ?? ""}
                      onChange={(e) => updateGrammar(gIdx, { structureNote: e.target.value || null })}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    {point.examples.map((example, eIdx) => (
                      <div key={example.id} className="rounded-md border bg-muted/20 p-2.5">
                        <Textarea
                          placeholder="Câu ví dụ (Trung)"
                          value={example.textZh}
                          onChange={(e) => updateGrammarExample(gIdx, eIdx, { textZh: e.target.value })}
                        />
                        <Input
                          className="mt-2"
                          placeholder="Pinyin"
                          value={example.pinyin ?? ""}
                          onChange={(e) => updateGrammarExample(gIdx, eIdx, { pinyin: e.target.value || null })}
                        />
                        <Textarea
                          className="mt-2"
                          placeholder="Dịch (Việt)"
                          value={example.translationVi ?? ""}
                          onChange={(e) =>
                            updateGrammarExample(gIdx, eIdx, { translationVi: e.target.value || null })
                          }
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeGrammarExample(gIdx, eIdx)}
                          >
                            Xoá ví dụ
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addGrammarExample(gIdx)}>
                      + Thêm ví dụ
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeGrammar(gIdx)}
                    >
                      Xoá điểm ngữ pháp
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.grammarPoints.length === 0 && (
          <p className="text-xs text-muted-foreground">Chưa có điểm ngữ pháp nào.</p>
        )}
      </section>
    </main>
  )
}
