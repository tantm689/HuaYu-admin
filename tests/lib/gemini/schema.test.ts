import { describe, it, expect } from 'vitest'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const validSample = {
  lesson: { lessonNo: 1, titleZh: '歡迎你來臺灣！', titleVi: 'Chào mừng bạn đến Đài Loan!', theme: 'Giới thiệu bản thân', objectives: ['Học cách chào hỏi đơn giản.'] },
  dialogues: [{
    order: 1, titleZh: '對話一', titleVi: 'Hội thoại I', audioCode: '01-1',
    lines: [{ order: 1, speakerZh: '明華', speakerPinyin: 'Mínghuá', textZh: '請問你是陳月美小姐嗎？', pinyin: 'Qǐngwèn nǐ shì Chén Yuèměi xiǎojiě ma?', translationVi: 'Xin hỏi bạn có phải là cô Trần Nguyệt Mỹ không?' }],
  }],
  vocabulary: [{ order: 19, category: 'Cụm từ', wordZh: '歡迎', pinyin: 'huānyíng', zhuyin: 'ㄏㄨㄢ ㄧㄥˊ', meaningVi: 'hoan nghênh, chào mừng' }],
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
      vocabulary: [{ order: 1, category: null, wordZh: '你好', pinyin: null, zhuyin: null, meaningVi: null }],
    }
    const parsed = ExtractionResultSchema.parse(sparse)
    expect(parsed.vocabulary[0].pinyin).toBeNull()
  })
})
