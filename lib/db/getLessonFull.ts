import { createServerSupabase } from '@/lib/supabase/server'
import type {
  Dialogue,
  DialogueLine,
  GrammarExample,
  GrammarPoint,
  GrammarSection,
  GrammarSubPoint,
  Lesson,
  VocabularyEntry,
} from '@/lib/db/types'

interface ExampleView {
  id: string
  order: number
  textZh: string
  pinyin: string | null
  translationVi: string | null
}

interface SectionItemView {
  id: string
  order: number
  label: string
  content: string | null
  examples: ExampleView[]
}

interface SectionView extends SectionItemView {
  items: SectionItemView[]
}

export interface LessonFullView {
  id: string
  bookId: string
  lessonNo: number
  titleZh: string
  titleVi: string
  theme: string | null
  objectives: string[]
  status: Lesson['status']
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
  grammarPoints: {
    id: string
    order: number
    titleVi: string | null
    sections: SectionView[]
    subPoints: {
      id: string
      order: number
      label: string
      titleVi: string | null
      sections: SectionView[]
    }[]
  }[]
}

export async function getLessonFull(lessonId: string): Promise<LessonFullView | null> {
  const supabase = createServerSupabase()

  const { data: lesson } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
  if (!lesson) return null
  const lessonRow = lesson as Lesson

  const [{ data: dialogues }, { data: grammarPoints }] = await Promise.all([
    supabase.from('dialogues').select('*').eq('lesson_id', lessonId).order('order', { ascending: true }),
    supabase.from('grammar_points').select('*').eq('lesson_id', lessonId).order('order', { ascending: true }),
  ])

  const dialogueRows = (dialogues ?? []) as Dialogue[]
  const grammarRows = (grammarPoints ?? []) as GrammarPoint[]

  const dialogueIds = dialogueRows.map((d) => d.id)
  const grammarIds = grammarRows.map((g) => g.id)

  const [{ data: dialogueLines }, { data: vocabulary }, { data: grammarSubPoints }] = await Promise.all([
    dialogueIds.length > 0
      ? supabase.from('dialogue_lines').select('*').in('dialogue_id', dialogueIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as DialogueLine[] }),
    dialogueIds.length > 0
      ? supabase.from('vocabulary').select('*').in('dialogue_id', dialogueIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as VocabularyEntry[] }),
    grammarIds.length > 0
      ? supabase.from('grammar_sub_points').select('*').in('grammar_point_id', grammarIds).order('order', { ascending: true })
      : Promise.resolve({ data: [] as GrammarSubPoint[] }),
  ])

  const vocabRows = (vocabulary ?? []) as VocabularyEntry[]

  const subPointRows = (grammarSubPoints ?? []) as GrammarSubPoint[]
  const subPointIds = subPointRows.map((sp) => sp.id)

  const { data: topLevelSections } =
    grammarIds.length > 0 || subPointIds.length > 0
      ? await supabase
          .from('grammar_sections')
          .select('*')
          .or(
            [
              grammarIds.length > 0 ? `grammar_point_id.in.(${grammarIds.join(',')})` : null,
              subPointIds.length > 0 ? `grammar_sub_point_id.in.(${subPointIds.join(',')})` : null,
            ]
              .filter(Boolean)
              .join(',')
          )
          .order('order', { ascending: true })
      : { data: [] as GrammarSection[] }

  const topLevelSectionRows = (topLevelSections ?? []) as GrammarSection[]
  const topLevelSectionIds = topLevelSectionRows.map((s) => s.id)

  const { data: sectionItems } =
    topLevelSectionIds.length > 0
      ? await supabase
          .from('grammar_sections')
          .select('*')
          .in('parent_section_id', topLevelSectionIds)
          .order('order', { ascending: true })
      : { data: [] as GrammarSection[] }

  const sectionRows = [...topLevelSectionRows, ...((sectionItems ?? []) as GrammarSection[])]
  const sectionIds = sectionRows.map((s) => s.id)

  const { data: grammarExamples } =
    sectionIds.length > 0
      ? await supabase
          .from('grammar_examples')
          .select('*')
          .in('grammar_section_id', sectionIds)
          .order('order', { ascending: true })
      : { data: [] as GrammarExample[] }

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

  const examplesBySection = new Map<string, GrammarExample[]>()
  for (const example of (grammarExamples ?? []) as GrammarExample[]) {
    const list = examplesBySection.get(example.grammar_section_id) ?? []
    list.push(example)
    examplesBySection.set(example.grammar_section_id, list)
  }

  const sectionsByGrammar = new Map<string, GrammarSection[]>()
  const sectionsBySubPoint = new Map<string, GrammarSection[]>()
  for (const section of topLevelSectionRows) {
    if (section.grammar_point_id) {
      const list = sectionsByGrammar.get(section.grammar_point_id) ?? []
      list.push(section)
      sectionsByGrammar.set(section.grammar_point_id, list)
    } else if (section.grammar_sub_point_id) {
      const list = sectionsBySubPoint.get(section.grammar_sub_point_id) ?? []
      list.push(section)
      sectionsBySubPoint.set(section.grammar_sub_point_id, list)
    }
  }

  const itemsBySection = new Map<string, GrammarSection[]>()
  for (const item of (sectionItems ?? []) as GrammarSection[]) {
    if (!item.parent_section_id) continue
    const list = itemsBySection.get(item.parent_section_id) ?? []
    list.push(item)
    itemsBySection.set(item.parent_section_id, list)
  }

  const subPointsByGrammar = new Map<string, GrammarSubPoint[]>()
  for (const sp of subPointRows) {
    const list = subPointsByGrammar.get(sp.grammar_point_id) ?? []
    list.push(sp)
    subPointsByGrammar.set(sp.grammar_point_id, list)
  }

  function toExampleView(e: GrammarExample): ExampleView {
    return {
      id: e.id,
      order: e.order,
      textZh: e.text_zh,
      pinyin: e.pinyin,
      translationVi: e.translation_vi,
    }
  }

  function toSectionItemView(s: GrammarSection): SectionItemView {
    return {
      id: s.id,
      order: s.order,
      label: s.label,
      content: s.content,
      examples: (examplesBySection.get(s.id) ?? []).map(toExampleView),
    }
  }

  function toSectionView(s: GrammarSection): SectionView {
    return {
      ...toSectionItemView(s),
      items: (itemsBySection.get(s.id) ?? []).map(toSectionItemView),
    }
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
    grammarPoints: grammarRows.map((g) => ({
      id: g.id,
      order: g.order,
      titleVi: g.title_vi,
      sections: (sectionsByGrammar.get(g.id) ?? []).map(toSectionView),
      subPoints: (subPointsByGrammar.get(g.id) ?? []).map((sp) => ({
        id: sp.id,
        order: sp.order,
        label: sp.label,
        titleVi: sp.title_vi,
        sections: (sectionsBySubPoint.get(sp.id) ?? []).map(toSectionView),
      })),
    })),
  }
}
