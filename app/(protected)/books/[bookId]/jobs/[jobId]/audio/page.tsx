"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BackLink } from "@/components/back-link"
import type { ExtractionJob } from "@/lib/db/types"
import { ExtractionResultSchema, type ExtractionResult } from "@/lib/gemini/schema"
import type { TtsVoice } from "@/lib/tts/generateAudio"
import { dialogueDisplayNames } from "@/lib/dialogueDisplayName"

interface Props {
  params: Promise<{ bookId: string; jobId: string }>
}

const VOICE_OPTIONS: { value: TtsVoice; label: string }[] = [
  { value: "zh-TW-HsiaoChenNeural", label: "Hiểu Trân (nữ)" },
  { value: "zh-TW-YunJheNeural", label: "Vân Triết (nam)" },
]

type Row = {
  key: string
  dialogueIndex: number
  vocabIndex: number
  textZh: string
  caption: string
  audioUrl: string | null
  groupLabel: string
}

function collectRows(result: ExtractionResult): Row[] {
  const rows: Row[] = []

  const dialogueLabels = dialogueDisplayNames(result.dialogues)
  result.dialogues.forEach((dialogue, dIdx) => {
    const groupLabel = dialogueLabels[dIdx]
    dialogue.vocabulary.forEach((vocab, vIdx) => {
      rows.push({
        key: `${dIdx}-${vIdx}`,
        dialogueIndex: dIdx,
        vocabIndex: vIdx,
        textZh: vocab.wordZh,
        caption: vocab.meaningVi ?? "",
        audioUrl: vocab.audioUrl ?? null,
        groupLabel,
      })
    })
  })

  return rows
}

export default function JobAudioPage({ params }: Props) {
  const { bookId, jobId } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<ExtractionJob | null>(null)
  const [data, setData] = useState<ExtractionResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [voice, setVoice] = useState<TtsVoice>(VOICE_OPTIONS[0].value)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)

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
      if (jobData.raw_json) {
        const parsed = ExtractionResultSchema.safeParse(jobData.raw_json)
        setData(parsed.success ? parsed.data : (jobData.raw_json as ExtractionResult))
      }
      return jobData
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được công việc trích xuất.")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    // loadJob sets state synchronously before its first await - intentional
    // mount-time fetch, not a cascading-render bug, so the react-hooks rule
    // is suppressed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJob()
  }, [loadJob])

  async function generateOne(row: Row, useVoice: TtsVoice): Promise<void> {
    const res = await fetch(`/api/jobs/${jobId}/audio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialogueIndex: row.dialogueIndex, vocabIndex: row.vocabIndex, voice: useVoice }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Sinh audio thất bại cho "${row.textZh}".`)
    }
    const { audioUrl } = (await res.json()) as { audioUrl: string }
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, dIdx) => {
        if (dIdx !== row.dialogueIndex) return d
        return {
          ...d,
          vocabulary: d.vocabulary.map((v, vIdx) => (vIdx === row.vocabIndex ? { ...v, audioUrl } : v)),
        }
      })
      return { ...prev, dialogues }
    })
  }

  async function generateMissing(rows: Row[]) {
    const missing = rows.filter((r) => !r.audioUrl)
    if (missing.length === 0) return

    setIsGenerating(true)
    setGenerateError(null)
    setProgress({ done: 0, total: missing.length })

    try {
      for (const row of missing) {
        await generateOne(row, voice)
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }

      const res = await fetch(`/api/jobs/${jobId}/audio`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không thể chuyển trạng thái đã duyệt audio.")
      }
      await loadJob()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Sinh audio thất bại.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function regenerate(row: Row) {
    setRegeneratingKey(row.key)
    setGenerateError(null)
    try {
      await generateOne(row, voice)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Tạo lại audio thất bại.")
    } finally {
      setRegeneratingKey(null)
    }
  }

  if (isLoading) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">Đang tải...</main>
  }

  if (loadError || !job || !data) {
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

  const rows = collectRows(data)
  const missingCount = rows.filter((r) => !r.audioUrl).length

  const groups: { groupLabel: string; rows: Row[] }[] = []
  for (const row of rows) {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.groupLabel === row.groupLabel) {
      lastGroup.rows.push(row)
    } else {
      groups.push({ groupLabel: row.groupLabel, rows: [row] })
    }
  }

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/books/${bookId}/jobs/${jobId}`} label="Quay lại" />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sinh &amp; duyệt Audio</h1>
          <Badge variant={job.status === "audio_ready" || job.status === "quiz_ready" ? "info" : "pending"} className="mt-1">
            {job.status === "audio_ready" || job.status === "quiz_ready" ? "Đã duyệt audio" : "Đang chờ sinh audio"}
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/books/${bookId}/jobs/${jobId}`)}
          disabled={isGenerating || missingCount > 0}
        >
          Tiếp tục
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <label className="text-sm font-medium text-foreground" htmlFor="tts-voice">
          Giọng đọc
        </label>
        <select
          id="tts-voice"
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={voice}
          onChange={(e) => setVoice(e.target.value as TtsVoice)}
          disabled={isGenerating}
        >
          {VOICE_OPTIONS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Button
            type="button"
            onClick={() => generateMissing(rows)}
            disabled={isGenerating || missingCount === 0}
          >
            {isGenerating
              ? `Đang sinh... (${progress.done}/${progress.total})`
              : missingCount > 0
                ? `Sinh audio (${missingCount} mục)`
                : "Đã sinh đủ audio"}
          </Button>
        </div>
      </div>

      {generateError && <p className="text-sm text-destructive">{generateError}</p>}

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.groupLabel} className="rounded-xl border border-dashed bg-card p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">{group.groupLabel}</p>
            <div className="flex flex-col divide-y divide-border/60">
              {group.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="field-zh">{row.textZh}</p>
                    <p className="text-xs text-muted-foreground">{row.caption}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {row.audioUrl ? (
                      <audio controls preload="none" src={row.audioUrl} className="h-8 max-w-[12rem]" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa có audio</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerate(row)}
                      disabled={isGenerating || regeneratingKey === row.key}
                    >
                      {regeneratingKey === row.key ? "Đang tạo..." : "Tạo lại"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Không có từ vựng/ví dụ nào cần audio.</p>}
      </div>
      </main>
    </>
  )
}
