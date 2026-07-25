"use client"

import { use, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy

interface Props {
  params: Promise<{ bookId: string }>
}

export default function NewJobPage({ params }: Props) {
  const { bookId } = use(params)
  const router = useRouter()

  const [numPages, setNumPages] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(true)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])

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

  useEffect(() => {
    let cancelled = false
    let doc: PdfDocumentProxy | null = null
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null

    async function run() {
      try {
        const res = await fetch(`/api/books/${bookId}/pages`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? "Failed to load PDF")
        }
        const { signedUrl } = await res.json()

        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

        loadingTask = pdfjsLib.getDocument({ url: signedUrl })
        doc = await loadingTask.promise
        if (cancelled || !doc) return

        setNumPages(doc.numPages)
        canvasRefs.current = new Array(doc.numPages).fill(null)

        // Render thumbnails sequentially so we don't spike memory rendering
        // 100+ pages in parallel; each render is cheap at this scale.
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale: 0.3 })
          const canvas = canvasRefs.current[i - 1]
          if (!canvas) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext("2d")
          if (!context) continue
          await page.render({ canvas, canvasContext: context, viewport }).promise
        }

        if (!cancelled) setIsRendering(false)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load PDF")
          setIsRendering(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [bookId])

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

  const canSubmit = finalStart !== null && finalEnd !== null && lessonNo.trim() !== ""

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

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
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId,
        lessonNo: lessonNoNumber,
        pageStart: finalStart,
        pageEnd: finalEnd,
      }),
    })
    setIsSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSubmitError(body.error ?? "Failed to create job.")
      return
    }

    const job = await res.json()
    router.push(`/books/${bookId}/jobs/${job.id}`)
  }

  return (
    <main className="flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-40">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="mb-1 text-xl font-semibold">Chọn khoảng trang</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Nhấp một trang để bắt đầu, nhấp trang khác để kết thúc khoảng. Nhấp lại để chọn khoảng mới.
          </p>

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
