import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateQuizPart1Mock, generateQuizPart2Mock } = vi.hoisted(() => ({
  generateQuizPart1Mock: vi.fn(),
  generateQuizPart2Mock: vi.fn(),
}))

vi.mock('@/lib/gemini/generateQuiz', () => ({
  generateQuizPart1: generateQuizPart1Mock,
  generateQuizPart2: generateQuizPart2Mock,
}))

const { getLessonFullMock } = vi.hoisted(() => ({ getLessonFullMock: vi.fn() }))

vi.mock('@/lib/db/getLessonFull', () => ({
  getLessonFull: getLessonFullMock,
}))

const deleteEqMock = vi.fn()
const insertMock = vi.fn()
const selectEqMock = vi.fn()
const updateMock = vi.fn()
const deleteQuestionMock = vi.fn()

// Controls what the update/delete `.select('id')` chain resolves to, so
// tests can simulate a wrong-lesson mutation matching zero rows.
let mutationMatchesRow = true

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'quiz_questions') {
        return {
          delete: () => ({
            eq: (col: string, id: string) => {
              if (col === 'lesson_id') {
                return { eq: (col2: string, part: number) => {
                  deleteEqMock(id, part)
                  return Promise.resolve({ error: null })
                } }
              }
              return {
                eq: (col2: string, lessonId: string) => {
                  deleteQuestionMock(id, col2, lessonId)
                  return {
                    select: () => {
                      return Promise.resolve({
                        data: mutationMatchesRow ? [{ id }] : [],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }),
          insert: (rows: any) => {
            insertMock(rows)
            return Promise.resolve({ error: null })
          },
          select: () => ({
            eq: (col: string, id: string) => {
              selectEqMock(col, id)
              return Promise.resolve({
                data: [
                  { id: 'q1', lesson_id: 'lesson-1', part: 1, type: 'pinyin_choice', order: 1, payload: { prompt: 'x' } },
                ],
                error: null,
              })
            },
          }),
          update: (row: any) => ({
            eq: (_col: string, id: string) => {
              return {
                eq: (col2: string, lessonId: string) => {
                  updateMock(id, row, col2, lessonId)
                  return {
                    select: () => {
                      return Promise.resolve({
                        data: mutationMatchesRow ? [{ id }] : [],
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  generateLessonQuizPart1,
  generateLessonQuizPart2,
  getLessonQuizQuestions,
  updateQuizQuestion,
  updateQuizQuestionOrder,
  deleteQuizQuestion,
} from '@/lib/db/generateLessonQuiz'

function baseLesson() {
  return {
    id: 'lesson-1',
    bookId: 'book-1',
    lessonNo: 1,
    titleZh: 'A',
    titleVi: 'B',
    theme: null,
    objectives: [],
    status: 'draft' as const,
    dialogues: [
      {
        id: 'dlg-1',
        order: 1,
        kind: 'dialogue' as const,
        audioCode: null,
        audioUrl: null,
        lines: [
          { id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: '你好', pinyin: null, translationVi: null, audioUrl: null },
        ],
        vocabulary: [
          { id: 'vocab-1', order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào', audioUrl: 'https://x/vocab-1.mp3' },
        ],
      },
    ],
    grammarMarkdown: '',
  }
}

const fifteenPart1: any[] = Array.from({ length: 15 }, (_, i) => ({
  part: 1,
  type: 'pinyin_choice',
  order: i + 1,
  prompt: 'x',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

const fifteenPart2: any[] = Array.from({ length: 15 }, (_, i) => ({
  part: 2,
  type: 'fill_blank',
  order: i + 1,
  contextSentence: 'x',
  sentence: 'y___z',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
  grammarPointUsed: 'Cách đặt câu hỏi bằng A 不 A',
}))

describe('generateLessonQuizPart1', () => {
  beforeEach(() => {
    getLessonFullMock.mockClear()
    generateQuizPart1Mock.mockClear()
    deleteEqMock.mockClear()
    insertMock.mockClear()
    getLessonFullMock.mockResolvedValue(baseLesson())
  })

  it('adapts the lesson to ExtractionResult shape, calls generateQuizPart1, and replaces part-1 rows', async () => {
    generateQuizPart1Mock.mockResolvedValue({ questions: fifteenPart1, usedFallbackModel: false })

    const { questions, usedFallbackModel } = await generateLessonQuizPart1('lesson-1')

    expect(questions).toHaveLength(15)
    expect(usedFallbackModel).toBe(false)
    expect(deleteEqMock).toHaveBeenCalledWith('lesson-1', 1)
    expect(insertMock).toHaveBeenCalledTimes(1)
    const insertedRows = insertMock.mock.calls[0][0]
    expect(insertedRows).toHaveLength(15)
    expect(insertedRows[0]).toMatchObject({ lesson_id: 'lesson-1', part: 1, type: 'pinyin_choice', order: 1 })
    expect(insertedRows[0].payload).toMatchObject({ prompt: 'x', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 })

    const passedResult = generateQuizPart1Mock.mock.calls[0][0]
    expect(passedResult.dialogues[0].vocabulary[0]).toMatchObject({ wordZh: '你好', audioUrl: 'https://x/vocab-1.mp3' })
  })

  it('throws when the lesson does not exist', async () => {
    getLessonFullMock.mockResolvedValue(null)
    await expect(generateLessonQuizPart1('missing')).rejects.toThrow()
  })
})

describe('generateLessonQuizPart2', () => {
  beforeEach(() => {
    getLessonFullMock.mockClear()
    generateQuizPart2Mock.mockClear()
    deleteEqMock.mockClear()
    insertMock.mockClear()
    getLessonFullMock.mockResolvedValue(baseLesson())
  })

  it('adapts the lesson, calls generateQuizPart2, and replaces part-2 rows', async () => {
    generateQuizPart2Mock.mockResolvedValue({ questions: fifteenPart2, usedFallbackModel: true })

    const { questions, usedFallbackModel } = await generateLessonQuizPart2('lesson-1')

    expect(questions).toHaveLength(15)
    expect(usedFallbackModel).toBe(true)
    expect(deleteEqMock).toHaveBeenCalledWith('lesson-1', 2)
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('strips the internal grammarPointUsed field out of the persisted payload', async () => {
    generateQuizPart2Mock.mockResolvedValue({ questions: fifteenPart2, usedFallbackModel: false })

    await generateLessonQuizPart2('lesson-1')

    const insertedRows = insertMock.mock.calls[0][0]
    expect(insertedRows[0].payload).not.toHaveProperty('grammarPointUsed')
    expect(insertedRows[0].payload).toEqual({
      contextSentence: 'x',
      sentence: 'y___z',
      choices: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    })
  })
})

describe('getLessonQuizQuestions', () => {
  it('returns the lesson\'s quiz question rows', async () => {
    selectEqMock.mockClear()
    const rows = await getLessonQuizQuestions('lesson-1')
    expect(rows).toHaveLength(1)
    expect(selectEqMock).toHaveBeenCalledWith('lesson_id', 'lesson-1')
  })
})

describe('updateQuizQuestion', () => {
  beforeEach(() => {
    mutationMatchesRow = true
  })

  it('updates the payload of one question by id, scoped to lesson_id', async () => {
    updateMock.mockClear()
    await updateQuizQuestion('lesson-1', 'q1', { prompt: 'new' })
    expect(updateMock).toHaveBeenCalledWith('q1', { payload: { prompt: 'new' } }, 'lesson_id', 'lesson-1')
  })

  it('throws when the question does not belong to the given lesson', async () => {
    mutationMatchesRow = false
    await expect(updateQuizQuestion('lesson-2', 'q1', { prompt: 'new' })).rejects.toThrow()
  })
})

describe('updateQuizQuestionOrder', () => {
  beforeEach(() => {
    mutationMatchesRow = true
  })

  it('updates the order of one question by id, scoped to lesson_id', async () => {
    updateMock.mockClear()
    await updateQuizQuestionOrder('lesson-1', 'q1', 3)
    expect(updateMock).toHaveBeenCalledWith('q1', { order: 3 }, 'lesson_id', 'lesson-1')
  })

  it('throws when the question does not belong to the given lesson', async () => {
    mutationMatchesRow = false
    await expect(updateQuizQuestionOrder('lesson-2', 'q1', 3)).rejects.toThrow()
  })
})

describe('deleteQuizQuestion', () => {
  beforeEach(() => {
    mutationMatchesRow = true
  })

  it('deletes one question by id, scoped to lesson_id', async () => {
    deleteQuestionMock.mockClear()
    await deleteQuizQuestion('lesson-1', 'q1')
    expect(deleteQuestionMock).toHaveBeenCalledWith('q1', 'lesson_id', 'lesson-1')
  })

  it('throws when the question does not belong to the given lesson', async () => {
    mutationMatchesRow = false
    await expect(deleteQuizQuestion('lesson-2', 'q1')).rejects.toThrow()
  })
})
