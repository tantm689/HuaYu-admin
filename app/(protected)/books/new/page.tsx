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
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, volume }),
    })

    setIsSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to create book.")
      return
    }

    const book = await res.json()
    router.push(`/books/${book.id}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-start justify-center bg-background px-4 py-16 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Thêm sách mới</CardTitle>
          <CardDescription>
            Nhập thông tin sách giáo khoa để bắt đầu tạo bài học. Tệp PDF sẽ được chọn riêng cho từng bài học.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-sm font-medium text-foreground">
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
              <label htmlFor="volume" className="text-sm font-medium text-foreground">
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
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Đang tạo..." : "Tạo sách"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
