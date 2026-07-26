import { createServerSupabase } from '@/lib/supabase/server'
import type {
  Dialogue,
  DialogueLine,
  GrammarExample,
  GrammarPoint,
  Lesson,
  VocabularyEntry,
} from '@/lib/db/types'

export interface LessonFullView {
  id: string
  lessonNo: number
  titleZh: string
  titleVi: string
  status: Lesson['status']
  dialogues: {
    id: string
    order: number
    titleZh: string | null
    titleVi: string | null
    audioCode: string | null
    audioUrl: string | null
    lines: {
      id: string
      order: number
      speakerZh: string | null
      speakerPinyin: string | null
      textZh: string
      pinyin: string | null
      translationVi: string | null
    }[]
  }[]
  vocabulary: {
    id: string
    order: number
    wordZh: string
    pinyin: string | null
    meaningVi: string | null
    audioUrl: string | null
  }[]
  grammarPoints: {
    id: string
    order: number
    titleZh: string
    titleVi: string | null
    structureNote: string | null
    examples: {
      id: string
      order: number
      textZh: string
      pinyin: string | null
      translationVi: string | null
    }[]
  }[]
}

export async function getLessonFull(lessonId: string): Promise<LessonFullView | null> {
  const supabase = createServerSupabase()

  const { data: lesson } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
  if (!lesson) return null
  const lessonRow = lesson as Lesson

  const [{ data: dialogues }, { data: vocabulary }, { data: grammarPoints }] = await Promise.all([
    supabase.from('dialogues').select('*').eq('lesson_id', lessonId).order('order', { ascending: true }),
    supabase.from('vocabulary').select('*').eq('lesson_id', lessonId).order('order', { ascending: true }),
    supabase.from('grammar_points').select('*').eq('lesson_id', lessonId).order('order', { ascending: true }),
  ])

  const dialogueRows = (dialogues ?? []) as Dialogue[]
  const vocabRows = (vocabulary ?? []) as VocabularyEntry[]
  const grammarRows = (grammarPoints ?? []) as GrammarPoint[]

  const dialogueIds = dialogueRows.map((d) => d.id)
  const grammarIds = grammarRows.map((g) => g.id)

  const [{ data: dialogueLines }, { data: grammarExamples }] = await Promise.all([
    dialogueIds.length > 0
      ? supabase.from('dialogue_lines').select('*').in('dialogue_id', dialogueIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as DialogueLine[] }),
    grammarIds.length > 0
      ? supabase
          .from('grammar_examples')
          .select('*')
          .in('grammar_point_id', grammarIds)
          .order('order', { ascending: true })
      : Promise.resolve({ data: [] as GrammarExample[] }),
  ])

  const linesByDialogue = new Map<string, DialogueLine[]>()
  for (const line of (dialogueLines ?? []) as DialogueLine[]) {
    const list = linesByDialogue.get(line.dialogue_id) ?? []
    list.push(line)
    linesByDialogue.set(line.dialogue_id, list)
  }

  const examplesByGrammar = new Map<string, GrammarExample[]>()
  for (const example of (grammarExamples ?? []) as GrammarExample[]) {
    const list = examplesByGrammar.get(example.grammar_point_id) ?? []
    list.push(example)
    examplesByGrammar.set(example.grammar_point_id, list)
  }

  return {
    id: lessonRow.id,
    lessonNo: lessonRow.lesson_no,
    titleZh: lessonRow.title_zh,
    titleVi: lessonRow.title_vi,
    status: lessonRow.status,
    dialogues: dialogueRows.map((d) => ({
      id: d.id,
      order: d.order,
      titleZh: d.title_zh,
      titleVi: d.title_vi,
      audioCode: d.audio_code,
      audioUrl: d.audio_url,
      lines: (linesByDialogue.get(d.id) ?? []).map((l) => ({
        id: l.id,
        order: l.order,
        speakerZh: l.speaker_zh,
        speakerPinyin: l.speaker_pinyin,
        textZh: l.text_zh,
        pinyin: l.pinyin,
        translationVi: l.translation_vi,
      })),
    })),
    vocabulary: vocabRows.map((v) => ({
      id: v.id,
      order: v.order,
      wordZh: v.word_zh,
      pinyin: v.pinyin,
      meaningVi: v.meaning_vi,
      audioUrl: v.audio_url,
    })),
    grammarPoints: grammarRows.map((g) => ({
      id: g.id,
      order: g.order,
      titleZh: g.title_zh,
      titleVi: g.title_vi,
      structureNote: g.structure_note,
      examples: (examplesByGrammar.get(g.id) ?? []).map((e) => ({
        id: e.id,
        order: e.order,
        textZh: e.text_zh,
        pinyin: e.pinyin,
        translationVi: e.translation_vi,
      })),
    })),
  }
}
