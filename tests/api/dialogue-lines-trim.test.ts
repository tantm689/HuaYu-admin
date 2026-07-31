import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

const { requireLessonDraftMock, updateDialogueLineTrimsMock } = vi.hoisted(() => ({
  requireLessonDraftMock: vi.fn(),
  updateDialogueLineTrimsMock: vi.fn(),
}))

vi.mock('@/lib/db/updateLessonFull', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/updateLessonFull')>('@/lib/db/updateLessonFull')
  return { ...actual, requireLessonDraft: requireLessonDraftMock }
})

vi.mock('@/lib/db/trimDialogueLines', () => ({
  updateDialogueLineTrims: updateDialogueLineTrimsMock,
}))

import { PATCH } from '@/app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route'
import { LessonNotEditableError } from '@/lib/db/updateLessonFull'

function makeRequest(body: unknown) {
  return new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }) as any
}

const params = Promise.resolve({ lessonId: 'lesson-1', dialogueId: 'dlg-1' })

describe('PATCH /api/lessons/[lessonId]/dialogues/[dialogueId]/trim', () => {
  beforeEach(() => {
    requireLessonDraftMock.mockReset()
    requireLessonDraftMock.mockResolvedValue(undefined)
    updateDialogueLineTrimsMock.mockReset()
    updateDialogueLineTrimsMock.mockResolvedValue(undefined)
  })

  it('requires the lesson to be a draft, then updates the given lines', async () => {
    const body = {
      lines: [{ id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 1, endTime: 2 }],
    }
    const res = await PATCH(makeRequest(body), { params })
    expect(res.status).toBe(200)
    expect(requireLessonDraftMock).toHaveBeenCalledWith('lesson-1')
    expect(updateDialogueLineTrimsMock).toHaveBeenCalledWith(body.lines)
  })

  it('returns 400 when lines is missing or not an array', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
    expect(updateDialogueLineTrimsMock).not.toHaveBeenCalled()
  })

  it('returns 400 with the Vietnamese message when the lesson is not a draft', async () => {
    requireLessonDraftMock.mockRejectedValue(new LessonNotEditableError('Bài học phải ở trạng thái Nháp mới được sửa. Hãy "Chuyển về nháp" trước.'))
    const res = await PATCH(makeRequest({ lines: [] }), { params })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Nháp')
  })

  it('returns 500 on an unexpected error from the update function', async () => {
    updateDialogueLineTrimsMock.mockRejectedValue(new Error('connection reset'))
    const res = await PATCH(makeRequest({ lines: [{ id: 'line-1', audioUrl: 'x', startTime: 0, endTime: 1 }] }), { params })
    expect(res.status).toBe(500)
  })
})
