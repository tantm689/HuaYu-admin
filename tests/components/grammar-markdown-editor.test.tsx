// @vitest-environment jsdom
// tests/components/grammar-markdown-editor.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import GrammarMarkdownEditor from '@/components/grammar-markdown-editor'

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
})
