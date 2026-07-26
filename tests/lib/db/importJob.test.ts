import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  insertLessonMock,
  deleteLessonMock,
  generateVocabAudioMock,
  storageRemoveMock,
  extractionJobsUpdateMock,
} = vi.hoisted(() => ({
  insertLessonMock: vi.fn(),
  deleteLessonMock: vi.fn(),
  generateVocabAudioMock: vi.fn().mockResolvedValue(new Uint8Array([1])),
  storageRemoveMock: vi.fn(),
  extractionJobsUpdateMock: vi.fn(),
}))

vi.mock('@/lib/tts/edgeTts', () => ({ generateVocabAudio: generateVocabAudioMock }))

let jobStatus = 'reviewed'
let existingLessonId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'lessons') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: existingLessonId ? { id: existingLessonId } : null, error: null }),
              }),
            }),
          }),
          insert: (row: any) => {
            insertLessonMock(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'lesson-1', ...row }, error: null }) }) }
          },
          delete: () => ({
            eq: (_col: string, id: string) => {
              deleteLessonMock(id)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'dialogues') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'old-dlg-1' }] }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'dlg-1' }, error: null }) }) }),
        }
      }
      if (table === 'dialogue_lines') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'vocabulary') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'old-vocab-1' }] }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'vocab-1' }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
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
              id: 'job-1', book_id: 'book-1', status: jobStatus, sliced_pdf_path: 'jobs/job-1.pdf',
              raw_json: {
                lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
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
        upload: () => Promise.resolve({ data: { path: 'audio/vocab-1.mp3' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/vocab-1.mp3' } }),
        remove: (paths: string[]) => {
          storageRemoveMock(bucket, paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }),
}))

import { importExtractionJob, JobAlreadyImportedError } from '@/lib/db/importJob'

describe('importExtractionJob', () => {
  beforeEach(() => {
    jobStatus = 'reviewed'
    existingLessonId = null
    insertLessonMock.mockClear()
    deleteLessonMock.mockClear()
    generateVocabAudioMock.mockClear()
    storageRemoveMock.mockClear()
    extractionJobsUpdateMock.mockClear()
  })

  it('rejects re-importing a job that is already imported', async () => {
    jobStatus = 'imported'
    await expect(importExtractionJob('job-1')).rejects.toThrow(JobAlreadyImportedError)
    expect(insertLessonMock).not.toHaveBeenCalled()
  })

  it('writes lesson, dialogues, vocabulary (with generated audio), and grammar', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, status: 'draft' })
    )
    expect(generateVocabAudioMock).toHaveBeenCalledWith('你好')
  })

  it('removes the sliced PDF from storage and clears sliced_pdf_path after import', async () => {
    await importExtractionJob('job-1')
    expect(storageRemoveMock).toHaveBeenCalledWith('book-pdfs', ['jobs/job-1.pdf'])
    expect(extractionJobsUpdateMock).toHaveBeenCalledWith({ sliced_pdf_path: null })
  })

  it('overwrites an existing lesson for the same book+lessonNo: deletes its audio and the old row first', async () => {
    existingLessonId = 'old-lesson-1'
    await importExtractionJob('job-1')
    expect(storageRemoveMock).toHaveBeenCalledWith('audio', ['dialogues/old-dlg-1.mp3', 'vocab/old-vocab-1.mp3'])
    expect(deleteLessonMock).toHaveBeenCalledWith('old-lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1 })
    )
  })
})
