"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BackLink } from "@/components/back-link"
import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"
import { canMoveWithinPart, moveQuestionWithinPart } from "@/lib/quizReorder"
import type { ExtractionJob } from "@/lib/db/types"
import type { QuizQuestion } from "@/lib/gemini/quizSchema"

interface Props {
  params: Promise<{ bookId: string; jobId: string }>
}

const TYPE_LABELS: Record<QuizQuestion["type"], string> = {
  pinyin_choice: "Chọn Pinyin/Chữ Hán",
  listening_choice: "Nghe & chọn đáp án",
  tone_choice: "Nhận biết thanh điệu",
  matching: "Ghép nghĩa",
  fill_blank: "Điền từ vào chỗ trống",
  sentence_order: "Sắp xếp câu",
}

// A stable per-question identity, generated once when a question enters
// state (on load and on generate) and carried alongside it thereafter. Using
// this instead of the question's current array index as the React `key`
// (and as the radio-group `name`) avoids remounting both cards involved in a
// reorder swap - `indexOf`-based keys change for both elements whenever
// `moveItem` swaps adjacent entries, since the index each question sits at
// changes even though the question itself didn't.
let nextQuestionKeyId = 0
function makeQuestionKey(): string {
  nextQuestionKeyId += 1
  return `q${nextQuestionKeyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type KeyedQuestion = { key: string; question: QuizQuestion }

function QuestionCard({
  questionKey,
  question,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  questionKey: string
  question: QuizQuestion
  onChange: (patch: Partial<QuizQuestion>) => void
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
          {TYPE_LABELS[question.type]}
        </span>
        <BlockActions
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          removeLabel="Xoá câu hỏi"
          className="group-hover/question:opacity-100"
        />
      </div>

      {question.type === "pinyin_choice" && (
        <>
          <EditableText value={question.prompt} onChange={(prompt) => onChange({ prompt })} className="field-zh" />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${questionKey}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
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
                name={`${questionKey}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
              />
            </div>
          ))}
        </>
      )}

      {question.type === "tone_choice" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <EditableText value={question.wordZh} onChange={(wordZh) => onChange({ wordZh })} className="field-zh" />
            <EditableText
              value={question.pinyinNoTone}
              onChange={(pinyinNoTone) => onChange({ pinyinNoTone })}
              className="w-auto"
            />
          </div>
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${questionKey}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
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
                  onChange({ pairs: pairs as typeof question.pairs })
                }}
                className="field-zh"
              />
              <EditableText
                value={pair.right}
                onChange={(right) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], right }
                  onChange({ pairs: pairs as typeof question.pairs })
                }}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <>
          <EditableText
            value={question.sentence}
            onChange={(sentence) => onChange({ sentence })}
            className="field-zh"
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${questionKey}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
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
                      onChange({ words })
                    }}
                    className="field-zh w-auto"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Vị trí đúng
                    <input
                      type="number"
                      min={1}
                      max={question.words.length}
                      value={correctPosition + 1}
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
                        onChange({ correctOrder })
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

export default function JobQuizPage({ params }: Props) {
  const { bookId, jobId } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<ExtractionJob | null>(null)
  const [keyedQuestions, setKeyedQuestions] = useState<KeyedQuestion[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const loadJob = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được công việc trích xuất.")
      }
      const jobData: ExtractionJob = await res.json()
      setJob(jobData)
      const rawQuestions = (jobData.raw_json as { quizQuestions?: QuizQuestion[] } | null)?.quizQuestions
      setKeyedQuestions((rawQuestions ?? []).map((question) => ({ key: makeQuestionKey(), question })))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được công việc trích xuất.")
    } finally {
      setIsLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    // loadJob sets state synchronously before its first await - intentional
    // mount-time fetch, not a cascading-render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJob()
  }, [loadJob])

  async function handleGenerate() {
    if (keyedQuestions && keyedQuestions.length > 0) {
      const confirmed = window.confirm(
        "Sẽ xoá toàn bộ 30 câu hỏi hiện tại (kể cả đã sửa tay) và sinh lại từ đầu, tiếp tục?"
      )
      if (!confirmed) return
    }

    setIsGenerating(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/quiz`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh quiz thất bại.")
      }
      const { quizQuestions } = (await res.json()) as { quizQuestions: QuizQuestion[] }
      setKeyedQuestions(quizQuestions.map((question) => ({ key: makeQuestionKey(), question })))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Sinh quiz thất bại.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!keyedQuestions) return
    setIsSaving(true)
    setActionError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/jobs/${jobId}/quiz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizQuestions: keyedQuestions.map((kq) => kq.question) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu quiz thất bại.")
      }
      setSaveSuccess(true)
      await loadJob()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Lưu quiz thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setKeyedQuestions((prev) => {
      if (!prev) return prev
      return prev.map((kq, i) => (i === index ? { ...kq, question: { ...kq.question, ...patch } as QuizQuestion } : kq))
    })
  }

  function removeQuestion(index: number) {
    setKeyedQuestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setKeyedQuestions((prev) => {
      if (!prev) return prev
      // moveQuestionWithinPart swaps `index` only with its nearest same-part
      // neighbor (never crossing the Part 1 / Part 2 boundary) and renumbers
      // `order` 1..N within each part - see lib/quizReorder.ts. It operates
      // on the nested `question` objects (which carry `part`/`order`); the
      // stable keys are re-paired by array position afterward.
      const reordered = moveQuestionWithinPart(
        prev.map((kq) => kq.question),
        index,
        direction
      )
      return prev.map((kq, i) => ({ ...kq, question: reordered[i] }))
    })
  }

  if (isLoading) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">Đang tải...</main>
  }

  if (loadError || !job || !keyedQuestions) {
    return (
      <>
        <div className="w-full px-4 pt-6 sm:px-6">
          <BackLink href={`/books/${bookId}/jobs/${jobId}`} label="Quay lại" />
        </div>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
          <p className="text-sm text-destructive">{loadError ?? "Không tải được dữ liệu."}</p>
        </main>
      </>
    )
  }

  const part1 = keyedQuestions.filter((kq) => kq.question.part === 1)
  const part2 = keyedQuestions.filter((kq) => kq.question.part === 2)

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/books/${bookId}/jobs/${jobId}`} label="Quay lại" />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Sinh &amp; duyệt Quiz</h1>
            <Badge variant={job.status === "quiz_ready" ? "info" : "pending"} className="mt-1">
              {job.status === "quiz_ready" ? "Đã duyệt quiz" : "Đang chờ sinh quiz"}
            </Badge>
          </div>
          <Button variant="outline" onClick={() => router.push(`/books/${bookId}/jobs/${jobId}`)}>
            Quay lại
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Đang sinh quiz..." : keyedQuestions.length > 0 ? "Sinh lại Quiz" : "Sinh Quiz"}
          </Button>
          {keyedQuestions.length > 0 && (
            <Button type="button" variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
        </div>

        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        {keyedQuestions.length === 0 && !isGenerating && (
          <p className="text-sm text-muted-foreground">Chưa có câu hỏi quiz nào. Bấm &quot;Sinh Quiz&quot; để bắt đầu.</p>
        )}

        {part1.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">Phần 1 ({part1.length} câu)</h2>
            {part1.map((kq) => {
              const index = keyedQuestions.indexOf(kq)
              return (
                <QuestionCard
                  key={kq.key}
                  questionKey={kq.key}
                  question={kq.question}
                  onChange={(patch) => updateQuestion(index, patch)}
                  onRemove={() => removeQuestion(index)}
                  onMoveUp={() => moveQuestion(index, -1)}
                  onMoveDown={() => moveQuestion(index, 1)}
                  canMoveUp={canMoveWithinPart(
                    keyedQuestions.map((k) => k.question),
                    index,
                    -1
                  )}
                  canMoveDown={canMoveWithinPart(
                    keyedQuestions.map((k) => k.question),
                    index,
                    1
                  )}
                />
              )
            })}
          </section>
        )}

        {part2.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">Phần 2 ({part2.length} câu)</h2>
            {part2.map((kq) => {
              const index = keyedQuestions.indexOf(kq)
              return (
                <QuestionCard
                  key={kq.key}
                  questionKey={kq.key}
                  question={kq.question}
                  onChange={(patch) => updateQuestion(index, patch)}
                  onRemove={() => removeQuestion(index)}
                  onMoveUp={() => moveQuestion(index, -1)}
                  onMoveDown={() => moveQuestion(index, 1)}
                  canMoveUp={canMoveWithinPart(
                    keyedQuestions.map((k) => k.question),
                    index,
                    -1
                  )}
                  canMoveDown={canMoveWithinPart(
                    keyedQuestions.map((k) => k.question),
                    index,
                    1
                  )}
                />
              )
            })}
          </section>
        )}
      </main>
    </>
  )
}
