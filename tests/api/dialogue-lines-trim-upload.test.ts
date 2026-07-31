import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

const { requireLessonDraftMock, uploadMock, getPublicUrlMock } = vi.hoisted(() => ({
  requireLessonDraftMock: vi.fn(),
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
}))

vi.mock('@/lib/db/updateLessonFull', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/updateLessonFull')>('@/lib/db/updateLessonFull')
  return { ...actual, requireLessonDraft: requireLessonDraftMock }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}))

import { POST } from '@/app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route'

const params = Promise.resolve({ lessonId: 'lesson-1', dialogueId: 'dlg-1' })

describe('POST /api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload', () => {
  beforeEach(() => {
    requireLessonDraftMock.mockReset()
    requireLessonDraftMock.mockResolvedValue(undefined)
    uploadMock.mockReset()
    uploadMock.mockResolvedValue({ error: null })
    getPublicUrlMock.mockReset()
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://x/dialogue-lines/line-1.wav' } })
  })

  function makeFormDataRequest(path: string) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }), 'line-1.wav')
    form.append('path', path)
    return new Request('http://localhost', { method: 'POST', body: form }) as any
  }

  it('uploads the file to Storage and returns its public URL', async () => {
    const res = await POST(makeFormDataRequest('dialogue-lines/line-1.wav'), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.publicUrl).toBe('https://x/dialogue-lines/line-1.wav')
    expect(uploadMock).toHaveBeenCalledWith(
      'dialogue-lines/line-1.wav',
      expect.anything(),
      expect.objectContaining({ contentType: 'audio/wav', upsert: true })
    )
  })

  it('returns 400 when file or path is missing', async () => {
    const form = new FormData()
    const res = await POST(new Request('http://localhost', { method: 'POST', body: form }) as any, { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the Storage upload fails', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage quota exceeded' } })
    const res = await POST(makeFormDataRequest('dialogue-lines/line-1.wav'), { params })
    expect(res.status).toBe(500)
  })
})
