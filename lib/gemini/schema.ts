import { z } from 'zod'

const nullableString = z.string().nullable().default(null)

const DialogueLineSchema = z.object({
  order: z.number(),
  speakerZh: nullableString,
  speakerPinyin: nullableString,
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const DialogueSchema = z.object({
  order: z.number(),
  titleZh: nullableString,
  titleVi: nullableString,
  audioCode: nullableString,
  lines: z.array(DialogueLineSchema),
})

const VocabularyEntrySchema = z.object({
  order: z.number(),
  wordZh: z.string(),
  pinyin: nullableString,
  meaningVi: nullableString,
})

const GrammarExampleSchema = z.object({
  order: z.number(),
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const GrammarPointSchema = z.object({
  order: z.number(),
  titleZh: z.string(),
  titleVi: nullableString,
  structureNote: nullableString,
  examples: z.array(GrammarExampleSchema),
})

const LessonMetaSchema = z.object({
  lessonNo: z.number(),
  titleZh: z.string(),
  titleVi: z.string(),
  theme: nullableString,
  objectives: z.array(z.string()).default([]),
})

export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  vocabulary: z.array(VocabularyEntrySchema),
  grammarPoints: z.array(GrammarPointSchema),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

// Gemini responseSchema (JSON Schema subset) mirroring ExtractionResultSchema,
// used to force structured output from the model.
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lesson: {
      type: 'object',
      description: 'Thông tin chung của bài học (metadata), lấy từ tiêu đề đầu bài.',
      properties: {
        lessonNo: { type: 'integer', description: 'Số thứ tự bài học, đúng bằng giá trị lessonNo được cung cấp trong yêu cầu.' },
        titleZh: { type: 'string', description: 'Tiêu đề bài học bằng chữ Hán, lấy nguyên văn từ đầu bài.' },
        titleVi: { type: 'string', description: 'Tiêu đề bài học dịch/ghi bằng tiếng Việt, lấy nguyên văn từ đầu bài nếu có.' },
        theme: { type: 'string', nullable: true, description: 'Chủ đề của bài học nếu sách có ghi rõ (ví dụ chủ đề giao tiếp), null nếu không có.' },
        objectives: { type: 'array', items: { type: 'string' }, description: 'Danh sách mục tiêu học tập của bài (學習目標), nếu sách có liệt kê; mảng rỗng nếu không có.' },
      },
      required: ['lessonNo', 'titleZh', 'titleVi'],
    },
    dialogues: {
      type: 'array',
      description: 'Toàn bộ các đoạn hội thoại (對話) trong bài, giữ đúng thứ tự xuất hiện trong sách.',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer', description: 'Thứ tự của đoạn hội thoại trong bài, bắt đầu từ 1.' },
          titleZh: { type: 'string', nullable: true, description: 'Tiêu đề đoạn hội thoại bằng chữ Hán nếu có, null nếu không có.' },
          titleVi: { type: 'string', nullable: true, description: 'Tiêu đề đoạn hội thoại bằng tiếng Việt nếu có, null nếu không có.' },
          audioCode: { type: 'string', nullable: true, description: 'Mã audio track của đoạn hội thoại nếu sách có ghi (ví dụ "01-1"), null nếu không có.' },
          lines: {
            type: 'array',
            description: 'Danh sách các dòng thoại trong đoạn hội thoại, đúng theo thứ tự xuất hiện.',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của dòng thoại trong đoạn hội thoại, bắt đầu từ 1.' },
                speakerZh: { type: 'string', nullable: true, description: 'Tên người nói bằng chữ Hán nếu có, null nếu không có.' },
                speakerPinyin: { type: 'string', nullable: true, description: 'Pinyin của tên người nói nếu có, null nếu không có.' },
                textZh: { type: 'string', description: 'Nội dung câu thoại bằng chữ Hán, lấy nguyên văn từ sách.' },
                pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu thoại nếu sách có ghi, null nếu không có.' },
                translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu thoại nếu sách có ghi, null nếu không có.' },
              },
              required: ['order', 'textZh'],
            },
          },
        },
        required: ['order', 'lines'],
      },
    },
    vocabulary: {
      type: 'array',
      description: 'Toàn bộ các từ trong bảng Từ vựng (生詞) chính thức của bài, giữ đúng thứ tự xuất hiện trong bảng.',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer', description: 'Thứ tự của từ vựng trong bảng từ vựng, bắt đầu từ 1.' },
          wordZh: { type: 'string', description: 'Chữ Hán của từ vựng, lấy nguyên văn từ bảng từ vựng.' },
          pinyin: { type: 'string', nullable: true, description: 'Pinyin của từ vựng nếu bảng có ghi, null nếu không có.' },
          meaningVi: {
            type: 'string',
            nullable: true,
            description:
              'Nghĩa tiếng Việt của từ, lấy nguyên văn từ cột nghĩa trong bảng từ vựng — KHÔNG được để trống nếu sách có ghi nghĩa cho từ này.',
          },
        },
        required: ['order', 'wordZh'],
      },
    },
    grammarPoints: {
      type: 'array',
      description: 'Toàn bộ các điểm ngữ pháp trong bài, không bao gồm phần luyện tập/bài tập hỏi-đáp.',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer', description: 'Thứ tự của điểm ngữ pháp trong bài, bắt đầu từ 1.' },
          titleZh: { type: 'string', description: 'Tiêu đề điểm ngữ pháp bằng chữ Hán, lấy nguyên văn từ sách.' },
          titleVi: { type: 'string', nullable: true, description: 'Tiêu đề điểm ngữ pháp bằng tiếng Việt nếu có, null nếu không có.' },
          structureNote: { type: 'string', nullable: true, description: 'Phần giải thích cấu trúc ngữ pháp ("Cấu trúc") nếu sách có ghi, null nếu không có.' },
          examples: {
            type: 'array',
            description: 'Các câu ví dụ minh hoạ cho điểm ngữ pháp, đánh số theo đúng thứ tự trong sách.',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của câu ví dụ, bắt đầu từ 1.' },
                textZh: { type: 'string', description: 'Nội dung câu ví dụ bằng chữ Hán, lấy nguyên văn từ sách.' },
                pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu ví dụ nếu sách có ghi, null nếu không có.' },
                translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu ví dụ nếu sách có ghi, null nếu không có.' },
              },
              required: ['order', 'textZh'],
            },
          },
        },
        required: ['order', 'titleZh', 'examples'],
      },
    },
  },
  required: ['lesson', 'dialogues', 'vocabulary', 'grammarPoints'],
} as const
