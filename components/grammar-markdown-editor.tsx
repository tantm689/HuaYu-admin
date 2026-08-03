'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { useEffect } from 'react'

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
    extensions: [StarterKit, Markdown],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown())
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return (
    <div className="rounded-md border bg-background p-4">
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none"
      />
    </div>
  )
}
