import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
}))

import { generateQuizPart1, generateQuizPart2 } from '@/lib/gemini/generateQuiz'
import type { ExtractionResult } from '@/lib/gemini/schema'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'

function validQuestion(part: 1 | 2, type: string, order: number): QuizQuestion {
  if (type === 'matching') {
    return {
      part: 2,
      type: 'matching',
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
    return { part: 2, type: 'sentence_order', order, words: ['我', '喜歡', '吃', '中國菜'], correctOrder: [0, 1, 2, 3] }
  }
  if (type === 'fill_blank') {
    return { part: 2, type: 'fill_blank', order, sentence: '我___去。', choices: ['想', '在', '和', '把'], correctIndex: 0 }
  }
  if (type === 'listening_choice') {
    return {
      part: 1,
      type: 'listening_choice',
      order,
      audioUrl: 'https://x/vocab/a.mp3',
      choices: ['你好', '再見', '謝謝', '對不起'],
      correctIndex: 0,
    }
  }
  if (type === 'tone_choice') {
    return {
      part: 1,
      type: 'tone_choice',
      order,
      wordZh: '你好',
      pinyinNoTone: 'ni hao',
      choices: ['nǐ hǎo', 'ní háo', 'nī hāo', 'nì hào'],
      correctIndex: 0,
    }
  }
  return { part: 1, type: 'pinyin_choice', order, prompt: '你好', choices: ['nǐ hǎo', 'nī hǎo', 'ní hào', 'nǐ hào'], correctIndex: 0 }
}

function fifteenPart1Questions() {
  const types = ['pinyin_choice', 'listening_choice', 'tone_choice']
  const questions = []
  let order = 1
  for (const type of types) {
    for (let i = 0; i < 5; i++) questions.push(validQuestion(1, type, order++))
  }
  return questions
}

function fifteenPart2Questions() {
  const types = ['matching', 'fill_blank', 'sentence_order']
  const questions = []
  let order = 1
  for (const type of types) {
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
  }
}

describe('generateQuizPart1', () => {
  beforeEach(() => {
    generateContentMock.mockReset()
  })

  it('returns 15 validated part-1 questions parsed from the Gemini response, usedFallbackModel always false', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions: fifteenPart1Questions() }) })

    const { questions, usedFallbackModel } = await generateQuizPart1(baseResult())

    expect(questions).toHaveLength(15)
    expect(questions.every((q) => q.part === 1)).toBe(true)
    expect(usedFallbackModel).toBe(false)
    expect(generateContentMock).toHaveBeenCalledTimes(1)
    expect(generateContentMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.5-flash' }))
  })

  it('passes an abortSignal so a hung Gemini call times out instead of hanging forever', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions: fifteenPart1Questions() }) })
    await generateQuizPart1(baseResult())
    const config = generateContentMock.mock.calls[0][0].config
    expect(config.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('surfaces a clear message when AbortSignal.timeout() fires with its native TimeoutError name', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    generateContentMock.mockRejectedValue(timeoutError)
    await expect(generateQuizPart1(baseResult())).rejects.toThrow(/không phản hồi sau/)
  })

  it('also surfaces a clear message when the SDK rewraps the abort as its own error name (observed in practice)', async () => {
    // @google/genai doesn't reliably forward AbortSignal.timeout()'s
    // TimeoutError name - it can rewrap the abort as its own client error
    // with a generic "This operation was aborted" message instead.
    const wrappedAbortError = new Error('This operation was aborted')
    wrappedAbortError.name = 'APIUserAbortError'
    generateContentMock.mockRejectedValue(wrappedAbortError)
    await expect(generateQuizPart1(baseResult())).rejects.toThrow(/không phản hồi sau/)
  })

  it('throws when the model call fails, with no retry against a different model', async () => {
    generateContentMock.mockRejectedValue(new Error('service unavailable'))
    await expect(generateQuizPart1(baseResult())).rejects.toThrow('service unavailable')
    expect(generateContentMock).toHaveBeenCalledTimes(1)
  })

  it('throws when Gemini returns invalid JSON', async () => {
    generateContentMock.mockResolvedValue({ text: 'not json' })
    await expect(generateQuizPart1(baseResult())).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the response fails schema validation', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: [{ part: 1, type: 'pinyin_choice', order: 1 }] }),
    })
    await expect(generateQuizPart1(baseResult())).rejects.toThrow()
  })

  it('throws when the response does not have exactly 15 questions', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions: fifteenPart1Questions().slice(0, 14) }) })
    await expect(generateQuizPart1(baseResult())).rejects.toThrow(/15/)
  })
})

describe('generateQuizPart2', () => {
  beforeEach(() => {
    generateContentMock.mockReset()
  })

  it('returns 15 validated part-2 questions parsed from the Gemini response', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions: fifteenPart2Questions() }) })

    const { questions, usedFallbackModel } = await generateQuizPart2(baseResult())

    expect(questions).toHaveLength(15)
    expect(questions.every((q) => q.part === 2)).toBe(true)
    expect(usedFallbackModel).toBe(false)
  })

  it('throws when a sentence_order question has a non-permutation correctOrder', async () => {
    const questions: (QuizQuestion & { correctOrder?: number[] })[] = fifteenPart2Questions()
    const badIndex = questions.findIndex((q) => q.type === 'sentence_order')
    questions[badIndex] = { ...questions[badIndex], correctOrder: [0, 0, 7] }
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions }) })
    await expect(generateQuizPart2(baseResult())).rejects.toThrow()
  })

  it('throws when the response does not have exactly 15 questions', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ questions: fifteenPart2Questions().slice(0, 14) }) })
    await expect(generateQuizPart2(baseResult())).rejects.toThrow(/15/)
  })
})
