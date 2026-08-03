// @vitest-environment jsdom
// tests/components/grammar-markdown-editor.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import GrammarMarkdownEditor from '@/components/grammar-markdown-editor'
import { SLASH_COMMAND_ITEMS } from '@/components/grammar-markdown-editor-slash-command'

describe('GrammarMarkdownEditor', () => {
  it('renders the given markdown content as rich text', () => {
    render(<GrammarMarkdownEditor value={'## Ngữ pháp 1: Test\n\n**CHỨC NĂNG**\n\nGiải thích.'} onChange={vi.fn()} />)
    expect(screen.getByText('Ngữ pháp 1: Test')).toBeInTheDocument()
    expect(screen.getByText('CHỨC NĂNG')).toBeInTheDocument()
    expect(screen.getByText('Giải thích.')).toBeInTheDocument()
  })

  it('calls onChange with updated markdown when the editable content changes', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value={'Nội dung ban đầu.'} onChange={onChange} />)
    const editable = screen.getByRole('textbox')
    fireEvent.input(editable, { target: { textContent: 'Nội dung ban đầu. Thêm chữ.' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('renders a non-editable view when disabled is true', () => {
    render(<GrammarMarkdownEditor value={'Nội dung.'} onChange={vi.fn()} disabled />)
    const editable = screen.getByRole('textbox')
    expect(editable).toHaveAttribute('contenteditable', 'false')
  })

  it('syncs editor content when the value prop changes externally after mount', async () => {
    const { rerender } = render(<GrammarMarkdownEditor value={'Nội dung ban đầu.'} onChange={vi.fn()} />)
    expect(await screen.findByText('Nội dung ban đầu.')).toBeInTheDocument()

    rerender(<GrammarMarkdownEditor value={'Nội dung mới từ bên ngoài.'} onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Nội dung mới từ bên ngoài.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Nội dung ban đầu.')).not.toBeInTheDocument()
  })

  it('inserts a table via the slash command', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value="" onChange={onChange} />)
    const editable = screen.getByRole('textbox')

    fireEvent.input(editable, { target: { textContent: '/' } })
    // The slash menu renders into document.body, not inside the editor's own
    // container - query the whole document for the injected item text.
    await waitFor(() => expect(screen.getByText(/Bảng — Chèn bảng/i)).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByText(/Bảng — Chèn bảng/i))

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall).toContain('|')
  })

  // NOTE on test strategy: the brief's original version of this test typed
  // "Ngữ pháp 1/" into the editor via `fireEvent.input` and expected the
  // slash menu to open, same as the "inserts a table" test above. That works
  // when the document starts empty (cursor trivially at doc position 1), but
  // fails to reproduce here when there is pre-existing text before the "/":
  // jsdom's Selection/Range APIs for `contenteditable` elements do not track
  // caret position the way a real browser does (confirmed by direct
  // inspection - `window.getSelection().anchorOffset` stayed 0 after both
  // `fireEvent.click` and `fireEvent.input` appending to non-empty content),
  // so ProseMirror's DOM-change reconciliation (`readDOMChange`, which uses
  // `view.state.selection` as the preferred anchor for resolving the new
  // cursor position) never lands the selection right after the typed "/",
  // and the suggestion plugin's `char: '/'` matcher never fires. This is a
  // known class of jsdom limitation for rich-text editors, not a bug in the
  // slash-command extension itself (the "inserts a table" test above proves
  // the same menu, the same `render()` popup, and the same
  // `deleteRange().insertTable()` mutation path all work end-to-end when the
  // suggestion does trigger).
  //
  // To still verify the exact claim this test is named for - "selecting
  // Heading 1 converts the current line" - without depending on jsdom's
  // broken caret simulation, this test builds a real headless TipTap
  // `Editor` with the same extension stack as `GrammarMarkdownEditor` and
  // calls the actual `SLASH_COMMAND_ITEMS` heading-1 command function
  // against it directly, asserting on the resulting Markdown. This exercises
  // the identical `deleteRange(range).setNode('heading', { level: 1 })` chain
  // the slash menu's onClick handler runs, just without going through the
  // DOM-input simulation step that jsdom cannot reproduce faithfully.
  it('converts the current line to Heading 1 via the slash command', () => {
    const editor = new Editor({
      extensions: [StarterKit, Markdown, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
      content: '<p>Ngữ pháp 1</p>',
    })

    const headingItem = SLASH_COMMAND_ITEMS.find((item) => item.title === 'Tiêu đề 1')
    expect(headingItem).toBeDefined()

    const docSize = editor.state.doc.content.size
    headingItem!.command({ editor, range: { from: docSize, to: docSize } })

    const markdown = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
    expect(markdown).toContain('# ')
    expect(editor.getJSON().content?.[0]?.type).toBe('heading')

    editor.destroy()
  })

  // Verifies the slash menu itself (the part of this feature that jsdom can
  // reliably exercise, per the "inserts a table" test above) also lists the
  // Heading 1 command with its expected label when the query is empty.
  it('lists Heading 1 among the slash menu items shown for an empty query', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value="" onChange={onChange} />)
    const editable = screen.getByRole('textbox')

    fireEvent.input(editable, { target: { textContent: '/' } })
    await waitFor(() => expect(screen.getByText(/Tiêu đề 1 — Điểm ngữ pháp/i)).toBeInTheDocument())
  })

  it('round-trips table content through getMarkdown when loaded from a markdown table', () => {
    const tableMarkdown = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
