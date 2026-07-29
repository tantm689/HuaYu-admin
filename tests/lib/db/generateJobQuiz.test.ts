import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateQuizMock } = vi.hoisted(() => ({ generateQuizMock: vi.fn() }))

vi.mock('@/lib/gemini/generateQuiz', () => ({
  generateQuiz: generateQuizMock,
}))

let jobStatus = 'audio_ready'
let rawJson: any
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

import { generateJobQuiz, saveJobQuiz, JobNotReadyForQuizError } from '@/lib/db/generateJobQuiz'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'

function baseRawJson() {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
    dialogues: [],
    grammarPoints: [],
    quizQuestions: [],
  }
}

const thirtyQuestions: QuizQuestion[] = Array.from({ length: 30 }, (_, i) => ({
  part: 1,
  type: 'pinyin_choice',
  order: i + 1,
  prompt: 'x',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

describe('generateJobQuiz', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateMock.mockClear()
    generateQuizMock.mockClear()
  })

  it('rejects generating quiz for a job not yet audio_ready or quiz_ready', async () => {
    jobStatus = 'reviewed'
    await expect(generateJobQuiz('job-1')).rejects.toThrow(JobNotReadyForQuizError)
  })

  it('overwrites raw_json.quizQuestions with the generated questions', async () => {
    generateQuizMock.mockResolvedValue(thirtyQuestions)
    const questions = await generateJobQuiz('job-1')
    expect(questions).toHaveLength(30)
    expect(rawJson.quizQuestions).toHaveLength(30)
  })

  it('overwrites existing quiz questions when regenerated', async () => {
    rawJson.quizQuestions = [{ part: 1, type: 'pinyin_choice', order: 1, prompt: 'old', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 }]
    generateQuizMock.mockResolvedValue(thirtyQuestions)
    await generateJobQuiz('job-1')
    expect(rawJson.quizQuestions).toHaveLength(30)
    expect(rawJson.quizQuestions[0].prompt).toBe('x')
  })
})

describe('saveJobQuiz', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateMock.mockClear()
  })

  it('saves the given questions and advances status to quiz_ready', async () => {
    const status = await saveJobQuiz('job-1', thirtyQuestions)
    expect(rawJson.quizQuestions).toHaveLength(30)
    expect(status).toBe('quiz_ready')
    expect(jobStatus).toBe('quiz_ready')
  })

  it('keeps status as quiz_ready if already there (re-saving edits)', async () => {
    jobStatus = 'quiz_ready'
    const status = await saveJobQuiz('job-1', thirtyQuestions)
    expect(status).toBe('quiz_ready')
  })
})
