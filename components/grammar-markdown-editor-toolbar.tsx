'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'

// Formatting bubble menu: shown only when the user has an actual (non-empty)
// text selection - not on every focus/cursor placement. Two earlier
// versions were tried and both rejected: a fixed bar pinned to the top
// (had to scroll up to reach it on every edit) and a version that showed
// whenever the editor was merely focused (felt like it was always in the
// way). Only appearing on a real selection, like Word/Google Docs/Notion's
// own text toolbar, means it only shows up right when there's something to
// apply formatting to.
export default function GrammarMarkdownToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive('bold'),
      italic: ctx.editor.isActive('italic'),
      strike: ctx.editor.isActive('strike'),
      code: ctx.editor.isActive('code'),
      heading1: ctx.editor.isActive('heading', { level: 1 }),
      heading2: ctx.editor.isActive('heading', { level: 2 }),
      heading3: ctx.editor.isActive('heading', { level: 3 }),
      bulletList: ctx.editor.isActive('bulletList'),
      orderedList: ctx.editor.isActive('orderedList'),
    }),
  })

  const button = (
    label: string,
    isActive: boolean,
    onClick: () => void,
    extraClassName = ''
  ) => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-sm hover:bg-muted ${isActive ? 'bg-muted' : ''} ${extraClassName}`}
    >
      {label}
    </button>
  )

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="grammarMarkdownToolbar"
      shouldShow={({ editor, from, to }) => editor.isEditable && from !== to && !editor.isActive('table')}
      className="flex flex-wrap items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
    >
      {button('B', state.bold, () => editor.chain().focus().toggleBold().run(), 'font-bold')}
      {button('I', state.italic, () => editor.chain().focus().toggleItalic().run(), 'italic')}
      {button('S', state.strike, () => editor.chain().focus().toggleStrike().run(), 'line-through')}
      {button('</>', state.code, () => editor.chain().focus().toggleCode().run(), 'font-mono')}
      <div className="mx-1 h-4 w-px bg-border" />
      {button('H1', state.heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {button('H2', state.heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {button('H3', state.heading3, () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
      <div className="mx-1 h-4 w-px bg-border" />
      {button('1. Danh sách', state.orderedList, () => editor.chain().focus().toggleOrderedList().run())}
      {button('• Danh sách', state.bulletList, () => editor.chain().focus().toggleBulletList().run())}
      <div className="mx-1 h-4 w-px bg-border" />
      {button('Bảng', false, () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      )}
    </BubbleMenu>
  )
}
