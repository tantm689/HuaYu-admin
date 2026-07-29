import { describe, it, expect, vi, beforeEach } from 'vitest'

const { lessonDeleteMock, storageRemoveMock } = vi.hoisted(() => ({
  lessonDeleteMock: vi.fn(),
  storageRemoveMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogues') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'dlg-1' }, { id: 'dlg-2' }] }) }) }
      }
      if (table === 'vocabulary') {
        return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'vocab-1' }] }) }) }
      }
      if (table === 'lessons') {
        return {
          delete: () => ({
            eq: (_col: string, id: string) => {
              lessonDeleteMock(id)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
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

import { deleteLessonAndAudio } from '@/lib/db/deleteLesson'

describe('deleteLessonAndAudio', () => {
  beforeEach(() => {
    lessonDeleteMock.mockClear()
    storageRemoveMock.mockClear()
  })

  it('removes dialogue and vocabulary audio files, then deletes the lesson row', async () => {
    await deleteLessonAndAudio('lesson-1')
    expect(storageRemoveMock).toHaveBeenCalledWith([
      'dialogues/dlg-1.mp3',
      'dialogues/dlg-2.mp3',
      'vocab/vocab-1.mp3',
    ])
    expect(lessonDeleteMock).toHaveBeenCalledWith('lesson-1')
  })
})
