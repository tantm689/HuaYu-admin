'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

// A compact row/column toolbar for tables - shown only after the user
// clicks inside a table cell, not automatically whenever the cursor merely
// passes through or sits in one. Listens for a click landing inside the
// rendered <table> DOM and toggles visibility from that, rather than
// tracking selection/cursor state continuously (which was reported as
// popping up unprompted and getting in the way).
export default function GrammarMarkdownTableToolbar({ editor }: { editor: Editor }) {
  const [visible, setVisible] = useState(false)
  // The cell the user actually clicked, resolved to a document position -
  // row/column commands are run against a selection explicitly set from
  // this rather than trusting editor.state.selection at click time, since
  // ProseMirror's own click-driven selection update can still be pending
  // (one tick behind) when this component's own click handler and the
  // resulting button click run, which otherwise silently ran commands
  // against whatever cell the selection happened to already be in.
  const [clickedCellPos, setClickedCellPos] = useState<number | null>(null)

  useEffect(() => {
    const dom = editor.view.dom

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const cell = target.closest('td, th') as HTMLElement | null
      if (cell) {
        setClickedCellPos(editor.view.posAtDOM(cell, 0))
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    const handleBlur = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      if (!next || !dom.contains(next)) setVisible(false)
    }

    dom.addEventListener('click', handleClick)
    dom.addEventListener('focusout', handleBlur)
    return () => {
      dom.removeEventListener('click', handleClick)
      dom.removeEventListener('focusout', handleBlur)
    }
  }, [editor])

  // `visible` (driven by whether the click landed inside a <table>) is
  // already the authoritative signal for this - deliberately not also
  // gating on editor.isActive('table') here, since ProseMirror's own
  // selection update in response to the same click can lag one render
  // behind this component's click handler, which made the toolbar fail to
  // appear on the very click that should have shown it.
  if (!visible || clickedCellPos === null) return null

  const button = (label: string, run: () => void, extraClassName = '') => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.commands.setTextSelection(clickedCellPos)
        run()
      }}
      className={`rounded px-2 py-1 text-xs hover:bg-muted ${extraClassName}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 p-1">
      {button('+ Hàng trên', () => editor.chain().focus().addRowBefore().run())}
      {button('+ Hàng dưới', () => editor.chain().focus().addRowAfter().run())}
      {button('Xoá hàng', () => editor.chain().focus().deleteRow().run(), 'text-destructive')}
      <div className="mx-1 h-4 w-px bg-border" />
      {button('+ Cột trái', () => editor.chain().focus().addColumnBefore().run())}
      {button('+ Cột phải', () => editor.chain().focus().addColumnAfter().run())}
      {button('Xoá cột', () => editor.chain().focus().deleteColumn().run(), 'text-destructive')}
      <div className="mx-1 h-4 w-px bg-border" />
      {button('Xoá bảng', () => editor.chain().focus().deleteTable().run(), 'text-destructive font-medium')}
    </div>
  )
}
