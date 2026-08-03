"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface EditableTextProps {
  value: string
  onChange: (value: string) => void
  /** Shown in muted italic when `value` is empty and the field isn't focused. */
  placeholder?: string
  /** Applied to both the reading and the editing view so text doesn't shift. */
  className?: string
  disabled?: boolean
}

// Reads as plain text until clicked, then becomes a textarea in place.
// Admins spend most of their time comparing extracted content against the
// source PDF, not typing - rendering every field as a permanently-open input
// buried the content in a grid of empty boxes. The textarea keeps the same
// font/size/spacing as the reading view so nothing jumps when it opens.
export function EditableText({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    // Put the caret at the end rather than selecting everything, so a click
    // to fix one character doesn't risk wiping the whole field.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [isEditing])

  // Auto-grow the textarea to fit its content via JS instead of the CSS
  // `field-sizing-content` property: that property was observed to break
  // paste-over-selection in Chrome/Edge (Ctrl+V while text is selected only
  // inserted instead of replacing) - resizing here after paste/type via a
  // plain height recalculation avoids interfering with the browser's own
  // paste-selection handling.
  useEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [isEditing, value])

  if (isEditing && !disabled) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Escape") setIsEditing(false)
        }}
        className={cn(
          "w-full min-w-0 resize-none overflow-hidden rounded-md border border-ring bg-background px-2 py-1 outline-none",
          className
        )}
      />
    )
  }

  const isEmpty = value.trim() === ""

  return (
    <div
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      onClick={(e) => {
        if (disabled) return
        // Stop the click from also toggling an ancestor <AccordionTrigger>
        // when this field is rendered inside one (e.g. an editable heading).
        e.stopPropagation()
        setIsEditing(true)
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          setIsEditing(true)
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-md border border-transparent px-2 py-1 whitespace-pre-wrap",
        !disabled && "cursor-text hover:border-border hover:bg-muted/40",
        isEmpty && "text-muted-foreground italic",
        className
      )}
    >
      {isEmpty ? (placeholder ?? "—") : value}
    </div>
  )
}
