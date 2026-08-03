import { describe, it, expect } from 'vitest'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const validSample = {
  lesson: { lessonNo: 1, titleZh: '歡迎你來臺灣！', titleVi: 'Chào mừng bạn đến Đài Loan!' },
  dialogues: [{
    order: 1, audioCode: '01-1',
    lines: [{ order: 1, speakerZh: '明華', speakerPinyin: 'Mínghuá', textZh: '請問你是陳月美小姐嗎？', pinyin: 'Qǐngwèn nǐ shì Chén Yuèměi xiǎojiě ma?', translationVi: 'Xin hỏi bạn có phải là cô Trần Nguyệt Mỹ không?' }],
    vocabulary: [{ order: 19, wordZh: '歡迎', pinyin: 'huānyíng', meaningVi: 'hoan nghênh, chào mừng' }],
  }],
  grammarMarkdown: '# Ngữ pháp 1: Dùng 很 với động từ trạng thái\n\n**CẤU TRÚC**\n\nChủ ngữ + 很 hěn + Động từ trạng thái.\n\n烏龍茶很好喝。\n\n*Wūlóng chá hěn hǎohē.*\n\nTrà Ô Long uống rất ngon.',
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

  it('accepts a grammarMarkdown string with multiple headings, bold labels, and example blocks', () => {
    const withSections = {
      ...validSample,
      grammarMarkdown:
        '# Ngữ pháp 1: Cách phủ định\n\n**CHỨC NĂNG**\n\nGiải thích chức năng.\n\n我不去。\n\n*Wǒ bù qù.*\n\nTôi không đi.\n\n**CÂU HỎI**\n\n你去嗎？\n\n*Nǐ qù ma?*\n\nBạn có đi không?',
    }
    const parsed = ExtractionResultSchema.parse(withSections)
    expect(parsed.grammarMarkdown).toContain('**CHỨC NĂNG**')
    expect(parsed.grammarMarkdown).toContain('**CÂU HỎI**')
    expect(parsed.grammarMarkdown).toContain('你去嗎？')
  })

  it('accepts a grammarMarkdown string with lettered subheadings for lettered sub-points', () => {
    const withSubPoints = {
      ...validSample,
      grammarMarkdown:
        '# Ngữ pháp 1: Cách đặt câu hỏi\n\n## A. Câu hỏi với A不A\n\n**CẤU TRÚC**\n\nCấu trúc: A不A.\n\n你好不好？\n\n*Nǐ hǎo bù hǎo?*\n\nBạn có tốt không?\n\n## B. Câu hỏi với 嗎\n\n**CẤU TRÚC**\n\nCấu trúc: CÂU + 嗎?',
    }
    const parsed = ExtractionResultSchema.parse(withSubPoints)
    expect(parsed.grammarMarkdown).toContain('## A. Câu hỏi với A不A')
    expect(parsed.grammarMarkdown).toContain('## B. Câu hỏi với 嗎')
  })

})
