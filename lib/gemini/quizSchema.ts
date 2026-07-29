import { z } from 'zod'

const choice4 = z.array(z.string()).length(4)

const PinyinChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('pinyin_choice'),
  order: z.number(),
  prompt: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const ListeningChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('listening_choice'),
  order: z.number(),
  audioUrl: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const ToneChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('tone_choice'),
  order: z.number(),
  wordZh: z.string(),
  pinyinNoTone: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const MatchingSchema = z.object({
  part: z.literal(2),
  type: z.literal('matching'),
  order: z.number(),
  pairs: z
    .array(
      z.object({
        left: z.string(),
        right: z.string(),
      })
    )
    .length(5),
})

const FillBlankSchema = z.object({
  part: z.literal(2),
  type: z.literal('fill_blank'),
  order: z.number(),
  sentence: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const SentenceOrderSchema = z.object({
  part: z.literal(2),
  type: z.literal('sentence_order'),
  order: z.number(),
  words: z.array(z.string()).min(2),
  correctOrder: z.array(z.number()),
})

// z.discriminatedUnion requires each member to be a plain ZodObject with a
// literal discriminator field, so the `correctOrder`-is-a-permutation check
// can't live as a `.refine()` on SentenceOrderSchema itself (that would wrap
// it in a ZodEffects and break the union). Applied as a `.superRefine()` on
// the whole union instead, gated on `type === 'sentence_order'`.
export const QuizQuestionSchema = z
  .discriminatedUnion('type', [
    PinyinChoiceSchema,
    ListeningChoiceSchema,
    ToneChoiceSchema,
    MatchingSchema,
    FillBlankSchema,
    SentenceOrderSchema,
  ])
  .superRefine((q, ctx) => {
    if (q.type !== 'sentence_order') return

    const { words, correctOrder } = q
    const isPermutation =
      correctOrder.length === words.length &&
      new Set(correctOrder).size === words.length &&
      correctOrder.every((i) => Number.isInteger(i) && i >= 0 && i < words.length)

    if (!isPermutation) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOrder'],
        message: 'correctOrder must be a permutation of words indices',
      })
    }
  })

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>

// Gemini responseSchema (JSON Schema subset) mirroring QuizQuestionSchema.
// Gemini's structured output doesn't support Zod discriminated unions
// directly, so each type's shape is expressed as an object with all
// possible fields optional except the ones shared - the Zod schema above is
// the real validation gate applied after parsing the response.
export const GEMINI_QUIZ_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Đúng 30 câu hỏi quiz: 5 câu cho mỗi dạng trong 6 dạng, chia thành part 1 (pinyin_choice, listening_choice, tone_choice) và part 2 (matching, fill_blank, sentence_order).',
      items: {
        type: 'object',
        properties: {
          part: { type: 'integer', enum: [1, 2], description: '1 cho pinyin_choice/listening_choice/tone_choice, 2 cho matching/fill_blank/sentence_order.' },
          type: {
            type: 'string',
            enum: ['pinyin_choice', 'listening_choice', 'tone_choice', 'matching', 'fill_blank', 'sentence_order'],
            description: 'Dạng câu hỏi.',
          },
          order: { type: 'integer', description: 'Thứ tự hiển thị trong toàn bộ danh sách câu hỏi, bắt đầu từ 1.' },
          prompt: { type: 'string', nullable: true, description: 'Dùng cho pinyin_choice: chữ Hán hoặc pinyin để hỏi.' },
          audioUrl: { type: 'string', nullable: true, description: 'Dùng cho listening_choice: audio_url của từ vựng đã có sẵn - PHẢI lấy nguyên văn từ dữ liệu được cung cấp, không tự bịa.' },
          wordZh: { type: 'string', nullable: true, description: 'Dùng cho tone_choice: chữ Hán của từ.' },
          pinyinNoTone: { type: 'string', nullable: true, description: 'Dùng cho tone_choice: pinyin không dấu thanh điệu của từ.' },
          choices: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho pinyin_choice/listening_choice/tone_choice/fill_blank: đúng 4 lựa chọn.',
            items: { type: 'string' },
          },
          correctIndex: { type: 'integer', nullable: true, description: 'Dùng cho pinyin_choice/listening_choice/tone_choice/fill_blank: chỉ số (0-3) của đáp án đúng trong choices.' },
          pairs: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho matching: đúng 5 cặp Hán-Việt để nối.',
            items: {
              type: 'object',
              properties: {
                left: { type: 'string', description: 'Chữ Hán.' },
                right: { type: 'string', description: 'Nghĩa tiếng Việt tương ứng.' },
              },
              required: ['left', 'right'],
            },
          },
          sentence: { type: 'string', nullable: true, description: 'Dùng cho fill_blank: câu có chỗ trống đánh dấu bằng "___".' },
          words: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho sentence_order: các từ/cụm từ đã xáo trộn.',
            items: { type: 'string' },
          },
          correctOrder: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho sentence_order: thứ tự index đúng (theo vị trí trong mảng "words") để ghép thành câu hoàn chỉnh.',
            items: { type: 'integer' },
          },
        },
        required: ['part', 'type', 'order'],
      },
    },
  },
  required: ['questions'],
} as const
