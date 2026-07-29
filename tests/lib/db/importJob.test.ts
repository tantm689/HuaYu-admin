import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  insertLessonMock,
  deleteLessonMock,
  storageRemoveMock,
  extractionJobsUpdateMock,
  insertVocabularyMock,
  insertGrammarSectionMock,
  insertGrammarExampleMock,
  insertGrammarSubPointMock,
  insertQuizQuestionsMock,
} = vi.hoisted(() => ({
  insertLessonMock: vi.fn(),
  deleteLessonMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  extractionJobsUpdateMock: vi.fn(),
  insertVocabularyMock: vi.fn(),
  insertGrammarSectionMock: vi.fn(),
  insertGrammarExampleMock: vi.fn(),
  insertGrammarSubPointMock: vi.fn(),
  insertQuizQuestionsMock: vi.fn(),
}))

let jobStatus = 'audio_ready'
let existingLessonId: string | null = null
let grammarSectionCounter = 0
let quizQuestionsFixture: any[] = []

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
      if (table === 'grammar_points') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'old-gp-1' }] }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-1' }, error: null }) }) }),
        }
      }
      if (table === 'grammar_sub_points') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: [] }) }),
          insert: (row: any) => {
            insertGrammarSubPointMock(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'sp-1' }, error: null }) }) }
          },
        }
      }
      if (table === 'grammar_sections') {
        return {
          select: () => ({
            or: () => Promise.resolve({ data: [{ id: 'old-sec-1' }] }),
            in: () => Promise.resolve({ data: [] }),
          }),
          insert: (row: any) => {
            insertGrammarSectionMock(row)
            grammarSectionCounter += 1
            const id = `sec-${grammarSectionCounter}`
            return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) }
          },
        }
      }
      if (table === 'grammar_examples') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: [{ id: 'old-ex-1' }] }) }),
          insert: (rows: any) => {
            insertGrammarExampleMock(rows)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'quiz_questions') {
        return {
          insert: (rows: any) => {
            insertQuizQuestionsMock(rows)
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
                grammarPoints: [{
                  order: 1, titleVi: 'G1',
                  sections: [{
                    order: 1, label: 'Cấu trúc', content: null,
                    examples: [{ order: 1, textZh: 'e', pinyin: null, translationVi: null }],
                  }],
                  subPoints: [{
                    order: 1, label: 'A', titleVi: 'A1',
                    sections: [{
                      order: 1, label: 'Cấu trúc', content: 'note A',
                      examples: [{ order: 1, textZh: 'sub-e', pinyin: null, translationVi: null }],
                    }],
                  }],
                }],
                quizQuestions: quizQuestionsFixture,
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
    jobStatus = 'audio_ready'
    existingLessonId = null
    grammarSectionCounter = 0
    quizQuestionsFixture = []
    insertLessonMock.mockClear()
    deleteLessonMock.mockClear()
    insertVocabularyMock.mockClear()
    insertGrammarSectionMock.mockClear()
    insertGrammarExampleMock.mockClear()
    insertGrammarSubPointMock.mockClear()
    insertQuizQuestionsMock.mockClear()
    storageRemoveMock.mockClear()
    extractionJobsUpdateMock.mockClear()
  })

  it('rejects re-importing a job that is already imported', async () => {
    jobStatus = 'imported'
    await expect(importExtractionJob('job-1')).rejects.toThrow(JobAlreadyImportedError)
    expect(insertLessonMock).not.toHaveBeenCalled()
  })

  it('rejects importing a job that has not finished audio generation yet', async () => {
    jobStatus = 'reviewed'
    await expect(importExtractionJob('job-1')).rejects.toThrow(JobNotReadyForImportError)
    expect(insertLessonMock).not.toHaveBeenCalled()
  })

  it('allows importing a job once quiz_ready', async () => {
    jobStatus = 'quiz_ready'
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
  })

  it('writes lesson, dialogues, vocabulary (under dialogue_id), and grammar', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, status: 'draft' })
    )
    expect(insertVocabularyMock).toHaveBeenCalledWith([
      expect.objectContaining({ dialogue_id: 'dlg-1', word_zh: '你好' }),
    ])
  })

  it('writes a grammar point section under grammar_point_id, with its example under grammar_section_id', async () => {
    await importExtractionJob('job-1')
    expect(insertGrammarSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-1', label: 'Cấu trúc' })
    )
    expect(insertGrammarExampleMock).toHaveBeenCalledWith([
      expect.objectContaining({ grammar_section_id: 'sec-1', text_zh: 'e' }),
    ])
  })

  it('writes grammar sub-points and their sections under grammar_sub_point_id, not grammar_point_id', async () => {
    await importExtractionJob('job-1')
    expect(insertGrammarSubPointMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-1', label: 'A', title_vi: 'A1' })
    )
    expect(insertGrammarSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_sub_point_id: 'sp-1', content: 'note A' })
    )
    expect(insertGrammarExampleMock).toHaveBeenCalledWith([
      expect.objectContaining({ text_zh: 'sub-e' }),
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
    ])
    expect(deleteLessonMock).toHaveBeenCalledWith('old-lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1 })
    )
  })

  it('inserts quiz questions from raw_json.quizQuestions into quiz_questions, tagged with the new lesson id', async () => {
    jobStatus = 'quiz_ready'
    quizQuestionsFixture = [
      {
        part: 1,
        type: 'pinyin_choice',
        order: 1,
        prompt: '你好',
        choices: ['a', 'b', 'c', 'd'],
        correctIndex: 0,
      },
      {
        part: 2,
        type: 'matching',
        order: 2,
        pairs: [
          { left: '你好', right: 'xin chào' },
          { left: '再见', right: 'tạm biệt' },
          { left: '谢谢', right: 'cảm ơn' },
          { left: '对不起', right: 'xin lỗi' },
          { left: '没关系', right: 'không sao' },
        ],
      },
    ]

    await importExtractionJob('job-1')

    expect(insertQuizQuestionsMock).toHaveBeenCalledWith([
      {
        lesson_id: 'lesson-1',
        part: 1,
        type: 'pinyin_choice',
        order: 1,
        payload: {
          prompt: '你好',
          choices: ['a', 'b', 'c', 'd'],
          correctIndex: 0,
        },
      },
      {
        lesson_id: 'lesson-1',
        part: 2,
        type: 'matching',
        order: 2,
        payload: {
          pairs: [
            { left: '你好', right: 'xin chào' },
            { left: '再见', right: 'tạm biệt' },
            { left: '谢谢', right: 'cảm ơn' },
            { left: '对不起', right: 'xin lỗi' },
            { left: '没关系', right: 'không sao' },
          ],
        },
      },
    ])
  })
})
