import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  lessonUpdateMock,
  dialogueUpdateMock,
  dialogueInsertMock,
  dialogueDeleteMock,
  lineUpdateMock,
  lineInsertMock,
  lineDeleteMock,
  vocabUpdateMock,
  vocabInsertMock,
  vocabDeleteMock,
  storageRemoveMock,
  gpUpdateMock,
  gpInsertMock,
  gpDeleteMock,
  spUpdateMock,
  spInsertMock,
  spDeleteMock,
  sectionUpsertMock,
  sectionDeleteMock,
  gpExampleUpsertMock,
  gpExampleDeleteMock,
} = vi.hoisted(() => ({
  lessonUpdateMock: vi.fn(),
  dialogueUpdateMock: vi.fn(),
  dialogueInsertMock: vi.fn(),
  dialogueDeleteMock: vi.fn(),
  lineUpdateMock: vi.fn(),
  lineInsertMock: vi.fn(),
  lineDeleteMock: vi.fn(),
  vocabUpdateMock: vi.fn(),
  vocabInsertMock: vi.fn(),
  vocabDeleteMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  gpUpdateMock: vi.fn(),
  gpInsertMock: vi.fn(),
  gpDeleteMock: vi.fn(),
  spUpdateMock: vi.fn(),
  spInsertMock: vi.fn(),
  spDeleteMock: vi.fn(),
  sectionUpsertMock: vi.fn(),
  sectionDeleteMock: vi.fn(),
  gpExampleUpsertMock: vi.fn(),
  gpExampleDeleteMock: vi.fn(),
}))

// Existing rows in the fake DB, keyed by table, used to answer the
// "which ids already exist" select() the sync functions issue before diffing.
const existing = {
  dialogues: [{ id: 'dlg-1' }],
  dialogue_lines: [{ id: 'line-1' }],
  vocabulary: [{ id: 'vocab-1' }],
  grammar_points: [] as { id: string }[],
  grammar_sub_points: [] as { id: string }[],
  grammar_sections: [] as { id: string }[],
  grammar_examples: [] as { id: string }[],
}

let lessonStatus: string = 'draft'
let sectionInsertCounter = 0

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      update: (row: any) => ({
        eq: () => {
          if (table === 'lessons') lessonUpdateMock(row)
          if (table === 'dialogues') dialogueUpdateMock(row)
          if (table === 'dialogue_lines') lineUpdateMock(row)
          if (table === 'vocabulary') vocabUpdateMock(row)
          if (table === 'grammar_points') gpUpdateMock(row)
          if (table === 'grammar_sub_points') spUpdateMock(row)
          if (table === 'grammar_sections') sectionUpsertMock(row)
          if (table === 'grammar_examples') gpExampleUpsertMock(row)
          return Promise.resolve({ error: null })
        },
      }),
      insert: (row: any) => {
        if (table === 'dialogues') {
          dialogueInsertMock(row)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'dlg-new' }, error: null }) }) }
        }
        if (table === 'dialogue_lines') {
          lineInsertMock(row)
          return Promise.resolve({ error: null })
        }
        if (table === 'vocabulary') {
          vocabInsertMock(row)
          return Promise.resolve({ error: null })
        }
        if (table === 'grammar_points') {
          gpInsertMock(row)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-new' }, error: null }) }) }
        }
        if (table === 'grammar_sub_points') {
          spInsertMock(row)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'sp-new' }, error: null }) }) }
        }
        if (table === 'grammar_sections') {
          sectionUpsertMock(row)
          sectionInsertCounter += 1
          const id = `sec-new-${sectionInsertCounter}`
          return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) }
        }
        if (table === 'grammar_examples') {
          gpExampleUpsertMock(row)
          return Promise.resolve({ error: null })
        }
        return Promise.resolve({ error: null })
      },
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          if (table === 'dialogues') dialogueDeleteMock(ids)
          if (table === 'dialogue_lines') lineDeleteMock(ids)
          if (table === 'vocabulary') vocabDeleteMock(ids)
          if (table === 'grammar_points') gpDeleteMock(ids)
          if (table === 'grammar_sub_points') spDeleteMock(ids)
          if (table === 'grammar_sections') sectionDeleteMock(ids)
          if (table === 'grammar_examples') gpExampleDeleteMock(ids)
          return Promise.resolve({ error: null })
        },
        // syncGrammarSections clears a section's stale item rows via
        // .delete().eq('parent_section_id', sectionId) when it has no items
        // in the payload (not an .in() id-list diff like the other tables).
        eq: () => Promise.resolve({ error: null }),
      }),
      select: () => ({
        eq: () => {
          // Real usage forks here: lessons.select('status').eq(...).single()
          // awaits the .single() call, while the child-table lookups
          // (dialogues/vocabulary/etc.) await the eq() result directly. This
          // fake needs to satisfy both call shapes.
          const promise: any = Promise.resolve({ data: (existing as any)[table] ?? [] })
          promise.single = () => Promise.resolve({ data: { status: lessonStatus }, error: null })
          return promise
        },
        in: () => Promise.resolve({ data: (existing as any)[table] ?? [] }),
      }),
    }),
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          storageRemoveMock(paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }),
}))

import { updateLessonFull, LessonNotEditableError } from '@/lib/db/updateLessonFull'

describe('updateLessonFull', () => {
  beforeEach(() => {
    lessonStatus = 'draft'
    sectionInsertCounter = 0
    lessonUpdateMock.mockClear()
    dialogueUpdateMock.mockClear()
    dialogueInsertMock.mockClear()
    dialogueDeleteMock.mockClear()
    lineUpdateMock.mockClear()
    lineInsertMock.mockClear()
    lineDeleteMock.mockClear()
    vocabUpdateMock.mockClear()
    vocabInsertMock.mockClear()
    vocabDeleteMock.mockClear()
    storageRemoveMock.mockClear()
    gpUpdateMock.mockClear()
    gpInsertMock.mockClear()
    gpDeleteMock.mockClear()
    spUpdateMock.mockClear()
    spInsertMock.mockClear()
    spDeleteMock.mockClear()
    sectionUpsertMock.mockClear()
    sectionDeleteMock.mockClear()
    gpExampleUpsertMock.mockClear()
    gpExampleDeleteMock.mockClear()
    existing.grammar_points = []
    existing.grammar_sub_points = []
    existing.grammar_sections = []
  })

  it('rejects edits when the lesson is not in draft status', async () => {
    lessonStatus = 'published'
    await expect(
      updateLessonFull('lesson-1', {
        titleZh: 'A', titleVi: 'B', dialogues: [], grammarPoints: [],
      })
    ).rejects.toThrow(LessonNotEditableError)
    expect(lessonUpdateMock).not.toHaveBeenCalled()
  })

  it('updates lesson meta fields', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A2', titleVi: 'B2', dialogues: [], grammarPoints: [],
    })
    expect(lessonUpdateMock).toHaveBeenCalledWith({ title_zh: 'A2', title_vi: 'B2', theme: null, objectives: [] })
  })

  it('updates an existing dialogue and its lines in place, never touching audio_url', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, kind: 'passage', audioCode: '01-1',
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'hi', pinyin: null, translationVi: null }],
      }],
      grammarPoints: [],
    })
    expect(dialogueUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ audio_code: '01-1', kind: 'passage' })
    )
    expect(dialogueUpdateMock.mock.calls[0][0]).not.toHaveProperty('audio_url')
    expect(lineUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ text_zh: 'hi' }))
    expect(dialogueDeleteMock).not.toHaveBeenCalled()
  })

  it('inserts a new dialogue (no id) and its lines', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [
        { id: 'dlg-1', order: 1, audioCode: null, lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }] },
        { id: null, order: 2, audioCode: null, lines: [{ id: null, order: 1, speakerZh: null, speakerPinyin: null, textZh: 'new line', pinyin: null, translationVi: null }] },
      ],
      grammarPoints: [],
    })
    expect(dialogueInsertMock).toHaveBeenCalledWith(expect.objectContaining({ order: 2, kind: 'dialogue' }))
    expect(lineInsertMock).toHaveBeenCalledWith(expect.objectContaining({ dialogue_id: 'dlg-new', text_zh: 'new line' }))
  })

  it('deletes a dialogue missing from the payload and removes its audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], grammarPoints: [],
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['dialogues/dlg-1.mp3'])
    expect(dialogueDeleteMock).toHaveBeenCalledWith(['dlg-1'])
  })

  it('deletes a dialogue line missing from the payload and removes its trimmed audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{ id: 'dlg-1', order: 1, audioCode: null, lines: [], vocabulary: [] }],
      grammarPoints: [],
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['dialogue-lines/line-1.wav'])
    expect(lineDeleteMock).toHaveBeenCalledWith(['line-1'])
  })

  it('updates an existing vocab entry in place', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, audioCode: null,
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }],
        vocabulary: [{ id: 'vocab-1', order: 1, wordZh: '你好', pinyin: null, meaningVi: 'hi' }],
      }],
      grammarPoints: [],
    })
    expect(vocabUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ meaning_vi: 'hi' }))
  })

  it('inserts a new vocab entry under the dialogue_id', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, audioCode: null,
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }],
        vocabulary: [
          { id: 'vocab-1', order: 1, wordZh: '你好', pinyin: null, meaningVi: null },
          { id: null, order: 2, wordZh: '謝謝', pinyin: null, meaningVi: 'cảm ơn' },
        ],
      }],
      grammarPoints: [],
    })
    expect(vocabInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ dialogue_id: 'dlg-1', word_zh: '謝謝' })
    )
  })

  it('deletes a vocab entry missing from the payload (dialogue kept) and removes its audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, audioCode: null,
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }],
        vocabulary: [],
      }],
      grammarPoints: [],
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['vocab/vocab-1.mp3'])
    expect(vocabDeleteMock).toHaveBeenCalledWith(['vocab-1'])
  })

  it('inserts a new grammar point with a section and its example (no sub-points)', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [],
      grammarPoints: [{
        id: null, order: 1, titleVi: 'G1',
        sections: [{
          id: null, order: 1, label: 'Cấu trúc', content: 'note',
          examples: [{ id: null, order: 1, textZh: 'ex', pinyin: null, translationVi: null }],
        }],
        subPoints: [],
      }],
    })
    expect(gpInsertMock).toHaveBeenCalledWith(expect.objectContaining({ title_vi: 'G1' }))
    expect(sectionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-new', label: 'Cấu trúc', content: 'note' })
    )
    expect(gpExampleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_section_id: 'sec-new-1', text_zh: 'ex' })
    )
    expect(spInsertMock).not.toHaveBeenCalled()
  })

  it('inserts a new grammar sub-point and its section/example under grammar_sub_point_id', async () => {
    existing.grammar_points = [{ id: 'gp-1' }]
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [],
      grammarPoints: [{
        id: 'gp-1', order: 1, titleVi: 'G1', sections: [],
        subPoints: [{
          id: null, order: 1, label: 'A', titleVi: 'A1',
          sections: [{
            id: null, order: 1, label: 'Cấu trúc', content: 'sub note',
            examples: [{ id: null, order: 1, textZh: 'sub-ex', pinyin: null, translationVi: null }],
          }],
        }],
      }],
    })
    expect(gpUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ title_vi: 'G1' }))
    expect(spInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-1', label: 'A' })
    )
    expect(sectionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_sub_point_id: 'sp-new', content: 'sub note' })
    )
    expect(gpExampleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_section_id: 'sec-new-1', text_zh: 'sub-ex' })
    )
  })

  it('deletes grammar points and sub-points missing from the payload', async () => {
    existing.grammar_points = [{ id: 'gp-old' }]
    existing.grammar_sub_points = [{ id: 'sp-old' }]
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], grammarPoints: [],
    })
    expect(gpDeleteMock).toHaveBeenCalledWith(['gp-old'])
  })
})
