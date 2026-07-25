import { describe, it, expect, vi } from 'vitest'

const dialoguesSelectMock = vi.fn().mockResolvedValue({
  data: [{ id: 'd1', audio_code: '01-1' }, { id: 'd2', audio_code: '01-3' }],
  error: null,
})
const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'dialogues/d1.mp3' }, error: null })
const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x/d1.mp3' } })
const updateEqMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogues') {
        return {
          select: () => ({ eq: () => dialoguesSelectMock() }),
          update: () => ({ eq: updateEqMock }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
  }),
}))

import { POST } from '@/app/api/books/[bookId]/audio/route'

describe('POST /api/books/[bookId]/audio', () => {
  it('uploads matched files and reports unmatched filenames', async () => {
    const form = new FormData()
    form.append('files', new File([new Uint8Array([1])], '01-1.mp3', { type: 'audio/mpeg' }))
    form.append('files', new File([new Uint8Array([1])], '99-9.mp3', { type: 'audio/mpeg' }))

    const req = new Request('http://localhost', { method: 'POST', body: form })
    const res = await POST(req as any, { params: { bookId: 'book-1' } as any })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.unmatched).toEqual(['99-9.mp3'])
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
