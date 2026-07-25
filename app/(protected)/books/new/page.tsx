"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"

export default function NewBookPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [volume, setVolume] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!file) {
      setError("Please choose a PDF file.")
      return
    }

    setIsSubmitting(true)

    const form = new FormData()
    form.set("title", title)
    form.set("volume", volume)
    form.set("file", file)

    const res = await fetch("/api/books", { method: "POST", body: form })

    setIsSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to upload book.")
      return
    }

    const book = await res.json()
    router.push(`/books/${book.id}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-start justify-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Thêm sách mới</CardTitle>
          <CardDescription>
            Tải lên tệp PDF của sách giáo khoa để bắt đầu trích xuất nội dung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-sm font-medium">
                Tên sách
              </label>
              <Input
                id="title"
                name="title"
                type="text"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="volume" className="text-sm font-medium">
                Tập / Quyển
              </label>
              <Input
                id="volume"
                name="volume"
                type="text"
                value={volume}
                onChange={(event) => setVolume(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="file" className="text-sm font-medium">
                Tệp PDF
              </label>
              <Input
                id="file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Đang tải lên..." : "Tải lên"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
