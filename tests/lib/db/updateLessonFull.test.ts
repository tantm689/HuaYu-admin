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
}))

// Existing rows in the fake DB, keyed by table, used to answer the
// "which ids already exist" select() the sync functions issue before diffing.
const existing = {
  dialogues: [{ id: 'dlg-1' }],
  dialogue_lines: [{ id: 'line-1' }],
  vocabulary: [{ id: 'vocab-1' }],
}

let lessonStatus: string = 'draft'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      update: (row: any) => ({
        eq: () => {
          if (table === 'lessons') lessonUpdateMock(row)
          if (table === 'dialogues') dialogueUpdateMock(row)
          if (table === 'dialogue_lines') lineUpdateMock(row)
          if (table === 'vocabulary') vocabUpdateMock(row)
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
        return Promise.resolve({ error: null })
      },
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          if (table === 'dialogues') dialogueDeleteMock(ids)
          if (table === 'dialogue_lines') lineDeleteMock(ids)
          if (table === 'vocabulary') vocabDeleteMock(ids)
          return Promise.resolve({ error: null })
        },
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
  })

  it('rejects edits when the lesson is not in draft status', async () => {
    lessonStatus = 'published'
    await expect(
      updateLessonFull('lesson-1', {
        titleZh: 'A', titleVi: 'B', dialogues: [], grammarMarkdown: '',
      })
    ).rejects.toThrow(LessonNotEditableError)
    expect(lessonUpdateMock).not.toHaveBeenCalled()
  })

  it('updates lesson meta fields', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A2', titleVi: 'B2', dialogues: [], grammarMarkdown: '',
    })
    expect(lessonUpdateMock).toHaveBeenCalledWith({
      title_zh: 'A2', title_vi: 'B2', theme: null, objectives: [], grammar_markdown: '',
    })
  })

  it('includes grammar_markdown in the lessons update call', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], grammarMarkdown: 'some markdown',
    })
    expect(lessonUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title_zh: 'A', title_vi: 'B', theme: null, objectives: [], grammar_markdown: 'some markdown',
      })
    )
  })

  it('updates an existing dialogue and its lines in place, never touching audio_url', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, kind: 'passage', audioCode: '01-1',
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'hi', pinyin: null, translationVi: null }],
      }],
      grammarMarkdown: '',
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
      grammarMarkdown: '',
    })
    expect(dialogueInsertMock).toHaveBeenCalledWith(expect.objectContaining({ order: 2, kind: 'dialogue' }))
    expect(lineInsertMock).toHaveBeenCalledWith(expect.objectContaining({ dialogue_id: 'dlg-new', text_zh: 'new line' }))
  })

  it('deletes a dialogue missing from the payload and removes its audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], grammarMarkdown: '',
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['dialogues/dlg-1.mp3'])
    expect(dialogueDeleteMock).toHaveBeenCalledWith(['dlg-1'])
  })

  it('deletes a dialogue line missing from the payload and removes its trimmed audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{ id: 'dlg-1', order: 1, audioCode: null, lines: [], vocabulary: [] }],
      grammarMarkdown: '',
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
      grammarMarkdown: '',
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
      grammarMarkdown: '',
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
      grammarMarkdown: '',
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['vocab/vocab-1.mp3'])
    expect(vocabDeleteMock).toHaveBeenCalledWith(['vocab-1'])
  })

})
