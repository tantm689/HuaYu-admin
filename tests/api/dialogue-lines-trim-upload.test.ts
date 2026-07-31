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

  const VALID_LINE_ID = '11111111-1111-4111-8111-111111111111'

  function makeFormDataRequest(lineId: string) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }), 'line.wav')
    form.append('lineId', lineId)
    return new Request('http://localhost', { method: 'POST', body: form }) as any
  }

  it('uploads the file to Storage and returns its public URL', async () => {
    const res = await POST(makeFormDataRequest(VALID_LINE_ID), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.publicUrl).toBe('https://x/dialogue-lines/line-1.wav')
    expect(uploadMock).toHaveBeenCalledWith(
      `dialogue-lines/${VALID_LINE_ID}.wav`,
      expect.anything(),
      expect.objectContaining({ contentType: 'audio/wav', upsert: true })
    )
  })

  it('returns 400 when file or lineId is missing', async () => {
    const form = new FormData()
    const res = await POST(new Request('http://localhost', { method: 'POST', body: form }) as any, { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when lineId is not a valid UUID (e.g. path traversal attempt)', async () => {
    const res = await POST(makeFormDataRequest('../../dialogues/some-id'), { params })
    expect(res.status).toBe(400)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the Storage upload fails', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage quota exceeded' } })
    const res = await POST(makeFormDataRequest(VALID_LINE_ID), { params })
    expect(res.status).toBe(500)
  })
})
