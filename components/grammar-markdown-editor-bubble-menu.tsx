'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'

// Notion/Google Docs-style floating toolbar for a text selection: the most
// commonly reached-for formatting actions, so editors don't need to learn
// the "/" slash-command syntax for everyday bold/italic/heading changes.
export default function GrammarMarkdownBubbleMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor, state }) => {
        const { from, to } = state.selection
        // Hide while the selection is inside a table - TableBubbleMenu owns that context.
        return from !== to && !editor.isActive('table')
      }}
      className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded px-2 py-1 text-sm font-bold hover:bg-muted ${editor.isActive('bold') ? 'bg-muted' : ''}`}
      >
        B
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded px-2 py-1 text-sm italic hover:bg-muted ${editor.isActive('italic') ? 'bg-muted' : ''}`}
      >
        I
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`rounded px-2 py-1 text-sm line-through hover:bg-muted ${editor.isActive('strike') ? 'bg-muted' : ''}`}
      >
        S
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`rounded px-2 py-1 font-mono text-sm hover:bg-muted ${editor.isActive('code') ? 'bg-muted' : ''}`}
      >
        {'</>'}
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      {([1, 2, 3] as const).map((level) => (
        <button
          key={level}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          className={`rounded px-2 py-1 text-sm hover:bg-muted ${editor.isActive('heading', { level }) ? 'bg-muted' : ''}`}
        >
          H{level}
        </button>
      ))}
    </BubbleMenu>
  )
}
