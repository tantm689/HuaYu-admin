"use client"

import { use, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface Props {
  params: Promise<{ bookId: string }>
}

interface UploadResult {
  matchedCount: number
  unmatched: string[]
}

export default function DialogueAudioUploadPage({ params }: Props) {
  const { bookId } = use(params)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []))
    setResult(null)
    setError(null)
  }

  async function handleUpload() {
    if (files.length === 0) return

    setIsUploading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    for (const file of files) {
      form.append("files", file)
    }

    try {
      const res = await fetch(`/api/books/${bookId}/audio`, {
        method: "POST",
        body: form,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Tải lên thất bại.")
      }

      const json = (await res.json()) as UploadResult
      setResult(json)
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải lên thất bại.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Gắn audio hội thoại</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn nhiều file .mp3 — hệ thống sẽ tự khớp theo tên file (không phân biệt hoa/thường,
            bỏ đuôi .mp3) với mã audio của hội thoại.
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/books/${bookId}`}>Quay lại</Link>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chọn file audio</CardTitle>
          <CardDescription>
            Tên file phải trùng với mã audio của hội thoại, ví dụ: 01-1.mp3
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <Input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg"
            multiple
            onChange={handleFilesChange}
          />

          {files.length > 0 && (
            <p className="text-sm text-muted-foreground">Đã chọn {files.length} file.</p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="self-start"
          >
            {isUploading ? "Đang tải lên..." : "Tải lên"}
          </Button>
        </div>
      </Card>

      {result && (
        <section className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Kết quả</CardTitle>
              <CardDescription>
                Đã khớp {result.matchedCount} file với hội thoại.
              </CardDescription>
            </CardHeader>
            {result.unmatched.length > 0 && (
              <div className="flex flex-col gap-2 px-6 pb-6">
                <p className="text-sm font-medium">
                  Không khớp được ({result.unmatched.length}) — đổi tên file rồi thử lại:
                </p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {result.unmatched.map((filename) => (
                    <li key={filename}>{filename}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </section>
      )}
    </main>
  )
}
