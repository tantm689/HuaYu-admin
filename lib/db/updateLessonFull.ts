import { createServerSupabase } from '@/lib/supabase/server'
import { LessonFullUpdateSchema, type LessonFullUpdate } from '@/lib/db/lessonFull'

export class LessonNotEditableError extends Error {}

// Applies admin edits made after import directly onto the live tables.
// Existing rows (id present) are UPDATEd in place so columns the editor
// never shows - audio_url on dialogues/vocabulary - are left untouched.
// Rows with no id are newly added in the editor and get INSERTed; rows that
// existed before the edit but are missing from the payload were deleted in
// the editor and get DELETEd (cascading to their own children).
export async function updateLessonFull(lessonId: string, rawPayload: unknown): Promise<void> {
  const payload: LessonFullUpdate = LessonFullUpdateSchema.parse(rawPayload)
  const supabase = createServerSupabase()

  const { data: currentLesson, error: fetchError } = await supabase
    .from('lessons')
    .select('status')
    .eq('id', lessonId)
    .single()
  if (fetchError || !currentLesson) throw new Error(fetchError?.message ?? 'lesson not found')
  if (currentLesson.status !== 'draft') {
    throw new LessonNotEditableError('Bài học phải ở trạng thái Nháp mới được sửa. Hãy "Chuyển về nháp" trước.')
  }

  const { error: lessonError } = await supabase
    .from('lessons')
    .update({ title_zh: payload.titleZh, title_vi: payload.titleVi, theme: payload.theme, objectives: payload.objectives })
    .eq('id', lessonId)
  if (lessonError) throw new Error(lessonError.message)

  await syncDialogues(supabase, lessonId, payload.dialogues)
  await syncGrammarPoints(supabase, lessonId, payload.grammarPoints)
}

type Supabase = ReturnType<typeof createServerSupabase>

async function syncDialogues(supabase: Supabase, lessonId: string, dialogues: LessonFullUpdate['dialogues']) {
  const { data: existingRows } = await supabase.from('dialogues').select('id').eq('lesson_id', lessonId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(dialogues.filter((d) => d.id).map((d) => d.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.storage.from('audio').remove(toDelete.map((id) => `dialogues/${id}.mp3`))
    await supabase.from('dialogues').delete().in('id', toDelete)
  }

  for (const dialogue of dialogues) {
    let dialogueId = dialogue.id
    if (dialogueId) {
      const { error } = await supabase
        .from('dialogues')
        .update({
          order: dialogue.order,
          kind: dialogue.kind,
          audio_code: dialogue.audioCode,
        })
        .eq('id', dialogueId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await supabase
        .from('dialogues')
        .insert({
          lesson_id: lessonId,
          order: dialogue.order,
          kind: dialogue.kind,
          audio_code: dialogue.audioCode,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'failed to insert dialogue')
      dialogueId = data.id
    }

    await syncDialogueLines(supabase, dialogueId!, dialogue.lines)
    await syncVocabulary(supabase, dialogueId!, dialogue.vocabulary)
  }
}

async function syncDialogueLines(
  supabase: Supabase,
  dialogueId: string,
  lines: LessonFullUpdate['dialogues'][number]['lines']
) {
  const { data: existingRows } = await supabase.from('dialogue_lines').select('id').eq('dialogue_id', dialogueId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('dialogue_lines').delete().in('id', toDelete)
  }

  for (const line of lines) {
    const row = {
      dialogue_id: dialogueId,
      order: line.order,
      speaker_zh: line.speakerZh,
      speaker_pinyin: line.speakerPinyin,
      text_zh: line.textZh,
      pinyin: line.pinyin,
      translation_vi: line.translationVi,
    }
    if (line.id) {
      const { error } = await supabase.from('dialogue_lines').update(row).eq('id', line.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('dialogue_lines').insert(row)
      if (error) throw new Error(error.message)
    }
  }
}

async function syncVocabulary(
  supabase: Supabase,
  dialogueId: string,
  vocabulary: LessonFullUpdate['dialogues'][number]['vocabulary']
) {
  const { data: existingRows } = await supabase.from('vocabulary').select('id').eq('dialogue_id', dialogueId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(vocabulary.filter((v) => v.id).map((v) => v.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.storage.from('audio').remove(toDelete.map((id) => `vocab/${id}.mp3`))
    await supabase.from('vocabulary').delete().in('id', toDelete)
  }

  for (const vocab of vocabulary) {
    if (vocab.id) {
      const { error } = await supabase
        .from('vocabulary')
        .update({ order: vocab.order, word_zh: vocab.wordZh, pinyin: vocab.pinyin, meaning_vi: vocab.meaningVi })
        .eq('id', vocab.id)
      if (error) throw new Error(error.message)
      continue
    }

    const { error } = await supabase.from('vocabulary').insert({
      dialogue_id: dialogueId,
      order: vocab.order,
      word_zh: vocab.wordZh,
      pinyin: vocab.pinyin,
      meaning_vi: vocab.meaningVi,
    })
    if (error) throw new Error(error.message)
  }
}

async function syncGrammarPoints(
  supabase: Supabase,
  lessonId: string,
  grammarPoints: LessonFullUpdate['grammarPoints']
) {
  const { data: existingRows } = await supabase.from('grammar_points').select('id').eq('lesson_id', lessonId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(grammarPoints.filter((g) => g.id).map((g) => g.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('grammar_points').delete().in('id', toDelete)
  }

  for (const gp of grammarPoints) {
    let gpId = gp.id
    if (gpId) {
      const { error } = await supabase
        .from('grammar_points')
        .update({ order: gp.order, title_vi: gp.titleVi })
        .eq('id', gpId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await supabase
        .from('grammar_points')
        .insert({
          lesson_id: lessonId,
          order: gp.order,
          title_vi: gp.titleVi,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'failed to insert grammar point')
      gpId = data.id
    }

    await syncGrammarSections(supabase, 'grammar_point_id', gpId!, gp.sections)
    await syncGrammarSubPoints(supabase, gpId!, gp.subPoints)
  }
}

async function syncGrammarSubPoints(
  supabase: Supabase,
  grammarPointId: string,
  subPoints: LessonFullUpdate['grammarPoints'][number]['subPoints']
) {
  const { data: existingRows } = await supabase
    .from('grammar_sub_points')
    .select('id')
    .eq('grammar_point_id', grammarPointId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(subPoints.filter((sp) => sp.id).map((sp) => sp.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('grammar_sub_points').delete().in('id', toDelete)
  }

  for (const sp of subPoints) {
    let spId = sp.id
    if (spId) {
      const { error } = await supabase
        .from('grammar_sub_points')
        .update({
          order: sp.order,
          label: sp.label,
          title_vi: sp.titleVi,
        })
        .eq('id', spId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await supabase
        .from('grammar_sub_points')
        .insert({
          grammar_point_id: grammarPointId,
          order: sp.order,
          label: sp.label,
          title_vi: sp.titleVi,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'failed to insert grammar sub-point')
      spId = data.id
    }

    await syncGrammarSections(supabase, 'grammar_sub_point_id', spId!, sp.sections)
  }
}

async function syncGrammarSections(
  supabase: Supabase,
  parentColumn: 'grammar_point_id' | 'grammar_sub_point_id' | 'parent_section_id',
  parentId: string,
  sections: LessonFullUpdate['grammarPoints'][number]['sections']
) {
  const { data: existingRows } = await supabase.from('grammar_sections').select('id').eq(parentColumn, parentId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(sections.filter((s) => s.id).map((s) => s.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('grammar_sections').delete().in('id', toDelete)
  }

  for (const section of sections) {
    let sectionId = section.id
    if (sectionId) {
      const { error } = await supabase
        .from('grammar_sections')
        .update({ order: section.order, label: section.label, content: section.content })
        .eq('id', sectionId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await supabase
        .from('grammar_sections')
        .insert({
          [parentColumn]: parentId,
          order: section.order,
          label: section.label,
          content: section.content,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'failed to insert grammar section')
      sectionId = data.id
    }

    await syncGrammarExamples(supabase, sectionId!, section.examples)

    const items = 'items' in section ? section.items : []
    if (items.length > 0) {
      await syncGrammarSections(
        supabase,
        'parent_section_id',
        sectionId!,
        items.map((item) => ({ ...item, items: [] }))
      )
    } else {
      // An existing section that just had its last item removed in the
      // editor still has stale child rows in the DB (the top-level
      // existingIds/toDelete diff above only covers this section's own
      // level, not its items) - clear them explicitly.
      await supabase.from('grammar_sections').delete().eq('parent_section_id', sectionId!)
    }
  }
}

async function syncGrammarExamples(
  supabase: Supabase,
  grammarSectionId: string,
  examples: LessonFullUpdate['grammarPoints'][number]['sections'][number]['examples']
) {
  const { data: existingRows } = await supabase
    .from('grammar_examples')
    .select('id')
    .eq('grammar_section_id', grammarSectionId)
  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id))
  const keptIds = new Set(examples.filter((e) => e.id).map((e) => e.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('grammar_examples').delete().in('id', toDelete)
  }

  for (const example of examples) {
    const row = {
      grammar_section_id: grammarSectionId,
      order: example.order,
      text_zh: example.textZh,
      pinyin: example.pinyin,
      translation_vi: example.translationVi,
    }
    if (example.id) {
      const { error } = await supabase.from('grammar_examples').update(row).eq('id', example.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('grammar_examples').insert(row)
      if (error) throw new Error(error.message)
    }
  }
}
