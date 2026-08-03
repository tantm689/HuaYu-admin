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
    const grammarMarkdown = '## Ngữ pháp 1: Cách đặt câu hỏi bằng tiếng Trung\n\n**CHỨC NĂNG**\n\nDùng để hỏi.\n\n你好嗎？\n\n*nǐ hǎo ma？*\n\nBạn khoẻ không?'

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
        dialogues: [],
        vocabulary: [],
        grammarMarkdown,
      }),
    })

    const result = await extractLessonFromPdf(new Uint8Array([1, 2, 3]), 1)
    expect(result.lesson.lessonNo).toBe(1)
    expect(result.grammarMarkdown).toBe(grammarMarkdown)
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.6-flash' })
    )
  })

  it('throws a descriptive error when the response is not valid JSON', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json' })
    await expect(extractLessonFromPdf(new Uint8Array([1]), 1)).rejects.toThrow(/Gemini/)
  })
})
