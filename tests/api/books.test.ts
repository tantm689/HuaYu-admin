import { describe, it, expect, vi } from 'vitest'

const insertMock = vi.fn().mockReturnValue({
  select: () => ({ single: () => Promise.resolve({ data: { id: '1', title: 'SGK 1', volume: '1' }, error: null }) }),
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({ insert: insertMock }),
  }),
}))

import { POST } from '@/app/api/books/route'

describe('POST /api/books', () => {
  it('creates a book row without touching storage', async () => {
    const req = new Request('http://localhost/api/books', {
      method: 'POST',
      body: JSON.stringify({ title: 'SGK 1', volume: '1' }),
    })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.title).toBe('SGK 1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SGK 1', volume: '1' })
    )
  })
})
