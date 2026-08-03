import { createServerSupabase } from '@/lib/supabase/server'
import type { Dialogue, DialogueLine, Lesson, VocabularyEntry } from '@/lib/db/types'

export interface LessonFullView {
  id: string
  bookId: string
  lessonNo: number
  titleZh: string
  titleVi: string
  theme: string | null
  objectives: string[]
  status: Lesson['status']
  grammarMarkdown: string | null
  dialogues: {
    id: string
    order: number
    kind: Dialogue['kind']
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
      audioUrl: string | null
      startTime: number | null
      endTime: number | null
    }[]
    vocabulary: {
      id: string
      order: number
      wordZh: string
      pinyin: string | null
      meaningVi: string | null
      audioUrl: string | null
    }[]
  }[]
}

export async function getLessonFull(lessonId: string): Promise<LessonFullView | null> {
  const supabase = createServerSupabase()

  const { data: lesson } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
  if (!lesson) return null
  const lessonRow = lesson as Lesson

  const { data: dialogues } = await supabase
    .from('dialogues')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order', { ascending: true })

  const dialogueRows = (dialogues ?? []) as Dialogue[]
  const dialogueIds = dialogueRows.map((d) => d.id)

  const [{ data: dialogueLines }, { data: vocabulary }] = await Promise.all([
    dialogueIds.length > 0
      ? supabase.from('dialogue_lines').select('*').in('dialogue_id', dialogueIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as DialogueLine[] }),
    dialogueIds.length > 0
      ? supabase.from('vocabulary').select('*').in('dialogue_id', dialogueIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as VocabularyEntry[] }),
  ])

  const vocabRows = (vocabulary ?? []) as VocabularyEntry[]

  const linesByDialogue = new Map<string, DialogueLine[]>()
  for (const line of (dialogueLines ?? []) as DialogueLine[]) {
    const list = linesByDialogue.get(line.dialogue_id) ?? []
    list.push(line)
    linesByDialogue.set(line.dialogue_id, list)
  }

  const vocabByDialogue = new Map<string, VocabularyEntry[]>()
  for (const vocab of vocabRows) {
    const list = vocabByDialogue.get(vocab.dialogue_id) ?? []
    list.push(vocab)
    vocabByDialogue.set(vocab.dialogue_id, list)
  }

  return {
    id: lessonRow.id,
    bookId: lessonRow.book_id,
    lessonNo: lessonRow.lesson_no,
    titleZh: lessonRow.title_zh,
    titleVi: lessonRow.title_vi,
    theme: lessonRow.theme,
    objectives: lessonRow.objectives,
    status: lessonRow.status,
    grammarMarkdown: lessonRow.grammar_markdown,
    dialogues: dialogueRows.map((d) => ({
      id: d.id,
      order: d.order,
      kind: d.kind,
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
        audioUrl: l.audio_url,
        startTime: l.start_time,
        endTime: l.end_time,
      })),
      vocabulary: (vocabByDialogue.get(d.id) ?? []).map((v) => ({
        id: v.id,
        order: v.order,
        wordZh: v.word_zh,
        pinyin: v.pinyin,
        meaningVi: v.meaning_vi,
        audioUrl: v.audio_url,
      })),
    })),
  }
}
