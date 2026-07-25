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
  category: nullableString,
  wordZh: z.string(),
  pinyin: nullableString,
  zhuyin: nullableString,
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
      properties: {
        lessonNo: { type: 'integer' },
        titleZh: { type: 'string' },
        titleVi: { type: 'string' },
        theme: { type: 'string', nullable: true },
        objectives: { type: 'array', items: { type: 'string' } },
      },
      required: ['lessonNo', 'titleZh', 'titleVi'],
    },
    dialogues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          titleZh: { type: 'string', nullable: true },
          titleVi: { type: 'string', nullable: true },
          audioCode: { type: 'string', nullable: true },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                speakerZh: { type: 'string', nullable: true },
                speakerPinyin: { type: 'string', nullable: true },
                textZh: { type: 'string' },
                pinyin: { type: 'string', nullable: true },
                translationVi: { type: 'string', nullable: true },
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
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          category: { type: 'string', nullable: true },
          wordZh: { type: 'string' },
          pinyin: { type: 'string', nullable: true },
          zhuyin: { type: 'string', nullable: true },
          meaningVi: { type: 'string', nullable: true },
        },
        required: ['order', 'wordZh'],
      },
    },
    grammarPoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          titleZh: { type: 'string' },
          titleVi: { type: 'string', nullable: true },
          structureNote: { type: 'string', nullable: true },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                textZh: { type: 'string' },
                pinyin: { type: 'string', nullable: true },
                translationVi: { type: 'string', nullable: true },
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
