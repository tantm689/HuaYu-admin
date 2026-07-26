"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge, type badgeVariants } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { waitForCanvasRef } from "@/lib/pdf/waitForCanvasRef"
import type { ExtractionJob, JobStatus } from "@/lib/db/types"
import type { ExtractionResult } from "@/lib/gemini/schema"
import type { ExistingLessonSummary } from "@/lib/db/checkExistingLesson"
import type { VariantProps } from "class-variance-authority"

type JobWithExistingLesson = ExtractionJob & { existingLesson: ExistingLessonSummary | null }

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

const jobStatusVariant: Record<JobStatus, BadgeVariant> = {
  pending: "pending",
  reviewed: "info",
  imported: "success",
  failed: "destructive",
}

type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy

// The Gemini schema module only exports the inferred ExtractionResult type,
// not each nested piece, so derive the nested shapes we edit here.
type Dialogue = ExtractionResult["dialogues"][number]
type DialogueLine = Dialogue["lines"][number]
type VocabularyEntry = ExtractionResult["vocabulary"][number]
type GrammarPoint = ExtractionResult["grammarPoints"][number]
type GrammarExample = GrammarPoint["examples"][number]

interface Props {
  params: Promise<{ bookId: string; jobId: string }>
}

const jobStatusLabel: Record<JobStatus, string> = {
  pending: "Đang chờ",
  reviewed: "Đã duyệt",
  imported: "Đã nhập",
  failed: "Lỗi",
}

function emptyLine(order: number): DialogueLine {
  return { order, speakerZh: null, speakerPinyin: null, textZh: "", pinyin: null, translationVi: null }
}

function emptyDialogue(order: number): Dialogue {
  return { order, titleZh: null, titleVi: null, audioCode: null, lines: [emptyLine(1)] }
}

function emptyVocab(order: number): VocabularyEntry {
  return { order, wordZh: "", pinyin: null, meaningVi: null }
}

function emptyExample(order: number): GrammarExample {
  return { order, textZh: "", pinyin: null, translationVi: null }
}

function emptyGrammarPoint(order: number): GrammarPoint {
  return { order, titleZh: "", titleVi: null, structureNote: null, examples: [emptyExample(1)] }
}

export default function JobReviewPage({ params }: Props) {
  const { bookId, jobId } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<JobWithExistingLesson | null>(null)
  const [data, setData] = useState<ExtractionResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [isRetrying, setIsRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const [numPagesRendered, setNumPagesRendered] = useState(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [isRenderingPdf, setIsRenderingPdf] = useState(true)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])

  const loadJob = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được công việc trích xuất.")
      }
      const jobData: JobWithExistingLesson = await res.json()
      setJob(jobData)
      if (jobData.raw_json) {
        setData(jobData.raw_json as ExtractionResult)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được công việc trích xuất.")
    } finally {
      setIsLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    // loadJob sets state synchronously before its first await; this is an
    // intentional initial-data-fetch-on-mount pattern, not a cascading-render
    // bug, so the react-hooks set-state-in-effect rule is suppressed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJob()
  }, [loadJob])

  // Render every page of this job's own sliced PDF, reusing the client-side
  // pdfjs-dist approach from the page-range picker. The sliced file already
  // contains only the selected pages, so no page_start/page_end offset math
  // is needed here.
  useEffect(() => {
    if (!job) return
    let cancelled = false
    let doc: PdfDocumentProxy | null = null
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null

    async function run() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/pdf`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? "Không tải được PDF.")
        }
        const { signedUrl } = await res.json()

        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

        loadingTask = pdfjsLib.getDocument({ url: signedUrl })
        doc = await loadingTask.promise
        if (cancelled || !doc) return

        const count = doc.numPages
        canvasRefs.current = new Array(count).fill(null)
        setNumPagesRendered(count)

        for (let page = 1; page <= count; page++) {
          if (cancelled) return
          const pdfPage = await doc.getPage(page)
          const viewport = pdfPage.getViewport({ scale: 1.3 })
          const canvas = await waitForCanvasRef(canvasRefs, page - 1, () => cancelled)
          if (!canvas) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext("2d")
          if (!context) continue
          await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
        }

        if (!cancelled) setIsRenderingPdf(false)
      } catch (err) {
        if (!cancelled) {
          setPdfError(err instanceof Error ? err.message : "Không tải được PDF.")
          setIsRenderingPdf(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [jobId, job])

  async function handleRetry() {
    setIsRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/run`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Trích xuất lại thất bại.")
      }
      await loadJob()
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Trích xuất lại thất bại.")
    } finally {
      setIsRetrying(false)
    }
  }

  async function handleSave() {
    if (!data) return
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_json: data }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu thất bại.")
      }
      setSaveSuccess(true)
      await loadJob()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Lưu thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImport() {
    if (job?.existingLesson) {
      const { titleVi, titleZh, dialogueCount, vocabularyCount, grammarPointCount } = job.existingLesson
      const confirmed = window.confirm(
        `Bài "${titleVi || titleZh}" đã tồn tại (${dialogueCount} hội thoại, ${vocabularyCount} từ vựng, ` +
          `${grammarPointCount} điểm ngữ pháp). Import bây giờ sẽ XOÁ TOÀN BỘ bài cũ này (kể cả audio đã gắn) ` +
          `và thay bằng dữ liệu vừa trích xuất. Bạn có chắc chắn muốn tiếp tục?`
      )
      if (!confirmed) return
    }

    setIsImporting(true)
    setImportError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/import`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Nhập vào cơ sở dữ liệu thất bại.")
      }
      router.push(`/books/${bookId}`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Nhập vào cơ sở dữ liệu thất bại.")
    } finally {
      setIsImporting(false)
    }
  }

  // --- Immutable update helpers for the raw_json working copy ---

  function updateLesson(patch: Partial<ExtractionResult["lesson"]>) {
    setData((prev) => (prev ? { ...prev, lesson: { ...prev.lesson, ...patch } } : prev))
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
      <main className="mx-auto w-full max-w-[1400px] px-4 py-10">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </main>
    )
  }

  if (loadError || !job) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 py-10">
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? "Không tìm thấy công việc trích xuất."}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col px-4 py-6">
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Bài {job.lesson_no} · Trang {job.page_start}–{job.page_end}
          </h1>
          <Badge variant={jobStatusVariant[job.status]} className="mt-1">
            {jobStatusLabel[job.status]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
          {job.status === "pending" && !job.raw_json && (
            <Button variant="outline" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? "Đang trích xuất..." : "Trích xuất nội dung"}
            </Button>
          )}
          {job.status === "failed" && (
            <Button variant="outline" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? "Đang thử lại..." : "Thử lại"}
            </Button>
          )}
          {job.status !== "imported" && (
            <Button onClick={handleSave} disabled={isSaving || !data}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
          {job.status === "reviewed" && (
            <Button variant="outline" onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Đang nhập..." : "Import vào DB"}
            </Button>
          )}
        </div>
      </div>

      {retryError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {retryError}
        </p>
      )}
      {importError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {importError}
        </p>
      )}

      {job.status === "imported" && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Công việc này đã được nhập vào cơ sở dữ liệu. Muốn sửa nội dung, vào trang bài học tương ứng và bấm
            &quot;Sửa&quot; (bài học phải ở trạng thái Nháp).
          </p>
        </div>
      )}

      {job.status === "failed" && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Trích xuất thất bại</p>
          <p className="mt-1 text-sm text-muted-foreground">{job.error_message}</p>
        </div>
      )}

      {job.existingLesson && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Bài &quot;{job.existingLesson.titleVi || job.existingLesson.titleZh}&quot; đã tồn tại
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            ({job.existingLesson.dialogueCount} hội thoại, {job.existingLesson.vocabularyCount} từ vựng,{" "}
            {job.existingLesson.grammarPointCount} điểm ngữ pháp). Bấm &quot;Import vào DB&quot; sẽ{" "}
            <strong>xoá toàn bộ bài cũ này (kể cả audio đã gắn)</strong> và thay bằng dữ liệu vừa trích xuất.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: original PDF pages */}
        <div className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3">
            {pdfError && (
              <p role="alert" className="text-sm text-destructive">
                {pdfError}
              </p>
            )}
            {isRenderingPdf && !pdfError && (
              <p className="text-sm text-muted-foreground">Đang tải trang PDF...</p>
            )}
            {Array.from({ length: numPagesRendered }, (_, idx) => idx).map((idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <canvas
                  ref={(el) => {
                    canvasRefs.current[idx] = el
                  }}
                  className="w-full rounded border border-border bg-white shadow-sm"
                />
                <span className="text-xs text-muted-foreground">Trang {idx + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: editable extraction form */}
        <fieldset
          disabled={job.status === "imported"}
          className="m-0 min-w-0 flex-col gap-6 border-0 p-0 pb-16 flex"
        >
          {!data ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu trích xuất.</p>
          ) : (
            <>
              <section className="rounded-lg border p-4">
                <h2 className="mb-3 text-sm font-semibold">Thông tin bài học</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="titleZh">Tiêu đề (Trung)</Label>
                    <Input
                      id="titleZh"
                      value={data.lesson.titleZh}
                      onChange={(e) => updateLesson({ titleZh: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="titleVi">Tiêu đề (Việt)</Label>
                    <Input
                      id="titleVi"
                      value={data.lesson.titleVi}
                      onChange={(e) => updateLesson({ titleVi: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hội thoại ({data.dialogues.length})</h2>
                  <Button type="button" variant="ghost" size="sm" onClick={addDialogue}>
                    + Thêm hội thoại
                  </Button>
                </div>
                <Accordion>
                  {data.dialogues.map((dialogue, dIdx) => (
                    <AccordionItem key={dIdx} value={`dialogue-${dIdx}`}>
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

                          <div className="flex flex-col gap-2">
                            {dialogue.lines.map((line, lIdx) => (
                              <div key={lIdx} className="rounded-md border bg-muted/20 p-2.5">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <Input
                                    placeholder="Người nói (Trung)"
                                    value={line.speakerZh ?? ""}
                                    onChange={(e) =>
                                      updateDialogueLine(dIdx, lIdx, { speakerZh: e.target.value || null })
                                    }
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
                                  onChange={(e) =>
                                    updateDialogueLine(dIdx, lIdx, { pinyin: e.target.value || null })
                                  }
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
                {data.dialogues.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có hội thoại nào.</p>
                )}
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
                    <div key={vIdx} className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-2.5 sm:grid-cols-4">
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
                  ))}
                  {data.vocabulary.length === 0 && (
                    <p className="text-xs text-muted-foreground">Chưa có từ vựng nào.</p>
                  )}
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
                    <AccordionItem key={gIdx} value={`grammar-${gIdx}`}>
                      <AccordionTrigger>
                        Ngữ pháp {gIdx + 1}
                        {point.titleVi ? ` — ${point.titleVi}` : point.titleZh ? ` — ${point.titleZh}` : ""}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col gap-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <Label>Tiêu đề (Trung)</Label>
                              <Input
                                value={point.titleZh}
                                onChange={(e) => updateGrammar(gIdx, { titleZh: e.target.value })}
                              />
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
                              <div key={eIdx} className="rounded-md border bg-muted/20 p-2.5">
                                <Textarea
                                  placeholder="Câu ví dụ (Trung)"
                                  value={example.textZh}
                                  onChange={(e) =>
                                    updateGrammarExample(gIdx, eIdx, { textZh: e.target.value })
                                  }
                                />
                                <Input
                                  className="mt-2"
                                  placeholder="Pinyin"
                                  value={example.pinyin ?? ""}
                                  onChange={(e) =>
                                    updateGrammarExample(gIdx, eIdx, { pinyin: e.target.value || null })
                                  }
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addGrammarExample(gIdx)}
                            >
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
            </>
          )}
        </fieldset>
      </div>
    </main>
  )
}
