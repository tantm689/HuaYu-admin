"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/back-link"
import { encodeAudioBufferAsWav } from "@/lib/audio/encodeWav"
import type { LessonFullView } from "@/lib/db/getLessonFull"

interface Props {
  params: Promise<{ lessonId: string; dialogueId: string }>
}

type DialogueLineView = LessonFullView["dialogues"][number]["lines"][number]

interface LineRegion {
  lineId: string
  start: number
  end: number
}

const REGION_COLOR = "rgba(30, 58, 95, 0.15)"

export default function TrimDialogueAudioPage({ params }: Props) {
  const { lessonId, dialogueId } = use(params)
  const router = useRouter()

  const [lesson, setLesson] = useState<LessonFullView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [regionsByLine, setRegionsByLine] = useState<Record<string, LineRegion>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}`)
        if (!res.ok) throw new Error("Không tải được bài học.")
        const json: LessonFullView = await res.json()
        setLesson(json)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Không tải được bài học.")
      }
    }
    load()
  }, [lessonId])

  const dialogue = lesson?.dialogues.find((d) => d.id === dialogueId) ?? null

  useEffect(() => {
    if (!dialogue?.audioUrl || !containerRef.current) return

    const lines = dialogue.lines
    const regionsPlugin = RegionsPlugin.create()
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 128,
      waveColor: "#9ca3af",
      progressColor: "#1e3a5f",
      url: dialogue.audioUrl,
      plugins: [regionsPlugin],
    })
    wavesurferRef.current = wavesurfer
    regionsPluginRef.current = regionsPlugin

    wavesurfer.on("decode", () => {
      // Restore previously-saved regions once the audio is decoded and its
      // duration is known - `lines` is captured from the outer closure at
      // effect-setup time, which is fine since this effect only depends on
      // dialogueId/dialogue.audioUrl (re-running the whole waveform load if a
      // line's saved trim times changed some other way isn't a case that
      // happens within a single page visit).
      const restored: Record<string, LineRegion> = {}
      for (const line of lines) {
        if (line.startTime !== null && line.endTime !== null) {
          regionsPlugin.addRegion({
            id: line.id,
            start: line.startTime,
            end: line.endTime,
            color: REGION_COLOR,
          })
          restored[line.id] = { lineId: line.id, start: line.startTime, end: line.endTime }
        }
      }
      // Seed state from the restored regions so that re-confirming without
      // touching a restored line still re-cuts and re-saves it, rather than
      // silently dropping lines the admin didn't drag this visit.
      if (Object.keys(restored).length > 0) {
        setRegionsByLine((prev) => ({ ...restored, ...prev }))
      }
    })

    // `region-updated` fires when a drag/resize finishes (the installed
    // wavesurfer.js 7.x Regions plugin also emits `region-update` continuously
    // during the drag - we only care about the settled value).
    regionsPlugin.on("region-updated", (region) => {
      setRegionsByLine((prev) => ({
        ...prev,
        [region.id]: { lineId: region.id, start: region.start, end: region.end },
      }))
    })

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
      regionsPluginRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue?.audioUrl, dialogueId])

  function handleSelectLine(line: DialogueLineView) {
    setSelectedLineId(line.id)
    const regionsPlugin = regionsPluginRef.current
    const wavesurfer = wavesurferRef.current
    if (!regionsPlugin || !wavesurfer) return

    const existing = regionsPlugin.getRegions().find((r) => r.id === line.id)
    if (existing) {
      existing.play(true)
      return
    }

    // No region yet for this line: create a short default region at the
    // current playhead position so the admin has something to drag from,
    // rather than an empty timeline with no starting point.
    const duration = wavesurfer.getDuration()
    const start = wavesurfer.getCurrentTime()
    const end = Math.min(duration, start + 2)
    regionsPlugin.addRegion({ id: line.id, start, end, color: REGION_COLOR })
    setRegionsByLine((prev) => ({ ...prev, [line.id]: { lineId: line.id, start, end } }))
  }

  function handlePreview(lineId: string) {
    const regionsPlugin = regionsPluginRef.current
    if (!regionsPlugin) return
    const region = regionsPlugin.getRegions().find((r) => r.id === lineId)
    // `play(true)` stops at the region's end, so preview plays ONLY the marked
    // segment instead of continuing through the rest of the dialogue.
    region?.play(true)
  }

  async function handleConfirm() {
    if (!dialogue?.audioUrl) return
    const entries = Object.values(regionsByLine)
    if (entries.length === 0) return

    setIsSaving(true)
    setSaveError(null)
    try {
      const response = await fetch(dialogue.audioUrl)
      const arrayBuffer = await response.arrayBuffer()
      const audioContext = new AudioContext()
      let fullBuffer: AudioBuffer
      try {
        fullBuffer = await audioContext.decodeAudioData(arrayBuffer)
      } finally {
        void audioContext.close()
      }

      const linesPayload = []
      for (const region of entries) {
        const sampleRate = fullBuffer.sampleRate
        const startSample = Math.floor(region.start * sampleRate)
        const endSample = Math.floor(region.end * sampleRate)
        const frameCount = endSample - startSample
        if (frameCount <= 0) continue

        const offlineContext = new OfflineAudioContext(
          fullBuffer.numberOfChannels,
          frameCount,
          sampleRate
        )
        const source = offlineContext.createBufferSource()
        source.buffer = fullBuffer
        source.connect(offlineContext.destination)
        source.start(0, region.start, region.end - region.start)
        const renderedBuffer = await offlineContext.startRendering()

        const wavBlob = encodeAudioBufferAsWav(renderedBuffer)
        const uploadForm = new FormData()
        uploadForm.append("file", wavBlob, `${region.lineId}.wav`)
        uploadForm.append("lineId", region.lineId)

        const uploadRes = await fetch(
          `/api/lessons/${lessonId}/dialogues/${dialogueId}/trim/upload`,
          { method: "POST", body: uploadForm }
        )
        if (!uploadRes.ok) throw new Error("Tải lên audio đã cắt thất bại.")
        const { publicUrl } = (await uploadRes.json()) as { publicUrl: string }

        linesPayload.push({
          id: region.lineId,
          audioUrl: publicUrl,
          startTime: region.start,
          endTime: region.end,
        })
      }

      const patchRes = await fetch(
        `/api/lessons/${lessonId}/dialogues/${dialogueId}/trim`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: linesPayload }),
        }
      )
      if (!patchRes.ok) {
        const body = (await patchRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? "Lưu audio đã cắt thất bại.")
      }

      router.push(`/lessons/${lessonId}/edit`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Cắt/lưu audio thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </main>
    )
  }

  if (!lesson || !dialogue) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </main>
    )
  }

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/lessons/${lessonId}/edit`} label="Quay lại bài học" />
      </div>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 pb-16">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Cắt audio hội thoại</h1>

        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}

        {dialogue.audioUrl ? (
          <div ref={containerRef} className="rounded-lg border bg-card p-4" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Hội thoại này chưa có audio để cắt.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {dialogue.lines.map((line) => (
            <div
              key={line.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                selectedLineId === line.id ? "border-primary" : ""
              }`}
            >
              <button
                type="button"
                className="field-zh flex-1 text-left"
                onClick={() => handleSelectLine(line)}
              >
                {line.textZh}
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => handlePreview(line.id)}>
                Nghe thử
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" onClick={handleConfirm} disabled={isSaving}>
          {isSaving ? "Đang xử lý..." : "Xác nhận"}
        </Button>
      </main>
    </>
  )
}
