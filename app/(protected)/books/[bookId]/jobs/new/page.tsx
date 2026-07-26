"use client"

import { use, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { sliceBookPdf } from "@/lib/pdf/slice"
import { waitForCanvasRef } from "@/lib/pdf/waitForCanvasRef"

type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy
type PdfLoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask

interface Props {
  params: Promise<{ bookId: string }>
}

export default function NewJobPage({ params }: Props) {
  const { bookId } = use(params)
  const router = useRouter()

  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  // Bumped on every file selection so a stale render loop from a
  // previously-selected file can detect it's been superseded and stop
  // writing thumbnails into canvases that now belong to a newer file.
  const renderGenerationRef = useRef(0)
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null)

  // Range selection: anchor is the first click of a selection, focus is the
  // second. While `committed` is false, hovering another thumbnail previews
  // the range extension. A click after committing starts a brand-new range.
  const [anchor, setAnchor] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [committed, setCommitted] = useState(false)
  const [hoverPage, setHoverPage] = useState<number | null>(null)

  const [lessonNo, setLessonNo] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleFileChange(file: File | null) {
    // Supersede any in-flight render loop from a previously selected file
    // before it can write stale pages into this selection's canvases.
    const generation = ++renderGenerationRef.current

    if (loadingTaskRef.current) {
      loadingTaskRef.current.destroy()
      loadingTaskRef.current = null
    }

    setLoadError(null)
    setAnchor(null)
    setFocus(null)
    setCommitted(false)
    setNumPages(null)
    setPdfBytes(null)

    if (!file) return

    setIsRendering(true)
    try {
      const buffer = await file.arrayBuffer()
      if (generation !== renderGenerationRef.current) return
      setPdfBytes(buffer)

      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

      // pdfjs detaches/transfers the buffer it's given, so hand it a copy and
      // keep the original around for the later client-side slice.
      const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) })
      loadingTaskRef.current = loadingTask
      const doc: PdfDocumentProxy = await loadingTask.promise

      if (generation !== renderGenerationRef.current) {
        loadingTask.destroy()
        if (loadingTaskRef.current === loadingTask) {
          loadingTaskRef.current = null
        }
        return
      }

      setNumPages(doc.numPages)
      canvasRefs.current = new Array(doc.numPages).fill(null)

      // Render thumbnails sequentially so we don't spike memory rendering
      // 100+ pages in parallel; each render is cheap at this scale.
      for (let i = 1; i <= doc.numPages; i++) {
        if (generation !== renderGenerationRef.current) return
        const page = await doc.getPage(i)
        if (generation !== renderGenerationRef.current) return
        const viewport = page.getViewport({ scale: 0.3 })
        const canvas = await waitForCanvasRef(canvasRefs, i - 1, () => generation !== renderGenerationRef.current)
        if (!canvas) continue
        canvas.width = viewport.width
        canvas.height = viewport.height
        const context = canvas.getContext("2d")
        if (!context) continue
        await page.render({ canvas, canvasContext: context, viewport }).promise
      }

      if (generation === renderGenerationRef.current) {
        setIsRendering(false)
      }
      if (loadingTaskRef.current === loadingTask) {
        loadingTaskRef.current = null
      }
      loadingTask.destroy()
    } catch (err) {
      if (generation === renderGenerationRef.current) {
        setLoadError(err instanceof Error ? err.message : "Failed to load PDF")
        setIsRendering(false)
      }
    }
  }

  function handlePageClick(page: number) {
    if (anchor === null || committed) {
      setAnchor(page)
      setFocus(page)
      setCommitted(false)
    } else {
      setFocus(page)
      setCommitted(true)
    }
  }

  const previewFocus = !committed && hoverPage !== null ? hoverPage : focus
  const rangeStart =
    anchor !== null && previewFocus !== null ? Math.min(anchor, previewFocus) : null
  const rangeEnd =
    anchor !== null && previewFocus !== null ? Math.max(anchor, previewFocus) : null

  const finalStart = anchor !== null && focus !== null ? Math.min(anchor, focus) : null
  const finalEnd = anchor !== null && focus !== null ? Math.max(anchor, focus) : null

  const canSubmit =
    pdfBytes !== null && finalStart !== null && finalEnd !== null && lessonNo.trim() !== ""

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    if (!pdfBytes) {
      setSubmitError("Vui lòng chọn tệp PDF.")
      return
    }
    if (finalStart === null || finalEnd === null) {
      setSubmitError("Vui lòng chọn khoảng trang.")
      return
    }
    const lessonNoNumber = Number(lessonNo)
    if (!Number.isFinite(lessonNoNumber) || lessonNoNumber <= 0) {
      setSubmitError("Số bài học không hợp lệ.")
      return
    }

    setIsSubmitting(true)
    try {
      const sliced = await sliceBookPdf(new Uint8Array(pdfBytes), finalStart, finalEnd)

      const form = new FormData()
      form.set("bookId", bookId)
      form.set("lessonNo", String(lessonNoNumber))
      form.set("pageStart", String(finalStart))
      form.set("pageEnd", String(finalEnd))
      form.set(
        "file",
        new File([sliced as BlobPart], `lesson-${lessonNoNumber}.pdf`, { type: "application/pdf" })
      )

      const res = await fetch("/api/jobs", { method: "POST", body: form })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSubmitError(body.error ?? "Failed to create job.")
        return
      }

      const job = await res.json()
      router.push(`/books/${bookId}/jobs/${job.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create job.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-40 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">
            Chọn khoảng trang
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Chọn tệp PDF của sách từ máy tính, sau đó nhấp một trang để bắt đầu, nhấp trang khác để kết thúc khoảng. Nhấp lại để chọn khoảng mới.
          </p>

          <div className="mb-6 flex flex-col gap-1.5">
            <label htmlFor="pdfFile" className="text-sm font-medium text-foreground">
              Tệp PDF sách giáo khoa
            </label>
            <Input
              id="pdfFile"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </div>

          {loadError && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {loadError}
            </p>
          )}

          {isRendering && !loadError && (
            <p className="mb-4 text-sm text-muted-foreground">Đang tải các trang PDF...</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
            {Array.from({ length: numPages ?? 0 }, (_, idx) => idx + 1).map((page) => {
              const isStart = finalStart === page || (anchor === page && !committed)
              const isEnd = finalEnd === page
              const inRange =
                rangeStart !== null && rangeEnd !== null && page >= rangeStart && page <= rangeEnd
              const isPreviewOnly =
                inRange && !committed && hoverPage !== null && !(finalStart === page || finalEnd === page)

              return (
                <button
                  key={page}
                  type="button"
                  aria-pressed={inRange}
                  onClick={() => handlePageClick(page)}
                  onMouseEnter={() => setHoverPage(page)}
                  onMouseLeave={() => setHoverPage(null)}
                  className={cn(
                    "group flex flex-col items-center gap-1 rounded-md border-2 border-transparent p-1.5 text-xs transition-colors",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    inRange && "bg-primary/10",
                    isPreviewOnly && "border-dashed border-primary/50",
                    (isStart || isEnd) && "border-primary bg-primary/15 font-semibold"
                  )}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[page - 1] = el
                    }}
                    className="w-full rounded border border-border bg-white shadow-sm"
                  />
                  <span className={cn("text-muted-foreground", (isStart || isEnd) && "text-foreground")}>
                    {page}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t bg-background/95 px-4 py-4 backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Khoảng trang đã chọn</span>
            <span className="text-sm font-semibold">
              {finalStart !== null && finalEnd !== null
                ? `Trang ${finalStart} – ${finalEnd} (${finalEnd - finalStart + 1} trang)`
                : "Chưa chọn"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="lessonNo" className="text-xs font-medium text-muted-foreground">
              Số bài học
            </label>
            <Input
              id="lessonNo"
              type="number"
              min={1}
              className="w-28"
              value={lessonNo}
              onChange={(event) => setLessonNo(event.target.value)}
              required
            />
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button type="submit" disabled={!canSubmit || isSubmitting} className="ml-auto">
            {isSubmitting ? "Đang tạo..." : "Tạo công việc trích xuất"}
          </Button>
        </div>
      </form>
    </main>
  )
}
