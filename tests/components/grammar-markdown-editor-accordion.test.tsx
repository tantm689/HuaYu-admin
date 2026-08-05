// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import GrammarMarkdownEditor from '@/components/grammar-markdown-editor'

const twoPointMarkdown = [
  '## Ngữ pháp 1: Cách đặt câu hỏi',
  '',
  '**CHỨC NĂNG**',
  '',
  'Giải thích điểm 1.',
  '',
  '## Ngữ pháp 2: Trợ từ 嗎',
  '',
  '**CHỨC NĂNG**',
  '',
  'Giải thích điểm 2.',
].join('\n')

describe('GrammarMarkdownEditor accordion', () => {
  it('renders one accordion trigger per grammar point, all expanded by default', () => {
    render(<GrammarMarkdownEditor value={twoPointMarkdown} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cách đặt câu hỏi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trợ từ 嗎' })).toBeInTheDocument()
    // Both expanded by default - both bodies' text should be visible at once.
    expect(screen.getByText('Giải thích điểm 1.')).toBeInTheDocument()
    expect(screen.getByText('Giải thích điểm 2.')).toBeInTheDocument()
  })

  it('collapses and re-expands one section independently of the other', async () => {
    render(<GrammarMarkdownEditor value={twoPointMarkdown} onChange={vi.fn()} />)
    const trigger1 = screen.getByRole('button', { name: 'Cách đặt câu hỏi' })

    fireEvent.click(trigger1)
    await waitFor(() => expect(trigger1).toHaveAttribute('aria-expanded', 'false'))
    // The other section stays open and its content stays visible.
    expect(screen.getByText('Giải thích điểm 2.')).toBeInTheDocument()

    fireEvent.click(trigger1)
    await waitFor(() => expect(trigger1).toHaveAttribute('aria-expanded', 'true'))
  })

  it('editing one section only calls onChange with that section changed, leaving the other section byte-identical', async () => {
    const onChange = vi.fn()
    render(<GrammarMarkdownEditor value={twoPointMarkdown} onChange={onChange} />)

    const editables = screen.getAllByRole('textbox')
    expect(editables).toHaveLength(2)
    // fireEvent.input with a textContent override replaces the WHOLE
    // editable's DOM content in jsdom, including sibling elements like the
    // section's own heading - not just an appended text node the way a real
    // keystroke would. Appending the new text onto the section's own full
    // existing textContent (heading included) avoids that false signal,
    // matching the pattern already used elsewhere in this test suite for
    // non-empty starting content.
    const section1Text = editables[0].textContent ?? ''
    fireEvent.input(editables[0], { target: { textContent: `${section1Text} Thêm chữ.` } })

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string
    expect(lastCall).toContain('Ngữ pháp 2: Trợ từ 嗎')
    expect(lastCall).toContain('Giải thích điểm 2.')
    expect(lastCall).toContain('Ngữ pháp 1: Cách đặt câu hỏi')
    expect(lastCall).toContain('Thêm chữ.')
  })

  it('falls back to a single plain editor (no accordion) when the markdown has no grammar-point headings', () => {
    render(<GrammarMarkdownEditor value={'Chỉ có một đoạn văn.'} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('button', { name: /Ngữ pháp/ })).toHaveLength(0)
    expect(screen.getByText('Chỉ có một đoạn văn.')).toBeInTheDocument()
  })

  it('falls back to a single plain editor for empty content', () => {
    render(<GrammarMarkdownEditor value={''} onChange={vi.fn()} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('resets to the new sections when the value prop changes externally (e.g. loading a different lesson)', async () => {
    const { rerender } = render(<GrammarMarkdownEditor value={twoPointMarkdown} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cách đặt câu hỏi' })).toBeInTheDocument()

    const otherLessonMarkdown = '## Ngữ pháp 1: Điểm khác\n\nNội dung khác.'
    rerender(<GrammarMarkdownEditor value={otherLessonMarkdown} onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Điểm khác' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Cách đặt câu hỏi' })).not.toBeInTheDocument()
  })
})
