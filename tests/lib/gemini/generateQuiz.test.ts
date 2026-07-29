import { describe, it, expect, vi } from 'vitest'

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
}))

import { generateQuiz } from '@/lib/gemini/generateQuiz'
import type { ExtractionResult } from '@/lib/gemini/schema'

function validQuestion(part: 1 | 2, type: string, order: number) {
  if (type === 'matching') {
    return {
      part,
      type,
      order,
      pairs: [
        { left: '你好', right: 'xin chào' },
        { left: '謝謝', right: 'cảm ơn' },
        { left: '再見', right: 'tạm biệt' },
        { left: '對不起', right: 'xin lỗi' },
        { left: '請', right: 'xin mời' },
      ],
    }
  }
  if (type === 'sentence_order') {
    return { part, type, order, words: ['我', '喜歡', '吃', '中國菜'], correctOrder: [0, 1, 2, 3] }
  }
  if (type === 'fill_blank') {
    return { part, type, order, sentence: '我___去。', choices: ['想', '在', '和', '把'], correctIndex: 0 }
  }
  if (type === 'listening_choice') {
    return { part, type, order, audioUrl: 'https://x/vocab/a.mp3', choices: ['你好', '再見', '謝謝', '對不起'], correctIndex: 0 }
  }
  if (type === 'tone_choice') {
    return { part, type, order, wordZh: '你好', pinyinNoTone: 'ni hao', choices: ['nǐ hǎo', 'ní háo', 'nī hāo', 'nì hào'], correctIndex: 0 }
  }
  return { part, type, order, prompt: '你好', choices: ['nǐ hǎo', 'nī hǎo', 'ní hào', 'nǐ hào'], correctIndex: 0 }
}

function thirtyValidQuestions() {
  const part1Types = ['pinyin_choice', 'listening_choice', 'tone_choice']
  const part2Types = ['matching', 'fill_blank', 'sentence_order']
  const questions = []
  let order = 1
  for (const type of part1Types) {
    for (let i = 0; i < 5; i++) questions.push(validQuestion(1, type, order++))
  }
  for (const type of part2Types) {
    for (let i = 0; i < 5; i++) questions.push(validQuestion(2, type, order++))
  }
  return questions
}

function baseResult(): ExtractionResult {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B', theme: null, objectives: [] },
    dialogues: [
      {
        order: 1,
        kind: 'dialogue',
        audioCode: null,
        lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: '你好', pinyin: null, translationVi: null }],
        vocabulary: [{ order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào', audioUrl: 'https://x/vocab/a.mp3' }],
      },
    ],
    grammarPoints: [],
    quizQuestions: [],
  }
}

describe('generateQuiz', () => {
  it('returns 30 validated quiz questions parsed from the Gemini response', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: thirtyValidQuestions() }),
    })

    const questions = await generateQuiz(baseResult())

    expect(questions).toHaveLength(30)
    expect(questions.filter((q) => q.part === 1)).toHaveLength(15)
    expect(questions.filter((q) => q.part === 2)).toHaveLength(15)
  })

  it('throws when Gemini returns invalid JSON', async () => {
    generateContentMock.mockResolvedValue({ text: 'not json' })
    await expect(generateQuiz(baseResult())).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the response fails schema validation', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: [{ part: 1, type: 'pinyin_choice', order: 1 }] }),
    })
    await expect(generateQuiz(baseResult())).rejects.toThrow()
  })

  it('throws when the response does not have exactly 30 questions', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: thirtyValidQuestions().slice(0, 29) }),
    })
    await expect(generateQuiz(baseResult())).rejects.toThrow(/30/)
  })
})
