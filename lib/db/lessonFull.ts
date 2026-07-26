import { z } from 'zod'

const nullableString = z.string().nullable().default(null)
// An existing row carries its real DB id; a row the admin just added in the
// editor has no id yet, so the server knows to INSERT it instead of UPDATE.
const rowId = z.string().nullable().default(null)

const LineInput = z.object({
  id: rowId,
  order: z.number(),
  speakerZh: nullableString,
  speakerPinyin: nullableString,
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const DialogueInput = z.object({
  id: rowId,
  order: z.number(),
  titleZh: nullableString,
  titleVi: nullableString,
  audioCode: nullableString,
  lines: z.array(LineInput),
})

const VocabInput = z.object({
  id: rowId,
  order: z.number(),
  wordZh: z.string(),
  pinyin: nullableString,
  meaningVi: nullableString,
})

const ExampleInput = z.object({
  id: rowId,
  order: z.number(),
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const GrammarPointInput = z.object({
  id: rowId,
  order: z.number(),
  titleZh: z.string(),
  titleVi: nullableString,
  structureNote: nullableString,
  examples: z.array(ExampleInput),
})

export const LessonFullUpdateSchema = z.object({
  titleZh: z.string(),
  titleVi: z.string(),
  theme: nullableString,
  dialogues: z.array(DialogueInput),
  vocabulary: z.array(VocabInput),
  grammarPoints: z.array(GrammarPointInput),
})

export type LessonFullUpdate = z.infer<typeof LessonFullUpdateSchema>
