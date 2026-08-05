'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { createPortal } from 'react-dom'

// A small "Sửa bảng" toggle button pinned to each table's own top-right
// corner - clicking it opens a compact row/column/merge toolbar right
// there. Replaces two earlier approaches that were both reported as
// unreliable or unwanted: hover-driven Notion-style row/column handles
// (positioning math never worked out cleanly), and a toolbar that opened
// automatically on any click inside a table cell (felt like it popped up
// unprompted, and in practice the "click inside a cell" signal frequently
// failed to register before the state update it depended on landed). An
// explicit, always-visible-but-unobtrusive button removes that guesswork -
// it's just a plain click handler on a button that always exists once a
// table exists, no DOM-click interception needed.
export default function GrammarMarkdownTableToolbar({ editor }: { editor: Editor }) {
  const [tables, setTables] = useState<HTMLElement[]>([])

  useEffect(() => {
    const dom = editor.view.dom

    const refreshTables = () => {
      setTables(Array.from(dom.querySelectorAll('.tableWrapper')))
    }

    refreshTables()
    editor.on('update', refreshTables)
    return () => {
      editor.off('update', refreshTables)
    }
  }, [editor])

  return (
    <>
      {tables.map((wrapper, index) => (
        <TableEditButton key={index} editor={editor} wrapper={wrapper} />
      ))}
    </>
  )
}

function TableEditButton({ editor, wrapper }: { editor: Editor; wrapper: HTMLElement }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative'
    }
  }, [wrapper])

  // If the selection is already inside THIS table (the user clicked a cell
  // before opening the panel), row/column commands act on that cell as-is.
  // Otherwise - e.g. they went straight for the "Sửa bảng" button - fall
  // back to the first DATA cell (skip the header row) rather than the
  // table's first cell outright. An earlier version always reset to the
  // very first cell regardless, which for a table with a header row meant
  // "Xoá hàng" always deleted the HEADER row: the resulting table had data
  // rows but no header, which GFM Markdown tables cannot represent, and
  // tiptap-markdown's serializer silently fell back to embedding the whole
  // table as raw HTML - unparseable back into structured cells next load.
  const runInTable = (run: () => void) => {
    if (!editor.isActive('table')) {
      const cell = (wrapper.querySelector('tbody tr td') ?? wrapper.querySelector('td, th')) as HTMLElement | null
      if (!cell) return
      const target = cell.querySelector('p') ?? cell
      editor.commands.setTextSelection(editor.view.posAtDOM(target, 0))
    }
    run()
  }

  const button = (label: string, run: () => void, extraClassName = '') => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`rounded px-2 py-1 text-xs hover:bg-muted ${extraClassName}`}
    >
      {label}
    </button>
  )

  return createPortal(
    <div className="absolute -top-3 right-0 z-10">
      <button
        type="button"
        aria-label="Sửa bảng"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="rounded border bg-background/80 px-2 py-0.5 text-xs text-muted-foreground opacity-60 shadow-sm hover:opacity-100"
      >
        ✏️ Sửa bảng
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 flex w-max flex-wrap items-center gap-1 rounded-md border bg-popover p-1 shadow-md">
          {button('+ Hàng trên', () => runInTable(() => editor.chain().focus().addRowBefore().run()))}
          {button('+ Hàng dưới', () => runInTable(() => editor.chain().focus().addRowAfter().run()))}
          {button('Xoá hàng', () => runInTable(() => editor.chain().focus().deleteRow().run()), 'text-destructive')}
          <div className="mx-1 h-4 w-px bg-border" />
          {button('+ Cột trái', () => runInTable(() => editor.chain().focus().addColumnBefore().run()))}
          {button('+ Cột phải', () => runInTable(() => editor.chain().focus().addColumnAfter().run()))}
          {button('Xoá cột', () => runInTable(() => editor.chain().focus().deleteColumn().run()), 'text-destructive')}
          <div className="mx-1 h-4 w-px bg-border" />
          {button('Gộp ô', () => editor.chain().focus().mergeCells().run())}
          {button('Tách ô', () => editor.chain().focus().splitCell().run())}
          <div className="mx-1 h-4 w-px bg-border" />
          {button('Xoá bảng', () => runInTable(() => editor.chain().focus().deleteTable().run()), 'text-destructive font-medium')}
        </div>
      )}
    </div>,
    wrapper
  )
}
