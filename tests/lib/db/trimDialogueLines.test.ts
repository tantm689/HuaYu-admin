import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
const eqMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogue_lines') {
        return {
          update: (row: any) => {
            updateMock(row)
            return { eq: (col: string, id: string) => { eqMock(col, id); return Promise.resolve({ error: null }) } }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { updateDialogueLineTrims } from '@/lib/db/trimDialogueLines'

describe('updateDialogueLineTrims', () => {
  beforeEach(() => {
    updateMock.mockClear()
    eqMock.mockClear()
  })

  it('updates audio_url/start_time/end_time for each line, and nothing else', async () => {
    await updateDialogueLineTrims([
      { id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 1.5, endTime: 3.2 },
      { id: 'line-2', audioUrl: 'https://x/b.wav', startTime: 4, endTime: 5.8 },
    ])

    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      audio_url: 'https://x/a.wav',
      start_time: 1.5,
      end_time: 3.2,
    })
    expect(eqMock).toHaveBeenNthCalledWith(1, 'id', 'line-1')
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      audio_url: 'https://x/b.wav',
      start_time: 4,
      end_time: 5.8,
    })
    expect(eqMock).toHaveBeenNthCalledWith(2, 'id', 'line-2')
  })

  it('does nothing when given an empty list', async () => {
    await updateDialogueLineTrims([])
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the DB update fails, instead of silently succeeding', async () => {
    updateMock.mockImplementationOnce(() => {})
    eqMock.mockImplementationOnce(() => {})
    const { createServerSupabase } = await import('@/lib/supabase/server')
    // Re-mock this one call to return an error - simplest is to swap the
    // whole module mock's behavior via a local override:
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabase: () => ({
        from: () => ({
          update: () => ({ eq: () => Promise.resolve({ error: { message: 'connection reset' } }) }),
        }),
      }),
    }))
    vi.resetModules()
    const { updateDialogueLineTrims: freshFn } = await import('@/lib/db/trimDialogueLines')
    await expect(
      freshFn([{ id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('connection reset')
  })
})
