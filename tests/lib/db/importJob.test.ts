import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  insertLessonMock,
  generateVocabAudioMock,
  storageUploadMock,
  storageRemoveMock,
  dialogueUpdateMock,
  extractionJobsUpdateMock,
} = vi.hoisted(() => ({
  insertLessonMock: vi.fn(),
  generateVocabAudioMock: vi.fn().mockResolvedValue(new Uint8Array([1])),
  storageUploadMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  dialogueUpdateMock: vi.fn(),
  extractionJobsUpdateMock: vi.fn(),
}))

vi.mock('@/lib/tts/edgeTts', () => ({ generateVocabAudio: generateVocabAudioMock }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'lessons') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          insert: (row: any) => {
            insertLessonMock(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'lesson-1', ...row }, error: null }) }) }
          },
        }
      }
      if (table === 'dialogues') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'dlg-1' }, error: null }) }) }),
          update: (row: any) => ({
            eq: () => {
              dialogueUpdateMock(row)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'dialogue_lines') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'vocabulary') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'vocab-1' }, error: null }) }) }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      }
      if (table === 'grammar_points') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-1' }, error: null }) }) }) }
      }
      if (table === 'grammar_examples') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({
            data: {
              id: 'job-1', book_id: 'book-1', status: 'reviewed', sliced_pdf_path: 'jobs/job-1.pdf',
              raw_json: {
                lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B', theme: null, objectives: [] },
                dialogues: [{ order: 1, titleZh: null, titleVi: null, audioCode: '01-1', lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }] }],
                vocabulary: [{ order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào' }],
                grammarPoints: [{ order: 1, titleZh: 'G1', titleVi: null, structureNote: null, examples: [{ order: 1, textZh: 'e', pinyin: null, translationVi: null }] }],
              },
            },
            error: null,
          }) }) }),
          update: (row: any) => ({
            eq: () => {
              extractionJobsUpdateMock(row)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, body: unknown, options: unknown) => {
          storageUploadMock(bucket, path, options)
          return Promise.resolve({ data: { path }, error: null })
        },
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/f.mp3' } }),
        remove: (paths: string[]) => {
          storageRemoveMock(bucket, paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }),
}))

import { importExtractionJob } from '@/lib/db/importJob'

describe('importExtractionJob', () => {
  beforeEach(() => {
    insertLessonMock.mockClear()
    generateVocabAudioMock.mockClear()
    storageUploadMock.mockClear()
    storageRemoveMock.mockClear()
    dialogueUpdateMock.mockClear()
    extractionJobsUpdateMock.mockClear()
  })

  it('writes lesson, dialogues, vocabulary (with generated audio), and grammar', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, status: 'draft' })
    )
    expect(generateVocabAudioMock).toHaveBeenCalledWith('你好')
  })

  it('uploads a matched dialogue audio file and sets audio_url', async () => {
    await importExtractionJob('job-1', [{ filename: '01-1.mp3', buffer: new ArrayBuffer(4) }])
    expect(storageUploadMock).toHaveBeenCalledWith(
      'audio',
      'dialogues/dlg-1.mp3',
      expect.objectContaining({ contentType: 'audio/mpeg' })
    )
    expect(dialogueUpdateMock).toHaveBeenCalledWith({ audio_url: 'https://x/f.mp3' })
  })

  it('uploads a dialogue audio file whose zero-padding differs from the audio code', async () => {
    await importExtractionJob('job-1', [{ filename: '01-01.mp3', buffer: new ArrayBuffer(4) }])
    expect(dialogueUpdateMock).toHaveBeenCalledWith({ audio_url: 'https://x/f.mp3' })
  })

  it('does not upload dialogue audio when no filename matches the audio code', async () => {
    await importExtractionJob('job-1', [{ filename: '99-9.mp3', buffer: new ArrayBuffer(4) }])
    expect(dialogueUpdateMock).not.toHaveBeenCalled()
  })

  it('removes the sliced PDF from storage and clears sliced_pdf_path after import', async () => {
    await importExtractionJob('job-1')
    expect(storageRemoveMock).toHaveBeenCalledWith('book-pdfs', ['jobs/job-1.pdf'])
    expect(extractionJobsUpdateMock).toHaveBeenCalledWith({ sliced_pdf_path: null })
  })
})
