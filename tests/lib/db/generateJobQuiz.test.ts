import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateQuizPart1Mock, generateQuizPart2Mock } = vi.hoisted(() => ({
  generateQuizPart1Mock: vi.fn(),
  generateQuizPart2Mock: vi.fn(),
}))

vi.mock('@/lib/gemini/generateQuiz', () => ({
  generateQuizPart1: generateQuizPart1Mock,
  generateQuizPart2: generateQuizPart2Mock,
}))

let jobStatus = 'audio_ready'
let rawJson: any
let updateError: { message: string } | null = null
const updateMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'job-1', status: jobStatus, raw_json: rawJson }, error: null }) }) }),
          update: (row: any) => ({
            eq: () => {
              updateMock(row)
              if (updateError) return Promise.resolve({ error: updateError })
              if ('raw_json' in row) rawJson = row.raw_json
              if ('status' in row) jobStatus = row.status
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { generateJobQuizPart1, generateJobQuizPart2, saveJobQuiz, JobNotReadyForQuizError } from '@/lib/db/generateJobQuiz'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'

function baseRawJson() {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
    dialogues: [],
    grammarPoints: [],
    quizQuestions: [],
  }
}

const fifteenPart1Questions: QuizQuestion[] = Array.from({ length: 15 }, (_, i) => ({
  part: 1,
  type: 'pinyin_choice',
  order: i + 1,
  prompt: 'x',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

const fifteenPart2Questions: QuizQuestion[] = Array.from({ length: 15 }, (_, i) => ({
  part: 2,
  type: 'fill_blank',
  order: i + 1,
  sentence: 'y___z',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

describe('generateJobQuizPart1', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateError = null
    updateMock.mockClear()
    generateQuizPart1Mock.mockClear()
  })

  it('rejects generating quiz for a job not yet audio_ready or quiz_ready', async () => {
    jobStatus = 'reviewed'
    await expect(generateJobQuizPart1('job-1')).rejects.toThrow(JobNotReadyForQuizError)
  })

  it('overwrites raw_json.quizQuestions with the generated part-1 questions', async () => {
    generateQuizPart1Mock.mockResolvedValue(fifteenPart1Questions)
    const questions = await generateJobQuizPart1('job-1')
    expect(questions).toHaveLength(15)
    expect(rawJson.quizQuestions).toHaveLength(15)
  })

  it('preserves existing part-2 questions when regenerating part 1', async () => {
    rawJson.quizQuestions = fifteenPart2Questions
    generateQuizPart1Mock.mockResolvedValue(fifteenPart1Questions)
    const questions = await generateJobQuizPart1('job-1')
    expect(questions).toHaveLength(30)
    expect(questions.filter((q) => q.part === 1)).toHaveLength(15)
    expect(questions.filter((q) => q.part === 2)).toHaveLength(15)
  })

  it('throws when the DB update fails, instead of silently succeeding', async () => {
    generateQuizPart1Mock.mockResolvedValue(fifteenPart1Questions)
    updateError = { message: 'connection reset' }
    await expect(generateJobQuizPart1('job-1')).rejects.toThrow('connection reset')
  })
})

describe('generateJobQuizPart2', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateError = null
    updateMock.mockClear()
    generateQuizPart2Mock.mockClear()
  })

  it('rejects generating quiz for a job not yet audio_ready or quiz_ready', async () => {
    jobStatus = 'reviewed'
    await expect(generateJobQuizPart2('job-1')).rejects.toThrow(JobNotReadyForQuizError)
  })

  it('overwrites raw_json.quizQuestions with the generated part-2 questions', async () => {
    generateQuizPart2Mock.mockResolvedValue(fifteenPart2Questions)
    const questions = await generateJobQuizPart2('job-1')
    expect(questions).toHaveLength(15)
    expect(rawJson.quizQuestions).toHaveLength(15)
  })

  it('preserves existing part-1 questions when regenerating part 2', async () => {
    rawJson.quizQuestions = fifteenPart1Questions
    generateQuizPart2Mock.mockResolvedValue(fifteenPart2Questions)
    const questions = await generateJobQuizPart2('job-1')
    expect(questions).toHaveLength(30)
    expect(questions.filter((q) => q.part === 1)).toHaveLength(15)
    expect(questions.filter((q) => q.part === 2)).toHaveLength(15)
  })

  it('throws when the DB update fails, instead of silently succeeding', async () => {
    generateQuizPart2Mock.mockResolvedValue(fifteenPart2Questions)
    updateError = { message: 'connection reset' }
    await expect(generateJobQuizPart2('job-1')).rejects.toThrow('connection reset')
  })
})

describe('saveJobQuiz', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateError = null
    updateMock.mockClear()
  })

  const allThirty = [...fifteenPart1Questions, ...fifteenPart2Questions]

  it('saves the given questions and advances status to quiz_ready', async () => {
    const status = await saveJobQuiz('job-1', allThirty)
    expect(rawJson.quizQuestions).toHaveLength(30)
    expect(status).toBe('quiz_ready')
    expect(jobStatus).toBe('quiz_ready')
  })

  it('keeps status as quiz_ready if already there (re-saving edits)', async () => {
    jobStatus = 'quiz_ready'
    const status = await saveJobQuiz('job-1', allThirty)
    expect(status).toBe('quiz_ready')
  })

  it('throws when the DB update fails, instead of silently reporting saved', async () => {
    updateError = { message: 'connection reset' }
    await expect(saveJobQuiz('job-1', allThirty)).rejects.toThrow('connection reset')
  })
})
