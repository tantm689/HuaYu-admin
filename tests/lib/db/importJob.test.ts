import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  insertLessonMock,
  deleteLessonMock,
  storageRemoveMock,
  extractionJobsUpdateMock,
  insertVocabularyMock,
} = vi.hoisted(() => ({
  insertLessonMock: vi.fn(),
  deleteLessonMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  extractionJobsUpdateMock: vi.fn(),
  insertVocabularyMock: vi.fn(),
}))

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
        return {
          select: () => ({ in: () => Promise.resolve({ data: [{ id: 'old-line-1' }] }) }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      if (table === 'vocabulary') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ id: 'old-vocab-1' }] }),
            in: () => Promise.resolve({ data: [{ id: 'old-vocab-1' }] }),
          }),
          insert: (rows: any) => {
            insertVocabularyMock(rows)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({
            data: {
              id: 'job-1', book_id: 'book-1', status: jobStatus, sliced_pdf_path: 'jobs/job-1.pdf',
              raw_json: {
                lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
                dialogues: [{
                  order: 1, audioCode: '01-1',
                  lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }],
                  vocabulary: [{ order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào' }],
                }],
                grammarMarkdown: '# Ngữ pháp 1: Test\n\n**CHỨC NĂNG**\n\nNội dung.',
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

import { importExtractionJob, JobAlreadyImportedError, JobNotReadyForImportError } from '@/lib/db/importJob'

describe('importExtractionJob', () => {
  beforeEach(() => {
    jobStatus = 'reviewed'
    existingLessonId = null
    insertLessonMock.mockClear()
    deleteLessonMock.mockClear()
    insertVocabularyMock.mockClear()
    storageRemoveMock.mockClear()
    extractionJobsUpdateMock.mockClear()
  })

  it('rejects re-importing a job that is already imported', async () => {
    jobStatus = 'imported'
    await expect(importExtractionJob('job-1')).rejects.toThrow(JobAlreadyImportedError)
    expect(insertLessonMock).not.toHaveBeenCalled()
  })

  it('rejects importing a job that has not been reviewed yet', async () => {
    jobStatus = 'pending'
    await expect(importExtractionJob('job-1')).rejects.toThrow(JobNotReadyForImportError)
    expect(insertLessonMock).not.toHaveBeenCalled()
  })

  it('allows importing a job once reviewed', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
  })

  it('writes lesson (including grammar_markdown), dialogues, and vocabulary (under dialogue_id)', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        book_id: 'book-1', lesson_no: 1, status: 'draft',
        grammar_markdown: '# Ngữ pháp 1: Test\n\n**CHỨC NĂNG**\n\nNội dung.',
      })
    )
    expect(insertVocabularyMock).toHaveBeenCalledWith([
      expect.objectContaining({ dialogue_id: 'dlg-1', word_zh: '你好' }),
    ])
  })

  it('removes the sliced PDF from storage and clears sliced_pdf_path after import', async () => {
    await importExtractionJob('job-1')
    expect(storageRemoveMock).toHaveBeenCalledWith('book-pdfs', ['jobs/job-1.pdf'])
    expect(extractionJobsUpdateMock).toHaveBeenCalledWith({ sliced_pdf_path: null })
  })

  it('overwrites an existing lesson for the same book+lessonNo: deletes its audio and the old row first', async () => {
    existingLessonId = 'old-lesson-1'
    await importExtractionJob('job-1')
    expect(storageRemoveMock).toHaveBeenCalledWith('audio', [
      'dialogues/old-dlg-1.mp3',
      'vocab/old-vocab-1.mp3',
      'dialogue-lines/old-line-1.wav',
    ])
    expect(deleteLessonMock).toHaveBeenCalledWith('old-lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1 })
    )
  })
})
