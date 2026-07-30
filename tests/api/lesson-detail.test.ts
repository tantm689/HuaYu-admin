import { describe, it, expect, vi, beforeEach } from 'vitest'

let lessonStatus = 'draft'
const lessonDeleteMock = vi.fn()
const storageRemoveMock = vi.fn()

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'lessons') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { status: lessonStatus }, error: null }) }) }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              lessonDeleteMock(id)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      // dialogues/vocabulary lookups inside deleteLessonAndAudio
      return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
    },
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          storageRemoveMock(paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }),
}))

import { DELETE } from '@/app/api/lessons/[lessonId]/route'

describe('DELETE /api/lessons/[lessonId]', () => {
  beforeEach(() => {
    lessonStatus = 'draft'
    lessonDeleteMock.mockClear()
    storageRemoveMock.mockClear()
  })

  it('deletes a draft lesson', async () => {
    const res = await DELETE(new Request('http://localhost') as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(200)
    expect(lessonDeleteMock).toHaveBeenCalledWith('lesson-1')
  })

  it('rejects deleting a published lesson', async () => {
    lessonStatus = 'published'
    const res = await DELETE(new Request('http://localhost') as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(400)
    expect(lessonDeleteMock).not.toHaveBeenCalled()
  })
})
