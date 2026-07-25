import { describe, it, expect, vi } from 'vitest'

const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'books/test.pdf' }, error: null })
const insertMock = vi.fn().mockReturnValue({
  select: () => ({ single: () => Promise.resolve({ data: { id: '1', title: 'SGK 1', volume: '1', pdf_path: 'books/test.pdf' }, error: null }) }),
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    from: () => ({ insert: insertMock }),
  }),
}))

import { POST } from '@/app/api/books/route'

describe('POST /api/books', () => {
  it('uploads the PDF to storage and creates a book row', async () => {
    const form = new FormData()
    form.set('title', 'SGK 1')
    form.set('volume', '1')
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'test.pdf', { type: 'application/pdf' }))

    const req = new Request('http://localhost/api/books', { method: 'POST', body: form })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.title).toBe('SGK 1')
    expect(uploadMock).toHaveBeenCalled()
  })
})
