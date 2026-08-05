// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import GrammarMarkdownEditor from '@/components/grammar-markdown-editor'

const tableMarkdown = 'Trước bảng.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

describe('GrammarMarkdownTableToolbar', () => {
  it('does not show table controls right after mounting, even though the cursor lands in a table cell by default', async () => {
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.queryByText('Xoá bảng')).not.toBeInTheDocument()
  })

  it('shows table controls only after clicking inside a table cell', async () => {
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    const cell = screen.getByText('1')
    fireEvent.click(cell)

    await waitFor(() => expect(screen.getByText('Xoá bảng')).toBeInTheDocument())
    expect(screen.getByText('+ Hàng dưới')).toBeInTheDocument()
    expect(screen.getByText('+ Cột phải')).toBeInTheDocument()
  })

  it('hides table controls again after clicking outside the table', async () => {
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    fireEvent.click(screen.getByText('1'))
    await waitFor(() => expect(screen.getByText('Xoá bảng')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Trước bảng.'))
    await waitFor(() => expect(screen.queryByText('Xoá bảng')).not.toBeInTheDocument())
  })

  it('deleting a row via the table toolbar removes it and keeps the other row', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value={tableMarkdown} onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    fireEvent.click(screen.getByText('1'))
    await waitFor(() => expect(screen.getByText('Xoá hàng')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Xoá hàng'))

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string
    expect(lastCall).not.toContain('| 1 | 2 |')
    expect(lastCall).toContain('| 3 | 4 |')
  })
})
