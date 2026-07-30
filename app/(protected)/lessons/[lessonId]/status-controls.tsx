"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { LessonStatus } from "@/lib/db/types"
import type { VariantProps } from "class-variance-authority"

interface Props {
  lessonId: string
  status: LessonStatus
  // Called after a successful transition so callers that hold their own
  // client-side copy of the lesson (like the edit page's `data` state) can
  // refetch it - router.refresh() alone only re-runs Server Components and
  // does nothing for state a Client Component fetched itself.
  onStatusChange?: () => void
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

const statusLabel: Record<LessonStatus, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
}

const statusVariant: Record<LessonStatus, BadgeVariant> = {
  draft: "pending",
  published: "success",
}

export function LessonStatusControls({ lessonId, status, onStatusChange }: Props) {
  const router = useRouter()
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function transition(nextStatus: LessonStatus) {
    setIsUpdating(true)
    setError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/publish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Cập nhật trạng thái thất bại.")
      }
      router.refresh()
      onStatusChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật trạng thái thất bại.")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>

      {/* draft -> published is handled by the edit page's combined "Xuất bản"
          button (saves content + publishes in one click), not here. */}
      {status === "published" && (
        <Button size="sm" variant="outline" onClick={() => transition("draft")} disabled={isUpdating}>
          {isUpdating ? "Đang cập nhật..." : "Chuyển về nháp"}
        </Button>
      )}
    </div>
  )
}
