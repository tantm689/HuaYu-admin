'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'

// Notion-style floating toolbar shown whenever the cursor sits inside a
// table: row/column insert+delete plus whole-table delete, since TipTap's
// Table extension only exposes these as editor.commands.* with no built-in
// UI - editors would otherwise have no way to resize a table's shape at all.
export default function GrammarMarkdownTableMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor }) => editor.isActive('table')}
      className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().addRowBefore().run()}
        className="rounded px-2 py-1 text-xs hover:bg-muted"
      >
        + Hàng trên
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        className="rounded px-2 py-1 text-xs hover:bg-muted"
      >
        + Hàng dưới
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteRow().run()}
        className="rounded px-2 py-1 text-xs text-destructive hover:bg-muted"
      >
        Xoá hàng
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        className="rounded px-2 py-1 text-xs hover:bg-muted"
      >
        + Cột trái
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        className="rounded px-2 py-1 text-xs hover:bg-muted"
      >
        + Cột phải
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
        className="rounded px-2 py-1 text-xs text-destructive hover:bg-muted"
      >
        Xoá cột
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteTable().run()}
        className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-muted"
      >
        Xoá bảng
      </button>
    </BubbleMenu>
  )
}
