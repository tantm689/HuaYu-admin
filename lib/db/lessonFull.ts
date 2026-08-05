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

const VocabInput = z.object({
  id: rowId,
  order: z.number(),
  wordZh: z.string(),
  pinyin: nullableString,
  meaningVi: nullableString,
})

const DialogueInput = z.object({
  id: rowId,
  order: z.number(),
  kind: z.enum(['dialogue', 'passage']).default('dialogue'),
  audioCode: nullableString,
  lines: z.array(LineInput),
  vocabulary: z.array(VocabInput).default([]),
})

export const LessonFullUpdateSchema = z.object({
  titleZh: z.string(),
  titleVi: z.string(),
  theme: nullableString,
  objectives: z.array(z.string()).default([]),
  dialogues: z.array(DialogueInput),
  grammarMarkdown: z.string(),
})

export type LessonFullUpdate = z.infer<typeof LessonFullUpdateSchema>
