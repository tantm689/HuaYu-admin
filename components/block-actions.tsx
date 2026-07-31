"use client"

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface BlockActionsProps {
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  removeLabel?: string
  className?: string
}

// Per-block controls that stay out of the way until you hover the block they
// belong to - the editor is read-first, and permanently visible buttons on
// every nested block turned the page into a wall of controls.
// Rendered inside a `group`-classed parent.
export function BlockActions({
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp = true,
  canMoveDown = true,
  removeLabel = "Xoá",
  className,
}: BlockActionsProps) {
  return (
    <div
      className={cn(
        // Hidden until the owning block is hovered/focused. Callers pass the
        // matching `group-hover/<name>:opacity-100` for their named group, so
        // nested blocks don't all light up at once.
        "flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100",
        className
      )}
    >
      {onMoveUp && (
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Di chuyển lên"
          title="Di chuyển lên"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
      )}
      {onMoveDown && (
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Di chuyển xuống"
          title="Di chuyển xuống"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          // The owning block watches for a hovered/focused [data-danger]
          // descendant to tint itself red, so the admin sees exactly how much
          // content the click is about to take with it (nested examples and
          // numbered items included) before committing.
          data-danger
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}
