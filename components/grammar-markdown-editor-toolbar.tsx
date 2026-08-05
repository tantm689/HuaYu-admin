'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'

// A toolbar that floats and follows the cursor - shown whenever the cursor
// sits anywhere in the editor content, not only once text is selected
// (BubbleMenu's default shouldShow requires a non-empty selection). A fixed
// bar pinned to the top of the editor was tried first, but scrolling up to
// reach it on every small edit was reported as unusable; a bar dropped
// entirely on selection was the version before that, reported the same way
// for the opposite reason (it disappeared as soon as the selection
// collapsed back to a cursor). This sits in between: always near wherever
// the cursor actually is.
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
      inTable: ctx.editor.isActive('table'),
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
      shouldShow={({ editor }) => editor.isEditable && editor.isFocused}
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
      {state.inTable && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          {button('+ Hàng trên', false, () => editor.chain().focus().addRowBefore().run())}
          {button('+ Hàng dưới', false, () => editor.chain().focus().addRowAfter().run())}
          {button('Xoá hàng', false, () => editor.chain().focus().deleteRow().run(), 'text-destructive')}
          {button('+ Cột trái', false, () => editor.chain().focus().addColumnBefore().run())}
          {button('+ Cột phải', false, () => editor.chain().focus().addColumnAfter().run())}
          {button('Xoá cột', false, () => editor.chain().focus().deleteColumn().run(), 'text-destructive')}
          {button('Xoá bảng', false, () => editor.chain().focus().deleteTable().run(), 'text-destructive font-medium')}
        </>
      )}
    </BubbleMenu>
  )
}
