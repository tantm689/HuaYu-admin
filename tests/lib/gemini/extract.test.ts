import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateContentMock = vi.fn()

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models: any
      constructor() {
        this.models = { generateContent: generateContentMock }
      }
    }
  }
})

import { extractLessonFromPdf } from '@/lib/gemini/extract'

beforeEach(() => {
  generateContentMock.mockClear()
})

describe('extractLessonFromPdf', () => {
  it('parses a valid Gemini JSON response into an ExtractionResult', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
        dialogues: [],
        vocabulary: [],
        grammarPoints: [],
      }),
    })

    const result = await extractLessonFromPdf(new Uint8Array([1, 2, 3]), 1)
    expect(result.lesson.lessonNo).toBe(1)
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.5-flash' })
    )
  })

  it('throws a descriptive error when the response is not valid JSON', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json' })
    await expect(extractLessonFromPdf(new Uint8Array([1]), 1)).rejects.toThrow(/Gemini/)
  })
})
