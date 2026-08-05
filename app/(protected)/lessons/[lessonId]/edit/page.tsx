"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs"
import { moveItem } from "@/lib/moveItem"
import { canMoveWithinPart, moveQuestionWithinPart } from "@/lib/quizReorder"
import { EditableText } from "@/components/editable-text"
import { LessonStatusControls } from "@/app/(protected)/lessons/[lessonId]/status-controls"
import { BackLink } from "@/components/back-link"
import { BlockActions } from "@/components/block-actions"
import GrammarMarkdownEditor from "@/components/grammar-markdown-editor"
import { splitGrammarMarkdown } from "@/lib/grammarMarkdownSections"
import { DialogueLineBlock } from "@/components/dialogue-line-block"
import { VocabRow } from "@/components/vocab-row"
import type { LessonFullView } from "@/lib/db/getLessonFull"
import type { QuizQuestionType } from "@/lib/db/types"
import { dialogueDisplayNames } from "@/lib/dialogueDisplayName"
import type { TtsVoice } from "@/lib/tts/generateAudio"

const VOICE_OPTIONS: { value: TtsVoice; label: string }[] = [
  { value: "zh-TW-HsiaoChenNeural", label: "Hiểu Trân (nữ)" },
  { value: "zh-TW-YunJheNeural", label: "Vân Triết (nam)" },
]

interface Props {
  params: Promise<{ lessonId: string }>
}

type Dialogue = LessonFullView["dialogues"][number]
type DialogueLine = Dialogue["lines"][number]
type VocabularyEntry = Dialogue["vocabulary"][number]

let tempIdCounter = 0
function tempId() {
  tempIdCounter += 1
  return `temp-${tempIdCounter}`
}

function emptyLine(order: number): DialogueLine {
  return {
    id: tempId(),
    order,
    speakerZh: null,
    speakerPinyin: null,
    textZh: "",
    pinyin: null,
    translationVi: null,
    audioUrl: null,
    startTime: null,
    endTime: null,
  }
}

function emptyDialogue(order: number): Dialogue {
  return {
    id: tempId(),
    order,
    kind: "dialogue",
    audioCode: null,
    audioUrl: null,
    lines: [emptyLine(1)],
    vocabulary: [],
  }
}

function emptyVocab(order: number): VocabularyEntry {
  return { id: tempId(), order, wordZh: "", pinyin: null, meaningVi: null, audioUrl: null }
}

// Rows added in this editor get a client-only "temp-*" id so React has a
// stable key; the API only treats an id as real when it isn't temp-prefixed,
// everything else is submitted with id: null so the server INSERTs it.
function toApiId(id: string): string | null {
  return id.startsWith("temp-") ? null : id
}

// The DB row's `payload` only holds the type-specific fields (part/type/
// order live as separate columns) - this reconstructs the same discriminated
// shape the old job-scoped quiz page's QuestionCard rendered, so that
// component's per-type branches can be reused verbatim here.
type QuizQuestionView = {
  id: string
  part: 1 | 2
  order: number
} & (
  | { type: "pinyin_choice"; prompt: string; choices: string[]; correctIndex: number }
  | { type: "listening_choice"; audioUrl: string; choices: string[]; correctIndex: number }
  | { type: "tone_choice"; wordZh: string; pinyinNoTone: string; choices: string[]; correctIndex: number }
  | { type: "matching"; pairs: { left: string; right: string }[] }
  | { type: "fill_blank"; sentence: string; choices: string[]; correctIndex: number }
  | { type: "sentence_order"; words: string[]; correctOrder: number[] }
)

const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  pinyin_choice: "Chọn Pinyin/Chữ Hán",
  listening_choice: "Nghe & chọn đáp án",
  tone_choice: "Nhận biết thanh điệu",
  matching: "Ghép nghĩa",
  fill_blank: "Điền từ vào chỗ trống",
  sentence_order: "Sắp xếp câu",
}

function toQuizQuestionView(row: {
  id: string
  part: 1 | 2
  type: QuizQuestionType
  order: number
  payload: unknown
}): QuizQuestionView {
  return { id: row.id, part: row.part, order: row.order, type: row.type, ...(row.payload as object) } as QuizQuestionView
}

function QuizQuestionCard({
  question,
  editable,
  onChangePayload,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  question: QuizQuestionView
  editable: boolean
  onChangePayload: (patch: Record<string, unknown>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="group/question relative flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors has-[[data-danger]:hover]:border-destructive has-[[data-danger]:hover]:bg-destructive/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {QUIZ_TYPE_LABELS[question.type]}
        </span>
        {editable && (
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            removeLabel="Xoá câu hỏi"
            className="group-hover/question:opacity-100"
          />
        )}
      </div>

      {question.type === "pinyin_choice" && (
        <>
          <EditableText
            value={question.prompt}
            onChange={(prompt) => onChangePayload({ prompt })}
            className="field-zh"
            disabled={!editable}
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "listening_choice" && (
        <>
          <audio controls preload="none" src={question.audioUrl} className="h-8 w-full max-w-xs" />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "tone_choice" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <EditableText
              value={question.wordZh}
              onChange={(wordZh) => onChangePayload({ wordZh })}
              className="field-zh"
              disabled={!editable}
            />
            <EditableText
              value={question.pinyinNoTone}
              onChange={(pinyinNoTone) => onChangePayload({ pinyinNoTone })}
              className="w-auto"
              disabled={!editable}
            />
          </div>
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "matching" && (
        <div className="flex flex-col gap-1">
          {question.pairs.map((pair, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <EditableText
                value={pair.left}
                onChange={(left) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], left }
                  onChangePayload({ pairs })
                }}
                className="field-zh"
                disabled={!editable}
              />
              <EditableText
                value={pair.right}
                onChange={(right) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], right }
                  onChangePayload({ pairs })
                }}
                className="text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <>
          <EditableText
            value={question.sentence}
            onChange={(sentence) => onChangePayload({ sentence })}
            className="field-zh"
            disabled={!editable}
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "sentence_order" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Các từ đã xáo trộn (thứ tự hiển thị cho học viên) — số bên dưới mỗi từ là vị trí đúng của từ đó
            trong câu (bắt đầu từ 1):
          </p>
          <div className="flex flex-wrap gap-2">
            {question.words.map((word, wordIdx) => {
              const correctPosition = question.correctOrder.indexOf(wordIdx)
              return (
                <div key={wordIdx} className="flex flex-col items-center gap-1 rounded-md border p-2">
                  <EditableText
                    value={word}
                    onChange={(v) => {
                      const words = [...question.words]
                      words[wordIdx] = v
                      onChangePayload({ words })
                    }}
                    className="field-zh w-auto"
                    disabled={!editable}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Vị trí đúng
                    <input
                      type="number"
                      min={1}
                      max={question.words.length}
                      value={correctPosition + 1}
                      disabled={!editable}
                      onChange={(e) => {
                        const newPosition = Number(e.target.value) - 1
                        if (
                          Number.isNaN(newPosition) ||
                          newPosition < 0 ||
                          newPosition >= question.words.length
                        ) {
                          return
                        }
                        const correctOrder = [...question.correctOrder]
                        correctOrder.splice(correctPosition, 1)
                        correctOrder.splice(newPosition, 0, wordIdx)
                        onChangePayload({ correctOrder })
                      }}
                      aria-label={`Vị trí đúng của từ "${word}" trong câu`}
                      className="h-7 w-14 rounded-md border bg-background px-1 text-center text-sm"
                    />
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LessonEditPage({ params }: Props) {
  const { lessonId } = use(params)

  const [data, setData] = useState<LessonFullView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [audioVoice, setAudioVoice] = useState<TtsVoice>(VOICE_OPTIONS[0].value)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [audioActionError, setAudioActionError] = useState<string | null>(null)
  const [regeneratingAudioId, setRegeneratingAudioId] = useState<string | null>(null)

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionView[] | null>(null)
  const [generatingQuizPart, setGeneratingQuizPart] = useState<1 | 2 | null>(null)
  const [quizActionError, setQuizActionError] = useState<string | null>(null)
  const [quizFallbackWarning, setQuizFallbackWarning] = useState<string | null>(null)

  const hasLoadedOnce = useRef(false)

  const load = useCallback(async () => {
    // Only show the full-page "Đang tải..." screen on the initial load, when
    // there's nothing on screen yet. Every later call (after saving, or
    // regenerating audio/quiz) refetches in the background instead - toggling
    // isLoading here would swap the whole page out and back in, which reads
    // as an unwanted page refresh even though nothing actually reloaded.
    if (!hasLoadedOnce.current) setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được bài học.")
      }
      const json: LessonFullView = await res.json()
      setData(json)
      hasLoadedOnce.current = true
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

  // Quiz questions live in their own table (not covered by LessonFullView), so
  // they need a separate fetch alongside the main `load()`. The GET route
  // returns rows unsorted, hence the client-side sort by `order`.
  const loadQuiz = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz`)
      if (!res.ok) return
      const rows: {
        id: string
        part: 1 | 2
        type: QuizQuestionType
        order: number
        payload: unknown
      }[] = await res.json()
      setQuizQuestions(rows.map(toQuizQuestionView).sort((a, b) => a.part - b.part || a.order - b.order))
    } catch {
      // Quiz questions are optional content; a failed load here shouldn't
      // block the rest of the page, which already loaded via `load()`.
    }
  }, [lessonId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuiz()
  }, [loadQuiz])

  // Builds the PATCH payload from current form state and sends it - shared
  // by the plain "Lưu" flow and the "Xuất bản" flow (which saves content
  // and flips status to published in one click, so a draft never needs a
  // separate save step first). Throws on failure; callers decide how to
  // present that (setSaveError vs a status-specific error state).
  async function saveLessonContent() {
    if (!data) return
    const payload = {
      titleZh: data.titleZh,
      titleVi: data.titleVi,
      theme: data.theme,
      objectives: data.objectives,
      dialogues: data.dialogues.map((d) => ({
        ...d,
        id: toApiId(d.id),
        lines: d.lines.map((l) => ({ ...l, id: toApiId(l.id) })),
        vocabulary: d.vocabulary.map((v) => ({ ...v, id: toApiId(v.id) })),
      })),
      grammarMarkdown: data.grammarMarkdown ?? "",
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
  }

  // "Xuất bản" on a draft does both steps in one click: save whatever's
  // currently in the form, then flip status to published - skipping the
  // old two-click "Lưu" then "Xuất bản" flow.
  async function handleSaveAndPublish() {
    if (!data) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveLessonContent()
      const res = await fetch(`/api/lessons/${lessonId}/publish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Xuất bản thất bại.")
      }
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Xuất bản thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGenerateAudio() {
    const confirmed = window.confirm(
      "Sẽ ghi đè TOÀN BỘ audio đã có của mọi từ vựng trong bài (kể cả đã tạo lại riêng), tiếp tục?"
    )
    if (!confirmed) return

    setIsGeneratingAudio(true)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: audioVoice, mode: "regenerateAll" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Sinh lại audio thất bại.")
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  async function handleRegenerateOneAudio(vocabId: string) {
    setRegeneratingAudioId(vocabId)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vocabId, voice: audioVoice }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Tạo lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Tạo lại audio thất bại.")
    } finally {
      setRegeneratingAudioId(null)
    }
  }

  async function handleGenerateQuizPart(part: 1 | 2) {
    const existingCount = (quizQuestions ?? []).filter((q) => q.part === part).length
    if (existingCount > 0) {
      const confirmed = window.confirm(
        `Sẽ xoá ${existingCount} câu hỏi Phần ${part} hiện tại (kể cả đã sửa tay) và sinh lại từ đầu, tiếp tục?`
      )
      if (!confirmed) return
    }

    setGeneratingQuizPart(part)
    setQuizActionError(null)
    setQuizFallbackWarning(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz?part=${part}`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Sinh Phần ${part} thất bại.`)
      }
      const { usedFallbackModel } = (await res.json()) as { usedFallbackModel: boolean }
      if (usedFallbackModel) {
        setQuizFallbackWarning(
          `Phần ${part} vừa được sinh bằng model dự phòng (model chính lỗi/hết quota) — nên kiểm tra kỹ hơn bình thường.`
        )
      }
      await loadQuiz()
    } catch (err) {
      setQuizActionError(err instanceof Error ? err.message : `Sinh Phần ${part} thất bại.`)
    } finally {
      setGeneratingQuizPart(null)
    }
  }

  async function updateQuizQuestionPayload(id: string, patch: Record<string, unknown>) {
    const target = (quizQuestions ?? []).find((q) => q.id === id)
    if (!target) return
    setQuizQuestions((prev) =>
      prev ? prev.map((q) => (q.id === id ? ({ ...q, ...patch } as QuizQuestionView) : q)) : prev
    )
    // `id`/`part`/`type`/`order` are their own DB columns - only the
    // type-specific remainder belongs in `payload`.
    const merged: Record<string, unknown> = { ...target, ...patch }
    for (const column of ["id", "part", "type", "order"]) delete merged[column]
    const payload = merged
    try {
      await fetch(`/api/lessons/${lessonId}/quiz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payload }),
      })
    } catch {
      setQuizActionError("Lưu thay đổi câu hỏi thất bại, thử lại.")
    }
  }

  async function removeQuizQuestion(id: string) {
    setQuizQuestions((prev) => (prev ? prev.filter((q) => q.id !== id) : prev))
    try {
      await fetch(`/api/lessons/${lessonId}/quiz?id=${id}`, { method: "DELETE" })
    } catch {
      setQuizActionError("Xoá câu hỏi thất bại, thử lại.")
      await loadQuiz()
    }
  }

  // moveQuestionWithinPart (lib/quizReorder.ts) swaps the question at `index`
  // with its nearest same-part neighbor and renumbers `order` 1..N within
  // each part - never crossing the Part 1/Part 2 boundary. Since this tab
  // writes straight to the DB per edit (no separate "Lưu" step for quiz),
  // every row whose `order` changed as a result gets persisted via `order`
  // (never `payload` - order is its own DB column, not part of payload).
  function moveQuizQuestion(id: string, direction: -1 | 1) {
    const prev = quizQuestions
    if (!prev) return
    const index = prev.findIndex((q) => q.id === id)
    if (index === -1) return
    const reordered = moveQuestionWithinPart(prev, index, direction)
    if (reordered === prev) return

    setQuizQuestions(reordered)

    const previousOrderById = new Map(prev.map((q) => [q.id, q.order]))
    for (const q of reordered) {
      if (previousOrderById.get(q.id) === q.order) continue
      fetch(`/api/lessons/${lessonId}/quiz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id, order: q.order }),
      }).catch(() => setQuizActionError("Lưu thứ tự câu hỏi thất bại, thử lại."))
    }
  }

  function updateLesson(patch: Partial<Pick<LessonFullView, "titleZh" | "titleVi" | "theme">>) {
    setData((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function updateObjective(idx: number, value: string) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.objectives.map((o, i) => (i === idx ? value : o))
      return { ...prev, objectives }
    })
  }

  function addObjective() {
    setData((prev) => (prev ? { ...prev, objectives: [...prev.objectives, ""] } : prev))
  }

  function removeObjective(idx: number) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.objectives.filter((_, i) => i !== idx)
      return { ...prev, objectives }
    })
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

  function updateVocab(dIdx: number, vIdx: number, patch: Partial<VocabularyEntry>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => {
        if (i !== dIdx) return d
        return { ...d, vocabulary: d.vocabulary.map((v, j) => (j === vIdx ? { ...v, ...patch } : v)) }
      })
      return { ...prev, dialogues }
    })
  }

  function addVocab(dIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: [...d.vocabulary, emptyVocab(d.vocabulary.length + 1)] } : d
      )
      return { ...prev, dialogues }
    })
  }

  function removeVocab(dIdx: number, vIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: d.vocabulary.filter((_, j) => j !== vIdx) } : d
      )
      return { ...prev, dialogues }
    })
  }

  // --- Reordering (shared moveItem helper renumbers `order` for us) ---

  function moveDialogueLine(dIdx: number, lIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: moveItem(d.lines, lIdx, direction) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function moveVocab(dIdx: number, vIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: moveItem(d.vocabulary, vIdx, direction) } : d
      )
      return { ...prev, dialogues }
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

  // The page is viewable at any status; every mutating control below is gated
  // on draft instead, so a published lesson can be read (and its audio played)
  // without first being sent back to draft.
  const isEditable = data.status === "draft"
  const dialogueLabels = dialogueDisplayNames(data.dialogues)

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/books/${data.bookId}`} label="Quay lại sách" />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-16">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Bài {data.lessonNo}: {data.titleVi || data.titleZh}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <LessonStatusControls lessonId={data.id} status={data.status} onStatusChange={load} />
          {isEditable && (
            <Button onClick={handleSaveAndPublish} disabled={isSaving}>
              {isSaving ? "Đang xử lý..." : "Xuất bản"}
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 border-b pb-3 text-base font-semibold text-foreground">Thông tin bài học</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tiêu đề (Trung)
            </Label>
            <EditableText
              value={data.titleZh}
              onChange={(titleZh) => updateLesson({ titleZh })}
              placeholder="Tiêu đề bài học (chữ Hán)"
              className="text-lg font-semibold text-foreground"
              disabled={!isEditable}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tiêu đề (Việt)
            </Label>
            <EditableText
              value={data.titleVi}
              onChange={(titleVi) => updateLesson({ titleVi })}
              placeholder="Tiêu đề bài học (tiếng Việt)"
              className="text-lg font-semibold text-foreground"
              disabled={!isEditable}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Chủ đề
            </Label>
            <EditableText
              value={data.theme ?? ""}
              onChange={(theme) => updateLesson({ theme: theme || null })}
              placeholder="Chủ đề của bài"
              className="text-base text-foreground/90"
              disabled={!isEditable}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mục tiêu
            </Label>
            {isEditable && (
              <button
                type="button"
                onClick={addObjective}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                + Thêm mục tiêu
              </button>
            )}
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {data.objectives.map((objective, idx) => (
              <div
                key={idx}
                className="group/objective relative flex items-center gap-2 rounded-md p-1.5 -mx-1.5 transition-colors has-[[data-danger]:hover]:bg-destructive/5"
              >
                <EditableText
                  value={objective}
                  onChange={(v) => updateObjective(idx, v)}
                  className="text-base text-foreground/90"
                  disabled={!isEditable}
                />
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => removeObjective(idx)}
                    aria-label="Xoá mục tiêu"
                    data-danger
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/objective:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {data.objectives.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có mục tiêu nào.</p>
            )}
          </div>
        </div>
      </section>

      <Tabs defaultValue="dialogues">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="dialogues">Bài khoá ({data.dialogues.length})</TabsTab>
          <TabsTab value="vocabulary">
            Từ vựng ({data.dialogues.reduce((sum, d) => sum + d.vocabulary.length, 0)})
          </TabsTab>
          <TabsTab value="grammar">
            Ngữ pháp ({splitGrammarMarkdown(data.grammarMarkdown ?? "").filter((s) => s.heading !== null).length})
          </TabsTab>
          <TabsTab value="audio">
            Audio ({data.dialogues.reduce((sum, d) => sum + d.vocabulary.filter((v) => v.audioUrl).length, 0)})
          </TabsTab>
          <TabsTab value="quiz">Quiz ({(quizQuestions ?? []).length})</TabsTab>
        </TabsList>

        <TabsPanel value="dialogues">
        <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <h2 className="text-base font-semibold text-foreground">Bài khoá ({data.dialogues.length})</h2>
          {isEditable && (
            <Button type="button" variant="ghost" size="sm" onClick={addDialogue}>
              + Thêm hội thoại
            </Button>
          )}
        </div>
        <Accordion className="flex flex-col gap-3">
          {data.dialogues.map((dialogue, dIdx) => (
            <AccordionItem key={dialogue.id} value={dialogue.id} className="rounded-lg border bg-card px-4">
              <AccordionTrigger className="pr-10">
                <div className="w-full text-left">
                  <p className="text-lg font-bold text-foreground">{dialogueLabels[dIdx]}</p>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Mã audio:</span>
                    <EditableText
                      value={dialogue.audioCode ?? ""}
                      onChange={(v) => updateDialogue(dIdx, { audioCode: v || null })}
                      placeholder="—"
                      className="w-auto"
                      disabled={!isEditable}
                    />
                  </div>

                  {dialogue.audioUrl && (
                    <div className="flex items-center gap-3">
                      <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                      <Link
                        href={`/lessons/${lessonId}/edit/dialogues/${dialogue.id}/trim`}
                        className="text-sm whitespace-nowrap text-primary underline-offset-4 hover:underline"
                      >
                        Cắt audio hội thoại
                      </Link>
                    </div>
                  )}

                  <div className="flex flex-col gap-1 divide-y divide-border/60">
                    {dialogue.lines.map((line, lIdx) => (
                      <DialogueLineBlock
                        key={line.id}
                        kind={dialogue.kind}
                        speakerZh={line.speakerZh}
                        speakerPinyin={line.speakerPinyin}
                        textZh={line.textZh}
                        pinyin={line.pinyin}
                        translationVi={line.translationVi}
                        onChangeSpeakerZh={(v) => updateDialogueLine(dIdx, lIdx, { speakerZh: v })}
                        onChangeSpeakerPinyin={(v) => updateDialogueLine(dIdx, lIdx, { speakerPinyin: v })}
                        onChangeTextZh={(v) => updateDialogueLine(dIdx, lIdx, { textZh: v })}
                        onChangePinyin={(v) => updateDialogueLine(dIdx, lIdx, { pinyin: v })}
                        onChangeTranslationVi={(v) => updateDialogueLine(dIdx, lIdx, { translationVi: v })}
                        onRemove={() => removeDialogueLine(dIdx, lIdx)}
                        onMoveUp={() => moveDialogueLine(dIdx, lIdx, -1)}
                        onMoveDown={() => moveDialogueLine(dIdx, lIdx, 1)}
                        canMoveUp={lIdx > 0}
                        canMoveDown={lIdx < dialogue.lines.length - 1}
                        disabled={!isEditable}
                      />
                    ))}
                    {isEditable && (
                      <button
                        type="button"
                        onClick={() => addDialogueLine(dIdx)}
                        className="self-start pt-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        + Thêm câu {dialogue.kind === "passage" ? "văn" : "thoại"}
                      </button>
                    )}
                  </div>

                  {isEditable && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeDialogue(dIdx)}
                      >
                        Xoá {dialogue.kind === "passage" ? "đoạn văn" : "hội thoại"}
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.dialogues.length === 0 && <p className="text-xs text-muted-foreground">Chưa có hội thoại nào.</p>}
        </div>
        </TabsPanel>

        <TabsPanel value="vocabulary">
        <div className="rounded-lg border bg-card p-6">
        <Accordion className="flex flex-col gap-3">
          {data.dialogues.map((dialogue, dIdx) => (
            <AccordionItem key={dialogue.id} value={dialogue.id} className="rounded-lg border bg-card px-4">
              <AccordionTrigger className="pr-10">
                <div className="w-full text-left">
                  <p className="text-lg font-bold text-foreground">
                    {dialogueLabels[dIdx]} · Từ mới ({dialogue.vocabulary.length})
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col divide-y divide-border/60">
                  {dialogue.vocabulary.map((vocab, vIdx) => (
                    <VocabRow
                      key={vocab.id}
                      wordZh={vocab.wordZh}
                      pinyin={vocab.pinyin}
                      meaningVi={vocab.meaningVi}
                      onChangeWordZh={(v) => updateVocab(dIdx, vIdx, { wordZh: v })}
                      onChangePinyin={(v) => updateVocab(dIdx, vIdx, { pinyin: v })}
                      onChangeMeaningVi={(v) => updateVocab(dIdx, vIdx, { meaningVi: v })}
                      onRemove={() => removeVocab(dIdx, vIdx)}
                      onMoveUp={() => moveVocab(dIdx, vIdx, -1)}
                      onMoveDown={() => moveVocab(dIdx, vIdx, 1)}
                      canMoveUp={vIdx > 0}
                      canMoveDown={vIdx < dialogue.vocabulary.length - 1}
                      disabled={!isEditable}
                    />
                  ))}
                  {dialogue.vocabulary.length === 0 && (
                    <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                  )}
                </div>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => addVocab(dIdx)}
                    className="mt-2 pb-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    + Thêm từ
                  </button>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.dialogues.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có hội thoại nào để thêm từ vựng.</p>
        )}
        </div>
        </TabsPanel>

        <TabsPanel value="grammar">
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-semibold text-foreground">Ngữ pháp</h2>
            </div>
            <GrammarMarkdownEditor
              value={data.grammarMarkdown ?? ""}
              onChange={(grammarMarkdown) => setData((prev) => (prev ? { ...prev, grammarMarkdown } : prev))}
              disabled={!isEditable}
            />
          </div>
        </TabsPanel>

        <TabsPanel value="audio">
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-6">
          {isEditable && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <label className="text-sm font-medium text-foreground" htmlFor="audio-voice">
                Giọng đọc
              </label>
              <select
                id="audio-voice"
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={audioVoice}
                onChange={(e) => setAudioVoice(e.target.value as TtsVoice)}
                disabled={isGeneratingAudio}
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleGenerateAudio} disabled={isGeneratingAudio}>
                {isGeneratingAudio ? "Đang sinh..." : "Sinh audio"}
              </Button>
            </div>
          )}

          {audioActionError && <p className="text-sm text-destructive">{audioActionError}</p>}

          {data.dialogues.map((dialogue, dIdx) => (
            <div key={dialogue.id} className="rounded-xl border border-dashed p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                {dialogueLabels[dIdx]} · Từ mới ({dialogue.vocabulary.length})
              </p>
              <div className="flex flex-col divide-y divide-border/60">
                {dialogue.vocabulary.map((vocab) => (
                  <div key={vocab.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="field-zh">{vocab.wordZh}</p>
                      <p className="text-xs text-muted-foreground">{vocab.meaningVi}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {vocab.audioUrl ? (
                        <audio controls preload="none" src={vocab.audioUrl} className="h-8 max-w-[12rem]" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có audio</span>
                      )}
                      {isEditable && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateOneAudio(vocab.id)}
                          disabled={isGeneratingAudio || regeneratingAudioId === vocab.id}
                        >
                          {regeneratingAudioId === vocab.id ? "Đang tạo..." : "Tạo lại"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {dialogue.vocabulary.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                )}
              </div>
            </div>
          ))}
          {data.dialogues.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có hội thoại/từ vựng nào.</p>
          )}
        </div>
        </TabsPanel>

        <TabsPanel value="quiz">
        <div className="flex flex-col gap-6 rounded-lg border bg-card p-6">
          {isEditable && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <Button
                type="button"
                onClick={() => handleGenerateQuizPart(1)}
                disabled={generatingQuizPart !== null}
              >
                {generatingQuizPart === 1
                  ? "Đang sinh Phần 1..."
                  : (quizQuestions ?? []).some((q) => q.part === 1)
                    ? "Sinh lại Phần 1"
                    : "Sinh Phần 1"}
              </Button>
              <Button
                type="button"
                onClick={() => handleGenerateQuizPart(2)}
                disabled={generatingQuizPart !== null}
              >
                {generatingQuizPart === 2
                  ? "Đang sinh Phần 2..."
                  : (quizQuestions ?? []).some((q) => q.part === 2)
                    ? "Sinh lại Phần 2"
                    : "Sinh Phần 2"}
              </Button>
            </div>
          )}

          {isEditable && data.dialogues.every((d) => d.vocabulary.every((v) => !v.audioUrl)) && (
            <p className="rounded-md border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
              Chưa có từ vựng nào có audio. Nên sinh Audio trước để có câu hỏi dạng &quot;Nghe &amp; chọn đáp
              án&quot;, nhưng vẫn có thể sinh Quiz ngay nếu muốn.
            </p>
          )}

          {quizActionError && <p className="text-sm text-destructive">{quizActionError}</p>}
          {quizFallbackWarning && (
            <p className="rounded-md border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
              {quizFallbackWarning}
            </p>
          )}

          {(quizQuestions ?? []).length === 0 && generatingQuizPart === null && (
            <p className="text-sm text-muted-foreground">Chưa có câu hỏi quiz nào.</p>
          )}

          {(quizQuestions ?? []).length > 0 && (
            <Tabs defaultValue="1">
              <TabsList>
                <TabsIndicator />
                <TabsTab value="1">
                  Phần 1 ({(quizQuestions ?? []).filter((q) => q.part === 1).length})
                </TabsTab>
                <TabsTab value="2">
                  Phần 2 ({(quizQuestions ?? []).filter((q) => q.part === 2).length})
                </TabsTab>
              </TabsList>

              {([1, 2] as const).map((part) => {
                const partQuestions = (quizQuestions ?? []).filter((q) => q.part === part)
                return (
                  <TabsPanel key={part} value={String(part)}>
                    <div className="flex flex-col gap-3">
                      {partQuestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa có câu hỏi phần này.</p>
                      ) : (
                        partQuestions.map((q) => {
                          const flatIndex = (quizQuestions ?? []).findIndex((x) => x.id === q.id)
                          return (
                            <QuizQuestionCard
                              key={q.id}
                              question={q}
                              editable={isEditable}
                              onChangePayload={(patch) => updateQuizQuestionPayload(q.id, patch)}
                              onRemove={() => removeQuizQuestion(q.id)}
                              onMoveUp={() => moveQuizQuestion(q.id, -1)}
                              onMoveDown={() => moveQuizQuestion(q.id, 1)}
                              canMoveUp={canMoveWithinPart(quizQuestions ?? [], flatIndex, -1)}
                              canMoveDown={canMoveWithinPart(quizQuestions ?? [], flatIndex, 1)}
                            />
                          )
                        })
                      )}
                    </div>
                  </TabsPanel>
                )
              })}
            </Tabs>
          )}
        </div>
        </TabsPanel>
      </Tabs>
    </main>
    </>
  )
}
