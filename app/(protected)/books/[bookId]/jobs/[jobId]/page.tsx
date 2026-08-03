"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
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
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs"
import { waitForCanvasRef } from "@/lib/pdf/waitForCanvasRef"
import { moveItem } from "@/lib/moveItem"
import { BackLink } from "@/components/back-link"
import { EditableText } from "@/components/editable-text"
import GrammarMarkdownEditor from "@/components/grammar-markdown-editor"
import { DialogueLineBlock } from "@/components/dialogue-line-block"
import { VocabRow } from "@/components/vocab-row"
import type { ExtractionJob, JobStatus } from "@/lib/db/types"
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/gemini/schema"
import type { ExistingLessonSummary } from "@/lib/db/checkExistingLesson"
import { dialogueDisplayNames } from "@/lib/dialogueDisplayName"
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
type VocabularyEntry = Dialogue["vocabulary"][number]

interface Props {
  params: Promise<{ bookId: string; jobId: string }>
}

const jobStatusLabel: Record<JobStatus, string> = {
  pending: "Đang chờ",
  reviewed: "Đã duyệt text",
  imported: "Đã nhập",
  failed: "Lỗi",
}

function emptyLine(order: number): DialogueLine {
  return { order, speakerZh: null, speakerPinyin: null, textZh: "", pinyin: null, translationVi: null }
}

function emptyDialogue(order: number): Dialogue {
  return { order, kind: "dialogue", audioCode: null, lines: [emptyLine(1)], vocabulary: [] }
}

function emptyVocab(order: number): VocabularyEntry {
  return { order, wordZh: "", pinyin: null, meaningVi: null }
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
  const [retrySeconds, setRetrySeconds] = useState(0)

  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const [numPagesRendered, setNumPagesRendered] = useState(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [isRenderingPdf, setIsRenderingPdf] = useState(true)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  // Bumping this re-runs the PDF-render effect on demand (e.g. a manual
  // "Tải lại PDF" button) without reloading the whole page and losing
  // in-progress edits to the form on the right.
  const [pdfReloadKey, setPdfReloadKey] = useState(0)

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
        // Older jobs' raw_json predates fields added later (e.g. theme/
        // objectives) with schema defaults - re-parsing here (not just
        // casting) fills those in the same way the server does, instead of
        // leaving them undefined and crashing the form below.
        const parsed = ExtractionResultSchema.safeParse(jobData.raw_json)
        setData(parsed.success ? parsed.data : (jobData.raw_json as ExtractionResult))
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
    // React Strict Mode (dev only) mounts this effect, cleans it up, then
    // mounts it again without the component itself unmounting - the canvas
    // DOM nodes from the discarded first run are still there. If a run
    // clobbers canvasRefs.current with a fresh all-null array, the canvas
    // elements' ref callbacks never re-fire (React only calls them when a
    // node is newly attached/detached, not on every render), so the array
    // stays all-null forever and every page is silently skipped. Keeping
    // the same array/index across runs (only growing it, never replacing
    // it wholesale) means an already-attached ref from an earlier run is
    // still valid for a later run.
    let cancelled = false
    const isCancelled = () => cancelled
    let doc: PdfDocumentProxy | null = null
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null

    async function run() {
      canvasRefs.current = []
      setNumPagesRendered(0)
      setPdfError(null)
      setIsRenderingPdf(true)
      try {
        const res = await fetch(`/api/jobs/${jobId}/pdf`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? "Không tải được PDF.")
        }
        const { signedUrl } = await res.json()

        // Fetch the whole file up front instead of handing pdf.js the URL
        // directly - pdf.js otherwise streams it via internal Range
        // requests, which can stall or crawl if the storage CDN doesn't
        // handle Range well, with no visible feedback while it happens.
        const pdfRes = await fetch(signedUrl)
        if (!pdfRes.ok) throw new Error("Không tải được PDF.")
        const pdfBytes = await pdfRes.arrayBuffer()
        if (isCancelled()) return

        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

        loadingTask = pdfjsLib.getDocument({ data: pdfBytes })
        doc = await loadingTask.promise
        if (isCancelled() || !doc) return

        const count = doc.numPages
        if (canvasRefs.current.length !== count) {
          canvasRefs.current = new Array(count).fill(null)
        }
        setNumPagesRendered(count)

        for (let page = 1; page <= count; page++) {
          if (isCancelled()) return
          const pdfPage = await doc.getPage(page)
          const viewport = pdfPage.getViewport({ scale: 1.3 })
          const canvas = await waitForCanvasRef(canvasRefs, page - 1, isCancelled)
          if (!canvas) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext("2d")
          if (!context) continue
          await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
        }

        if (!isCancelled()) setIsRenderingPdf(false)
      } catch (err) {
        if (!isCancelled()) {
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
  }, [jobId, pdfReloadKey])

  async function handleRetry() {
    setIsRetrying(true)
    setRetryError(null)
    setRetrySeconds(0)
    const timer = setInterval(() => setRetrySeconds((s) => s + 1), 1000)
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
      clearInterval(timer)
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
      const { titleVi, titleZh, dialogueCount, vocabularyCount } = job.existingLesson
      const confirmed = window.confirm(
        `Bài "${titleVi || titleZh}" đã tồn tại (${dialogueCount} hội thoại, ${vocabularyCount} từ vựng). ` +
          `Import bây giờ sẽ XOÁ TOÀN BỘ bài cũ này (kể cả audio đã gắn) ` +
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

  function updateObjective(idx: number, value: string) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.lesson.objectives.map((o, i) => (i === idx ? value : o))
      return { ...prev, lesson: { ...prev.lesson, objectives } }
    })
  }

  function addObjective() {
    setData((prev) =>
      prev ? { ...prev, lesson: { ...prev.lesson, objectives: [...prev.lesson.objectives, ""] } } : prev
    )
  }

  function removeObjective(idx: number) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.lesson.objectives.filter((_, i) => i !== idx)
      return { ...prev, lesson: { ...prev.lesson, objectives } }
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
    <>
      <div className="w-full px-4 pt-4 sm:px-6">
        <BackLink href={`/books/${bookId}`} label="Quay lại sách" />
      </div>
      <main className="mx-auto flex w-full max-w-[1400px] flex-col px-4 py-6">
      <div className="sticky top-0 z-10 -mx-4 mt-3 mb-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 relative">
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
          {isRetrying && (
            <span className="text-sm text-muted-foreground">Đã chờ {retrySeconds}s</span>
          )}
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
        {isRetrying && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-muted">
            <div className="h-full w-1/3 animate-[extraction-progress_1.2s_ease-in-out_infinite] bg-primary" />
          </div>
        )}
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
            ({job.existingLesson.dialogueCount} hội thoại, {job.existingLesson.vocabularyCount} từ vựng). Bấm &quot;Import vào DB&quot; sẽ{" "}
            <strong>xoá toàn bộ bài cũ này (kể cả audio đã gắn)</strong> và thay bằng dữ liệu vừa trích xuất.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: original PDF pages */}
        <div className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Ảnh gốc PDF</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPdfReloadKey((k) => k + 1)}
                disabled={isRenderingPdf}
              >
                Tải lại PDF
              </Button>
            </div>
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
              {(() => {
                const dialogueLabels = dialogueDisplayNames(data.dialogues)
                return (
                  <>
              <section className="rounded-lg border bg-card p-6">
                <h2 className="mb-4 border-b pb-3 text-base font-semibold text-foreground">Thông tin bài học</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Tiêu đề (Trung)
                    </Label>
                    <EditableText
                      value={data.lesson.titleZh}
                      onChange={(titleZh) => updateLesson({ titleZh })}
                      placeholder="Tiêu đề bài học (chữ Hán)"
                      className="text-lg font-semibold text-foreground"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Tiêu đề (Việt)
                    </Label>
                    <EditableText
                      value={data.lesson.titleVi}
                      onChange={(titleVi) => updateLesson({ titleVi })}
                      placeholder="Tiêu đề bài học (tiếng Việt)"
                      className="text-lg font-semibold text-foreground"
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Chủ đề
                    </Label>
                    <EditableText
                      value={data.lesson.theme ?? ""}
                      onChange={(theme) => updateLesson({ theme: theme || null })}
                      placeholder="Chủ đề của bài"
                      className="text-base text-foreground/90"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Mục tiêu
                    </Label>
                    <button
                      type="button"
                      onClick={addObjective}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      + Thêm mục tiêu
                    </button>
                  </div>
                  <div className="flex flex-col divide-y divide-border/60">
                    {data.lesson.objectives.map((objective, idx) => (
                      <div
                        key={idx}
                        className="group/objective relative flex items-center gap-2 rounded-md p-1.5 -mx-1.5 transition-colors has-[[data-danger]:hover]:bg-destructive/5"
                      >
                        <EditableText
                          value={objective}
                          onChange={(v) => updateObjective(idx, v)}
                          className="text-base text-foreground/90"
                        />
                        <button
                          type="button"
                          onClick={() => removeObjective(idx)}
                          aria-label="Xoá mục tiêu"
                          data-danger
                          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/objective:opacity-100"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    {data.lesson.objectives.length === 0 && (
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
                  <TabsTab value="grammar">Ngữ pháp</TabsTab>
                </TabsList>

                <TabsPanel value="dialogues">
                <div className="rounded-lg border bg-card p-6">
                <div className="mb-4 flex items-center justify-between border-b pb-3">
                  <h2 className="text-base font-semibold text-foreground">
                    Bài khoá ({data.dialogues.length})
                  </h2>
                  <Button type="button" variant="ghost" size="sm" onClick={addDialogue}>
                    + Thêm hội thoại
                  </Button>
                </div>
                <Accordion className="flex flex-col gap-3">
                  {data.dialogues.map((dialogue, dIdx) => (
                    <AccordionItem
                      key={dIdx}
                      value={`dialogue-${dIdx}`}
                      className="rounded-lg border bg-card px-4"
                    >
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
                            />
                          </div>

                          <div className="flex flex-col gap-1 divide-y divide-border/60">
                            {dialogue.lines.map((line, lIdx) => (
                              <DialogueLineBlock
                                key={lIdx}
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
                              />
                            ))}
                            <button
                              type="button"
                              onClick={() => addDialogueLine(dIdx)}
                              className="self-start pt-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                            >
                              + Thêm câu {dialogue.kind === "passage" ? "văn" : "thoại"}
                            </button>
                          </div>

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
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                {data.dialogues.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có hội thoại nào.</p>
                )}
                </div>
                </TabsPanel>

                <TabsPanel value="vocabulary">
                <div className="rounded-lg border bg-card p-6">
                <Accordion className="flex flex-col gap-3">
                  {data.dialogues.map((dialogue, dIdx) => (
                    <AccordionItem
                      key={dIdx}
                      value={`dialogue-${dIdx}`}
                      className="rounded-lg border bg-card px-4"
                    >
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
                              key={vIdx}
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
                            />
                          ))}
                          {dialogue.vocabulary.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => addVocab(dIdx)}
                          className="mt-2 pb-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                        >
                          + Thêm từ
                        </button>
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
                      value={data.grammarMarkdown}
                      onChange={(grammarMarkdown) => setData((prev) => (prev ? { ...prev, grammarMarkdown } : prev))}
                    />
                  </div>
                </TabsPanel>
              </Tabs>
                  </>
                )
              })()}
            </>
          )}
        </fieldset>
      </div>
      </main>
    </>
  )
}
