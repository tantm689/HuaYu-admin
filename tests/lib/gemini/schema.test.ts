import { describe, it, expect } from 'vitest'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const validSample = {
  lesson: { lessonNo: 1, titleZh: '歡迎你來臺灣！', titleVi: 'Chào mừng bạn đến Đài Loan!' },
  dialogues: [{
    order: 1, audioCode: '01-1',
    lines: [{ order: 1, speakerZh: '明華', speakerPinyin: 'Mínghuá', textZh: '請問你是陳月美小姐嗎？', pinyin: 'Qǐngwèn nǐ shì Chén Yuèměi xiǎojiě ma?', translationVi: 'Xin hỏi bạn có phải là cô Trần Nguyệt Mỹ không?' }],
    vocabulary: [{ order: 19, wordZh: '歡迎', pinyin: 'huānyíng', meaningVi: 'hoan nghênh, chào mừng' }],
  }],
  grammarPoints: [{
    order: 1, titleVi: 'Dùng 很 với động từ trạng thái',
    sections: [{
      order: 1, label: 'Cấu trúc', content: 'Chủ ngữ + 很 hěn + Động từ trạng thái.',
      examples: [{ order: 1, textZh: '烏龍茶很好喝。', pinyin: 'Wūlóng chá hěn hǎohē.', translationVi: 'Trà Ô Long uống rất ngon.' }],
    }],
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
      dialogues: [{
        ...validSample.dialogues[0],
        vocabulary: [{ order: 1, wordZh: '你好', pinyin: null, meaningVi: null }],
      }],
    }
    const parsed = ExtractionResultSchema.parse(sparse)
    expect(parsed.dialogues[0].vocabulary[0].pinyin).toBeNull()
  })

  it('defaults a dialogue missing kind to "dialogue"', () => {
    const parsed = ExtractionResultSchema.parse(validSample)
    expect(parsed.dialogues[0].kind).toBe('dialogue')
  })

  it('accepts a passage-kind dialogue with lines split by sentence and no speakers', () => {
    const withPassage = {
      ...validSample,
      dialogues: [{
        order: 1, kind: 'passage', audioCode: '09-03',
        lines: [
          { order: 1, speakerZh: null, speakerPinyin: null, textZh: '高美玲利用放假的時候到處去旅行。', pinyin: null, translationVi: null },
          { order: 2, speakerZh: null, speakerPinyin: null, textZh: '她喜歡台北這個大城市。', pinyin: null, translationVi: null },
        ],
        vocabulary: [],
      }],
    }
    const parsed = ExtractionResultSchema.parse(withPassage)
    expect(parsed.dialogues[0].kind).toBe('passage')
    expect(parsed.dialogues[0].lines).toHaveLength(2)
  })

  it('defaults a dialogue missing vocabulary to an empty array', () => {
    const noVocab = {
      ...validSample,
      dialogues: [{
        order: 1, audioCode: null,
        lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: '你好', pinyin: null, translationVi: null }],
      }],
    }
    const parsed = ExtractionResultSchema.parse(noVocab)
    expect(parsed.dialogues[0].vocabulary).toEqual([])
  })

  it('accepts multiple sections each with their own label, content, and examples', () => {
    const withSections = {
      ...validSample,
      grammarPoints: [{
        order: 1, titleVi: null,
        sections: [
          { order: 1, label: 'Chức năng', content: 'Giải thích chức năng.', examples: [{ order: 1, textZh: '我不去。', pinyin: null, translationVi: null }] },
          { order: 2, label: 'Câu hỏi', content: null, examples: [{ order: 1, textZh: '你去嗎？', pinyin: null, translationVi: null }] },
        ],
      }],
    }
    const parsed = ExtractionResultSchema.parse(withSections)
    expect(parsed.grammarPoints[0].sections).toHaveLength(2)
    expect(parsed.grammarPoints[0].sections[0].label).toBe('Chức năng')
    expect(parsed.grammarPoints[0].sections[1].label).toBe('Câu hỏi')
    expect(parsed.grammarPoints[0].sections[1].examples[0].textZh).toBe('你去嗎？')
  })

  it('defaults a grammar point missing subPoints to an empty array', () => {
    const parsed = ExtractionResultSchema.parse(validSample)
    expect(parsed.grammarPoints[0].subPoints).toEqual([])
  })

  it('accepts a grammar point with lettered subPoints, each with their own sections and examples', () => {
    const withSubPoints = {
      ...validSample,
      grammarPoints: [{
        order: 1, titleVi: 'Cách đặt câu hỏi', sections: [],
        subPoints: [
          {
            order: 1, label: 'A', titleVi: 'Câu hỏi với A不A',
            sections: [{
              order: 1, label: 'Cấu trúc', content: 'Cấu trúc: A不A.',
              examples: [{ order: 1, textZh: '你好不好？', pinyin: 'Nǐ hǎo bù hǎo?', translationVi: 'Bạn có tốt không?' }],
            }],
          },
          {
            order: 2, label: 'B', titleVi: 'Câu hỏi với 嗎',
            sections: [{ order: 1, label: 'Cấu trúc', content: 'Cấu trúc: CÂU + 嗎?', examples: [] }],
          },
        ],
      }],
    }
    const parsed = ExtractionResultSchema.parse(withSubPoints)
    expect(parsed.grammarPoints[0].subPoints).toHaveLength(2)
    expect(parsed.grammarPoints[0].subPoints[0]).toMatchObject({ label: 'A', titleVi: 'Câu hỏi với A不A' })
    expect(parsed.grammarPoints[0].subPoints[0].sections[0].examples).toHaveLength(1)
  })
})
