import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateAudioMock, uploadMock, extractionJobsUpdateMock } = vi.hoisted(() => ({
  generateAudioMock: vi.fn(),
  uploadMock: vi.fn(),
  extractionJobsUpdateMock: vi.fn(),
}))

vi.mock('@/lib/tts/generateAudio', () => ({
  generateAudio: generateAudioMock,
}))

let uuidCounter = 0
vi.mock('crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
}))

let jobStatus = 'reviewed'
let rawJson: any

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'job-1', status: jobStatus, raw_json: rawJson }, error: null }) }) }),
          update: (row: any) => ({
            eq: () => {
              extractionJobsUpdateMock(row)
              if ('raw_json' in row) rawJson = row.raw_json
              if ('status' in row) jobStatus = row.status
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

import { generateJobAudioItem, markJobAudioReady, JobNotEditableForAudioError } from '@/lib/db/generateJobAudio'

const EXISTING_VOCAB_ID = '11111111-1111-4111-8111-111111111111'

function baseRawJson() {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
    dialogues: [
      {
        order: 1, kind: 'dialogue', audioCode: null,
        lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }],
        vocabulary: [
          { order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào' },
          { order: 2, wordZh: '謝謝', pinyin: 'xièxie', meaningVi: 'cảm ơn', id: EXISTING_VOCAB_ID, audioUrl: `https://x/vocab/${EXISTING_VOCAB_ID}.mp3` },
        ],
      },
    ],
    grammarPoints: [
      {
        order: 1, titleVi: 'G1',
        sections: [
          {
            order: 1, label: 'Cấu trúc', content: null,
            examples: [{ order: 1, textZh: '例句一', pinyin: null, translationVi: null }],
            items: [
              {
                order: 1, label: '1', content: null,
                examples: [{ order: 1, textZh: '子項例句', pinyin: null, translationVi: null }],
              },
            ],
          },
        ],
        subPoints: [
          {
            order: 1, label: 'A', titleVi: 'A1',
            sections: [
              {
                order: 1, label: 'Cấu trúc', content: null,
                examples: [{ order: 1, textZh: '子點例句', pinyin: null, translationVi: null }],
                items: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('generateJobAudioItem', () => {
  beforeEach(() => {
    uuidCounter = 0
    jobStatus = 'reviewed'
    rawJson = baseRawJson()
    generateAudioMock.mockClear()
    uploadMock.mockClear()
    extractionJobsUpdateMock.mockClear()
    generateAudioMock.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('rejects generating audio for a job still pending/failed', async () => {
    jobStatus = 'pending'
    await expect(generateJobAudioItem('job-1', 0, 0, 'zh-TW-HsiaoChenNeural')).rejects.toThrow(
      JobNotEditableForAudioError
    )
  })

  it('generates audio for the vocab word at the given position, assigning it an id', async () => {
    const audioUrl = await generateJobAudioItem('job-1', 0, 0, 'zh-TW-HsiaoChenNeural')

    expect(generateAudioMock).toHaveBeenCalledTimes(1)
    expect(generateAudioMock).toHaveBeenCalledWith('你好', 'zh-TW-HsiaoChenNeural')

    const generatedId = rawJson.dialogues[0].vocabulary[0].id
    expect(generatedId).toMatch(/^00000000-0000-4000-8000-/)
    expect(audioUrl).toMatch(new RegExp(`^https://x/vocab/${generatedId}\\.mp3\\?v=\\d+$`))
    expect(rawJson.dialogues[0].vocabulary[0].audioUrl).toBe(audioUrl)
    // The other vocab word is left untouched.
    expect(rawJson.dialogues[0].vocabulary[1].audioUrl).toBe(`https://x/vocab/${EXISTING_VOCAB_ID}.mp3`)
  })

  it('regenerates a word that already has an id, reusing the same id/path but cache-busting the URL', async () => {
    const audioUrl = await generateJobAudioItem('job-1', 0, 1, 'zh-TW-YunJheNeural')

    expect(generateAudioMock).toHaveBeenCalledWith('謝謝', 'zh-TW-YunJheNeural')
    expect(rawJson.dialogues[0].vocabulary[1].id).toBe(EXISTING_VOCAB_ID)
    expect(audioUrl).toMatch(new RegExp(`^https://x/vocab/${EXISTING_VOCAB_ID}\\.mp3\\?v=\\d+$`))
    expect(rawJson.dialogues[0].vocabulary[1].audioUrl).toBe(audioUrl)
  })

  it('throws when the position does not exist', async () => {
    await expect(generateJobAudioItem('job-1', 0, 99, 'zh-TW-HsiaoChenNeural')).rejects.toThrow(/Không tìm thấy/)
    await expect(generateJobAudioItem('job-1', 5, 0, 'zh-TW-HsiaoChenNeural')).rejects.toThrow(/Không tìm thấy/)
  })

  it('strips a parenthetical character-variant note before sending text to TTS', async () => {
    rawJson.dialogues[0].vocabulary[0].wordZh = '臺灣 (=台灣)'
    await generateJobAudioItem('job-1', 0, 0, 'zh-TW-HsiaoChenNeural')
    expect(generateAudioMock).toHaveBeenCalledWith('臺灣', 'zh-TW-HsiaoChenNeural')
  })
})

describe('markJobAudioReady', () => {
  beforeEach(() => {
    jobStatus = 'reviewed'
    rawJson = baseRawJson()
    extractionJobsUpdateMock.mockClear()
  })

  it('rejects when some vocab word is still missing audio', async () => {
    await expect(markJobAudioReady('job-1')).rejects.toThrow(/Vẫn còn/)
    expect(jobStatus).toBe('reviewed')
  })

  it('advances status to audio_ready once every vocab word has audio', async () => {
    rawJson.dialogues[0].vocabulary[0].audioUrl = 'https://x/vocab/a.mp3'
    await markJobAudioReady('job-1')
    expect(jobStatus).toBe('audio_ready')
  })

  it('does not touch status if already past reviewed', async () => {
    jobStatus = 'audio_ready'
    rawJson.dialogues[0].vocabulary[0].audioUrl = 'https://x/vocab/a.mp3'
    await markJobAudioReady('job-1')
    expect(jobStatus).toBe('audio_ready')
    expect(extractionJobsUpdateMock).not.toHaveBeenCalled()
  })
})
