import { createServerSupabase } from '@/lib/supabase/server'
import { getLessonFull } from '@/lib/db/getLessonFull'
import { generateQuizPart1, generateQuizPart2 } from '@/lib/gemini/generateQuiz'
import type { ExtractionResult } from '@/lib/gemini/schema'
import type { Part1Question, Part2Question } from '@/lib/gemini/quizSchema'
import type { QuizQuestion } from '@/lib/db/types'

// Adapts a LessonFullView (real DB rows, via getLessonFull) into the
// ExtractionResult shape lib/gemini/generateQuiz.ts already knows how to
// consume - it only reads lesson/dialogues/grammarPoints, so this doesn't
// need every field ExtractionResult normally carries, just the ones the
// quiz prompt actually uses (wordZh/pinyin/meaningVi/audioUrl for
// vocabulary, textZh for dialogue lines, sections/examples for grammar).
function toExtractionResult(lesson: NonNullable<Awaited<ReturnType<typeof getLessonFull>>>): ExtractionResult {
  return {
    lesson: {
      lessonNo: lesson.lessonNo,
      titleZh: lesson.titleZh,
      titleVi: lesson.titleVi,
      theme: lesson.theme,
      objectives: lesson.objectives,
    },
    dialogues: lesson.dialogues.map((d) => ({
      order: d.order,
      kind: d.kind,
      audioCode: d.audioCode,
      lines: d.lines.map((l) => ({
        order: l.order,
        speakerZh: l.speakerZh,
        speakerPinyin: l.speakerPinyin,
        textZh: l.textZh,
        pinyin: l.pinyin,
        translationVi: l.translationVi,
      })),
      vocabulary: d.vocabulary.map((v) => ({
        order: v.order,
        wordZh: v.wordZh,
        pinyin: v.pinyin,
        meaningVi: v.meaningVi,
        audioUrl: v.audioUrl,
      })),
    })),
    grammarPoints: lesson.grammarPoints.map((g) => ({
      order: g.order,
      titleVi: g.titleVi,
      sections: g.sections.map((s) => ({
        order: s.order,
        label: s.label,
        content: s.content,
        examples: s.examples.map((e) => ({
          order: e.order,
          textZh: e.textZh,
          pinyin: e.pinyin,
          translationVi: e.translationVi,
        })),
        items: s.items.map((it) => ({
          order: it.order,
          label: it.label,
          content: it.content,
          examples: it.examples.map((e) => ({
            order: e.order,
            textZh: e.textZh,
            pinyin: e.pinyin,
            translationVi: e.translationVi,
          })),
        })),
      })),
      subPoints: g.subPoints.map((sp) => ({
        order: sp.order,
        label: sp.label,
        titleVi: sp.titleVi,
        sections: sp.sections.map((s) => ({
          order: s.order,
          label: s.label,
          content: s.content,
          examples: s.examples.map((e) => ({
            order: e.order,
            textZh: e.textZh,
            pinyin: e.pinyin,
            translationVi: e.translationVi,
          })),
          items: s.items.map((it) => ({
            order: it.order,
            label: it.label,
            content: it.content,
            examples: it.examples.map((e) => ({
              order: e.order,
              textZh: e.textZh,
              pinyin: e.pinyin,
              translationVi: e.translationVi,
            })),
          })),
        })),
      })),
    })),
  }
}

async function loadLesson(lessonId: string): Promise<NonNullable<Awaited<ReturnType<typeof getLessonFull>>>> {
  const lesson = await getLessonFull(lessonId)
  if (!lesson) throw new Error('Không tìm thấy bài học.')
  return lesson
}

function toRow(lessonId: string, q: Part1Question | Part2Question): {
  lesson_id: string
  part: number
  type: string
  order: number
  payload: unknown
} {
  const { part, type, order, ...payload } = q
  return { lesson_id: lessonId, part, type, order, payload }
}

async function replacePartRows(
  lessonId: string,
  part: 1 | 2,
  rows: { lesson_id: string; part: number; type: string; order: number; payload: unknown }[]
): Promise<void> {
  const supabase = createServerSupabase()

  const { error: deleteError } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('lesson_id', lessonId)
    .eq('part', part)
  if (deleteError) throw new Error(deleteError.message)

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('quiz_questions').insert(rows)
    if (insertError) throw new Error(insertError.message)
  }
}

export type GenerateLessonQuizResult<T> = { questions: T[]; usedFallbackModel: boolean }

// Generates a fresh Part 1 (15 questions) for an already-imported lesson,
// reading its real DB content (not a job's raw_json) and replacing any
// existing Part 1 rows in quiz_questions - Part 2 rows are untouched.
export async function generateLessonQuizPart1(lessonId: string): Promise<GenerateLessonQuizResult<Part1Question>> {
  const lesson = await loadLesson(lessonId)
  const result = toExtractionResult(lesson)
  const { questions, usedFallbackModel } = await generateQuizPart1(result)

  await replacePartRows(lessonId, 1, questions.map((q) => toRow(lessonId, q)))

  return { questions, usedFallbackModel }
}

// Generates a fresh Part 2 (15 questions), mirrors generateLessonQuizPart1.
export async function generateLessonQuizPart2(lessonId: string): Promise<GenerateLessonQuizResult<Part2Question>> {
  const lesson = await loadLesson(lessonId)
  const result = toExtractionResult(lesson)
  const { questions, usedFallbackModel } = await generateQuizPart2(result)

  await replacePartRows(lessonId, 2, questions.map((q) => toRow(lessonId, q)))

  return { questions, usedFallbackModel }
}

// Reads back all quiz question rows for a lesson (both parts).
export async function getLessonQuizQuestions(lessonId: string): Promise<QuizQuestion[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('quiz_questions').select().eq('lesson_id', lessonId)
  if (error) throw new Error(error.message)
  return (data ?? []) as QuizQuestion[]
}

// Updates one question's payload (admin hand-edit via the Quiz tab).
export async function updateQuizQuestion(id: string, payload: unknown): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').update({ payload }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Updates one question's display order (used when reordering within a part
// - `order` is its own column, not part of `payload`, since importJob.ts's
// insert shape always split {part, type, order, ...payload} apart).
export async function updateQuizQuestionOrder(id: string, order: number): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').update({ order }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Deletes one question by id.
export async function deleteQuizQuestion(id: string): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
