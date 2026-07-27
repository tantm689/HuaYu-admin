import { describe, it, expect } from 'vitest'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const validSample = {
  lesson: { lessonNo: 1, titleZh: '歡迎你來臺灣！', titleVi: 'Chào mừng bạn đến Đài Loan!' },
  dialogues: [{
    order: 1, titleZh: '對話一', titleVi: 'Hội thoại I', audioCode: '01-1',
    lines: [{ order: 1, speakerZh: '明華', speakerPinyin: 'Mínghuá', textZh: '請問你是陳月美小姐嗎？', pinyin: 'Qǐngwèn nǐ shì Chén Yuèměi xiǎojiě ma?', translationVi: 'Xin hỏi bạn có phải là cô Trần Nguyệt Mỹ không?' }],
  }],
  vocabulary: [{ order: 19, wordZh: '歡迎', pinyin: 'huānyíng', meaningVi: 'hoan nghênh, chào mừng' }],
  grammarPoints: [{
    order: 1, titleZh: 'I. 用「很」+ 狀態動詞', titleVi: 'Dùng 很 với động từ trạng thái', structureNote: 'Chủ ngữ + 很 hěn + Động từ trạng thái.',
    examples: [{ order: 1, textZh: '烏龍茶很好喝。', pinyin: 'Wūlóng chá hěn hǎohē.', translationVi: 'Trà Ô Long uống rất ngon.' }],
  }],
}

describe('ExtractionResultSchema', () => {
  it('accepts a well-formed extraction result', () => {
    expect(() => ExtractionResultSchema.parse(validSample)).not.toThrow()
  })

  it('rejects a result missing lesson.titleZh', () => {
    const bad = { ...validSample, lesson: { ...validSample.lesson, titleZh: undefined } }
    expect(() => ExtractionResultSchema.parse(bad)).toThrow()
  })

  it('defaults missing optional pinyin/translation fields to null instead of failing', () => {
    const sparse = {
      ...validSample,
      vocabulary: [{ order: 1, wordZh: '你好', pinyin: null, meaningVi: null }],
    }
    const parsed = ExtractionResultSchema.parse(sparse)
    expect(parsed.vocabulary[0].pinyin).toBeNull()
  })

  it('defaults a grammar point missing subPoints to an empty array', () => {
    const parsed = ExtractionResultSchema.parse(validSample)
    expect(parsed.grammarPoints[0].subPoints).toEqual([])
  })

  it('accepts a grammar point with lettered subPoints, each with their own structureNote and examples', () => {
    const withSubPoints = {
      ...validSample,
      grammarPoints: [{
        order: 1, titleZh: 'I. 問問題的方法', titleVi: 'Cách đặt câu hỏi', structureNote: null, examples: [],
        subPoints: [
          {
            order: 1, label: 'A', titleZh: 'A不A', titleVi: 'Câu hỏi với A不A', structureNote: 'Cấu trúc: A不A.',
            examples: [{ order: 1, textZh: '你好不好？', pinyin: 'Nǐ hǎo bù hǎo?', translationVi: 'Bạn có tốt không?' }],
          },
          {
            order: 2, label: 'B', titleZh: '嗎', titleVi: 'Câu hỏi với 嗎', structureNote: 'Cấu trúc: CÂU + 嗎?',
            examples: [],
          },
        ],
      }],
    }
    const parsed = ExtractionResultSchema.parse(withSubPoints)
    expect(parsed.grammarPoints[0].subPoints).toHaveLength(2)
    expect(parsed.grammarPoints[0].subPoints[0]).toMatchObject({ label: 'A', titleVi: 'Câu hỏi với A不A' })
    expect(parsed.grammarPoints[0].subPoints[0].examples).toHaveLength(1)
  })
})
