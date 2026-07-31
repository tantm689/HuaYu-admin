import { describe, it, expect } from 'vitest'
import { QuizQuestionSchema } from '@/lib/gemini/quizSchema'

describe('QuizQuestionSchema', () => {
  it('accepts a valid pinyin_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'pinyin_choice',
      order: 1,
      prompt: '你好',
      choices: ['nǐ hǎo', 'nī hǎo', 'ní hào', 'nǐ hào'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid listening_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'listening_choice',
      order: 2,
      audioUrl: 'https://x/vocab/a.mp3',
      choices: ['你好', '再見', '謝謝', '對不起'],
      correctIndex: 2,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid tone_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'tone_choice',
      order: 3,
      wordZh: '你好',
      pinyinNoTone: 'ni hao',
      choices: ['nǐ hǎo', 'ní háo', 'nī hāo', 'nì hào'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid matching question with exactly 5 pairs', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'matching',
      order: 1,
      pairs: [
        { left: '你好', right: 'xin chào' },
        { left: '謝謝', right: 'cảm ơn' },
        { left: '再見', right: 'tạm biệt' },
        { left: '對不起', right: 'xin lỗi' },
        { left: '請', right: 'xin mời' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a matching question with fewer than 5 pairs', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'matching',
      order: 1,
      pairs: [{ left: '你好', right: 'xin chào' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid fill_blank question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'fill_blank',
      order: 2,
      contextSentence: '你今天要做什麼？',
      sentence: '我___去中國學習漢語。',
      choices: ['想', '在', '和', '把'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a fill_blank question missing contextSentence', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'fill_blank',
      order: 2,
      sentence: '我___去中國學習漢語。',
      choices: ['想', '在', '和', '把'],
      correctIndex: 0,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid sentence_order question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡', '吃', '中國菜'],
      correctOrder: [0, 1, 2, 3],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid sentence_order question whose correctOrder is a shuffled permutation', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡', '吃', '中國菜'],
      correctOrder: [3, 0, 1, 2],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a sentence_order question whose correctOrder repeats an index (not a permutation)', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡'],
      correctOrder: [0, 0, 7],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a sentence_order question whose correctOrder is the wrong length', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡', '吃'],
      correctOrder: [0, 1],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a sentence_order question whose correctOrder has an out-of-range index', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡', '吃'],
      correctOrder: [0, 1, 3],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown type', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'translation',
      order: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a choices array that is not exactly 4 items', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'pinyin_choice',
      order: 1,
      prompt: '你好',
      choices: ['a', 'b', 'c'],
      correctIndex: 0,
    })
    expect(result.success).toBe(false)
  })
})
