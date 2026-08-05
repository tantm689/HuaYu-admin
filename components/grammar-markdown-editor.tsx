'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { useEffect } from 'react'
import { createSlashCommandExtension } from './grammar-markdown-editor-slash-command'
import GrammarMarkdownBubbleMenu from './grammar-markdown-editor-bubble-menu'
import GrammarMarkdownTableMenu from './grammar-markdown-editor-table-menu'

type EditorWithMarkdown = Editor & { storage: { markdown: MarkdownStorage } }

export default function GrammarMarkdownEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (markdown: string) => void
  disabled?: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      createSlashCommandExtension(),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange((editor as EditorWithMarkdown).storage.markdown.getMarkdown())
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const currentMarkdown = (editor as EditorWithMarkdown).storage.markdown.getMarkdown()
    if (value !== currentMarkdown) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  return (
    <div className="rounded-md border bg-background p-4">
      {editor && <GrammarMarkdownBubbleMenu editor={editor} />}
      {editor && <GrammarMarkdownTableMenu editor={editor} />}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_.tableWrapper]:overflow-x-auto [&_table]:border-collapse [&_table]:w-full [&_td]:relative [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:relative [&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:p-2 [&_.column-resize-handle]:absolute [&_.column-resize-handle]:right-[-2px] [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:bottom-0 [&_.column-resize-handle]:w-1 [&_.column-resize-handle]:bg-primary/50 [&_.column-resize-handle]:cursor-col-resize [&_.column-resize-handle]:pointer-events-auto [&_.selectedCell]:bg-primary/10 [&.resize-cursor]:cursor-col-resize"
      />
    </div>
  )
}
