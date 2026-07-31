import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateAudioMock, uploadMock, updateVocabMock } = vi.hoisted(() => ({
  generateAudioMock: vi.fn(),
  uploadMock: vi.fn(),
  updateVocabMock: vi.fn(),
}))

vi.mock('@/lib/tts/generateAudio', () => ({
  generateAudio: generateAudioMock,
}))

let vocabRows: { id: string; word_zh: string; audio_url: string | null }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogues') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'dlg-1' }], error: null }) }) }
      }
      if (table === 'vocabulary') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: vocabRows, error: null }) }),
          update: (row: any) => ({
            eq: (_col: string, id: string) => {
              updateVocabMock(id, row)
              const target = vocabRows.find((v) => v.id === id)
              if (target) target.audio_url = row.audio_url
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: () => ({
        upload: (path: string, buffer: Buffer) => {
          uploadMock(path, buffer)
          return Promise.resolve({ data: { path }, error: null })
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/${path}` } }),
      }),
    },
  }),
}))

import { generateLessonAudio, regenerateAllLessonAudio } from '@/lib/db/generateLessonAudio'

describe('regenerateAllLessonAudio', () => {
  beforeEach(() => {
    vocabRows = [
      { id: 'vocab-1', word_zh: '你好', audio_url: 'https://x/vocab/vocab-1.mp3?v=1' },
      { id: 'vocab-2', word_zh: '謝謝', audio_url: null },
    ]
    generateAudioMock.mockClear()
    uploadMock.mockClear()
    updateVocabMock.mockClear()
    generateAudioMock.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('regenerates audio for every word, including ones that already have audio_url', async () => {
    await regenerateAllLessonAudio('lesson-1', 'zh-TW-YunJheNeural')

    expect(generateAudioMock).toHaveBeenCalledTimes(2)
    expect(generateAudioMock).toHaveBeenCalledWith('你好', 'zh-TW-YunJheNeural')
    expect(generateAudioMock).toHaveBeenCalledWith('謝謝', 'zh-TW-YunJheNeural')
    expect(updateVocabMock).toHaveBeenCalledTimes(2)
  })
})

describe('generateLessonAudio (idempotent fill, existing behavior)', () => {
  beforeEach(() => {
    vocabRows = [
      { id: 'vocab-1', word_zh: '你好', audio_url: 'https://x/vocab/vocab-1.mp3?v=1' },
      { id: 'vocab-2', word_zh: '謝謝', audio_url: null },
    ]
    generateAudioMock.mockClear()
    updateVocabMock.mockClear()
    generateAudioMock.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('only fills words missing audio_url, skipping ones that already have it', async () => {
    await generateLessonAudio('lesson-1')
    expect(generateAudioMock).toHaveBeenCalledTimes(1)
    expect(generateAudioMock).toHaveBeenCalledWith('謝謝', 'zh-TW-HsiaoChenNeural')
  })
})
