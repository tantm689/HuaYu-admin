// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { CellSelection } from '@tiptap/pm/tables'
import { Markdown } from 'tiptap-markdown'
import GrammarMarkdownEditor from '@/components/grammar-markdown-editor'

const tableMarkdown = 'Trước bảng.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

const twoTableMarkdown = [
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  'Giữa hai bảng.',
  '',
  '| C | D |',
  '| --- | --- |',
  '| 3 | 4 |',
].join('\n')

describe('GrammarMarkdownTableToolbar', () => {
  it('shows an "Sửa bảng" toggle button as soon as a table exists, with the row/column panel closed by default', async () => {
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa bảng' })).toBeInTheDocument())
    expect(screen.queryByText('Xoá bảng')).not.toBeInTheDocument()
  })

  it('opens the row/column panel on clicking the toggle button, and closes it on a second click', async () => {
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    const toggle = await screen.findByRole('button', { name: 'Sửa bảng' })

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('Xoá bảng')).toBeInTheDocument())
    expect(screen.getByText('+ Hàng dưới')).toBeInTheDocument()
    expect(screen.getByText('+ Cột phải')).toBeInTheDocument()
    expect(screen.getByText('Gộp ô')).toBeInTheDocument()
    expect(screen.getByText('Tách ô')).toBeInTheDocument()

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.queryByText('Xoá bảng')).not.toBeInTheDocument())
  })

  it('deleting a row via the table toolbar removes it and keeps the other row', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={onChange} />)
    const toggle = await screen.findByRole('button', { name: 'Sửa bảng' })
    fireEvent.click(toggle)

    await waitFor(() => expect(screen.getByText('Xoá hàng')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Xoá hàng'))

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string
    expect(lastCall).not.toContain('| 1 | 2 |')
    expect(lastCall).toContain('| 3 | 4 |')
  })

  // Merge/split are driven by editor.commands.mergeCells()/splitCell(),
  // which act on the editor's current CellSelection (a multi-cell
  // selection the user creates by dragging across cells in a real browser)
  // - not something GrammarMarkdownTableToolbar itself constructs. jsdom
  // can't simulate a real cell-drag selection, so this verifies the actual
  // TipTap/ProseMirror command pair directly against a headless Editor with
  // the same extension stack as the real component, matching this test
  // suite's established pattern for that class of jsdom limitation.
  it('mergeCells/splitCell act on a multi-cell selection, and round-trip back through split', () => {
    const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const editor = new Editor({
      extensions: [StarterKit, Markdown, Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
      content: markdown,
    })

    let firstCellPos = -1
    let secondCellPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        if (firstCellPos === -1) firstCellPos = pos
        else if (secondCellPos === -1) secondCellPos = pos
      }
    })
    expect(firstCellPos).toBeGreaterThan(-1)
    expect(secondCellPos).toBeGreaterThan(-1)

    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, firstCellPos, secondCellPos)))

    const merged = editor.commands.mergeCells()
    expect(merged).toBe(true)

    const mergedCell = editor.state.doc.nodeAt(firstCellPos)
    expect(mergedCell?.attrs.colspan).toBeGreaterThan(1)

    const split = editor.commands.splitCell()
    expect(split).toBe(true)
    const splitCell = editor.state.doc.nodeAt(firstCellPos)
    expect(splitCell?.attrs.colspan).toBe(1)

    editor.destroy()
  })

  it('shows one independent toggle button per table when a section has more than one', async () => {
    render(<GrammarMarkdownEditor value={twoTableMarkdown} onChange={vi.fn()} />)
    const toggles = await screen.findAllByRole('button', { name: 'Sửa bảng' })
    expect(toggles).toHaveLength(2)

    fireEvent.click(toggles[0])
    await waitFor(() => expect(screen.getAllByText('Xoá bảng')).toHaveLength(1))
    // The second table's panel is untouched - still closed.
    fireEvent.click(toggles[1])
    await waitFor(() => expect(screen.getAllByText('Xoá bảng')).toHaveLength(2))
  })
})
