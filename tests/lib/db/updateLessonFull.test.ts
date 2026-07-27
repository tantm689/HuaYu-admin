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
  generateVocabAudioMock,
  storageUploadMock,
  storageRemoveMock,
  gpUpdateMock,
  gpInsertMock,
  gpDeleteMock,
  spUpdateMock,
  spInsertMock,
  spDeleteMock,
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
  generateVocabAudioMock: vi.fn().mockResolvedValue(new Uint8Array([1])),
  storageUploadMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  gpUpdateMock: vi.fn(),
  gpInsertMock: vi.fn(),
  gpDeleteMock: vi.fn(),
  spUpdateMock: vi.fn(),
  spInsertMock: vi.fn(),
  spDeleteMock: vi.fn(),
  gpExampleUpsertMock: vi.fn(),
  gpExampleDeleteMock: vi.fn(),
}))

vi.mock('@/lib/tts/edgeTts', () => ({ generateVocabAudio: generateVocabAudioMock }))

// Existing rows in the fake DB, keyed by table, used to answer the
// "which ids already exist" select() the sync functions issue before diffing.
const existing = {
  dialogues: [{ id: 'dlg-1' }],
  dialogue_lines: [{ id: 'line-1' }],
  vocabulary: [{ id: 'vocab-1' }],
  grammar_points: [] as { id: string }[],
  grammar_sub_points: [] as { id: string }[],
  grammar_examples: [] as { id: string }[],
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
          if (table === 'grammar_points') gpUpdateMock(row)
          if (table === 'grammar_sub_points') spUpdateMock(row)
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
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'vocab-new' }, error: null }) }) }
        }
        if (table === 'grammar_points') {
          gpInsertMock(row)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-new' }, error: null }) }) }
        }
        if (table === 'grammar_sub_points') {
          spInsertMock(row)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'sp-new' }, error: null }) }) }
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
          if (table === 'grammar_examples') gpExampleDeleteMock(ids)
          return Promise.resolve({ error: null })
        },
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
        upload: (path: string, body: unknown, options: unknown) => {
          storageUploadMock(path, options)
          return Promise.resolve({ data: { path }, error: null })
        },
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/f.mp3' } }),
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
    generateVocabAudioMock.mockClear()
    storageUploadMock.mockClear()
    storageRemoveMock.mockClear()
    gpUpdateMock.mockClear()
    gpInsertMock.mockClear()
    gpDeleteMock.mockClear()
    spUpdateMock.mockClear()
    spInsertMock.mockClear()
    spDeleteMock.mockClear()
    gpExampleUpsertMock.mockClear()
    gpExampleDeleteMock.mockClear()
    existing.grammar_points = []
    existing.grammar_sub_points = []
  })

  it('rejects edits when the lesson is not in draft status', async () => {
    lessonStatus = 'published'
    await expect(
      updateLessonFull('lesson-1', {
        titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [], grammarPoints: [],
      })
    ).rejects.toThrow(LessonNotEditableError)
    expect(lessonUpdateMock).not.toHaveBeenCalled()
  })

  it('updates lesson meta fields', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A2', titleVi: 'B2', dialogues: [], vocabulary: [], grammarPoints: [],
    })
    expect(lessonUpdateMock).toHaveBeenCalledWith({ title_zh: 'A2', title_vi: 'B2', theme: null, objectives: [] })
  })

  it('updates an existing dialogue and its lines in place, never touching audio_url', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [{
        id: 'dlg-1', order: 1, titleZh: 'Z', titleVi: null, audioCode: '01-1',
        lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'hi', pinyin: null, translationVi: null }],
      }],
      vocabulary: [], grammarPoints: [],
    })
    expect(dialogueUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ title_zh: 'Z', audio_code: '01-1' })
    )
    expect(dialogueUpdateMock.mock.calls[0][0]).not.toHaveProperty('audio_url')
    expect(lineUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ text_zh: 'hi' }))
    expect(dialogueDeleteMock).not.toHaveBeenCalled()
  })

  it('inserts a new dialogue (no id) and its lines', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B',
      dialogues: [
        { id: 'dlg-1', order: 1, titleZh: null, titleVi: null, audioCode: null, lines: [{ id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }] },
        { id: null, order: 2, titleZh: 'New', titleVi: null, audioCode: null, lines: [{ id: null, order: 1, speakerZh: null, speakerPinyin: null, textZh: 'new line', pinyin: null, translationVi: null }] },
      ],
      vocabulary: [], grammarPoints: [],
    })
    expect(dialogueInsertMock).toHaveBeenCalledWith(expect.objectContaining({ title_zh: 'New' }))
    expect(lineInsertMock).toHaveBeenCalledWith(expect.objectContaining({ dialogue_id: 'dlg-new', text_zh: 'new line' }))
  })

  it('deletes a dialogue missing from the payload and removes its audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [], grammarPoints: [],
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['dialogues/dlg-1.mp3'])
    expect(dialogueDeleteMock).toHaveBeenCalledWith(['dlg-1'])
  })

  it('updates an existing vocab entry without regenerating audio', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [],
      vocabulary: [{ id: 'vocab-1', order: 1, wordZh: '你好', pinyin: null, meaningVi: 'hi' }],
      grammarPoints: [],
    })
    expect(vocabUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ meaning_vi: 'hi' }))
    expect(generateVocabAudioMock).not.toHaveBeenCalled()
  })

  it('inserts a new vocab entry and generates its audio', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [],
      vocabulary: [
        { id: 'vocab-1', order: 1, wordZh: '你好', pinyin: null, meaningVi: null },
        { id: null, order: 2, wordZh: '謝謝', pinyin: null, meaningVi: 'cảm ơn' },
      ],
      grammarPoints: [],
    })
    expect(vocabInsertMock).toHaveBeenCalledWith(expect.objectContaining({ word_zh: '謝謝' }))
    expect(generateVocabAudioMock).toHaveBeenCalledWith('謝謝')
    expect(storageUploadMock).toHaveBeenCalledWith('vocab/vocab-new.mp3', expect.objectContaining({ contentType: 'audio/mpeg' }))
  })

  it('deletes a vocab entry missing from the payload and removes its audio file', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [], grammarPoints: [],
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['vocab/vocab-1.mp3'])
    expect(vocabDeleteMock).toHaveBeenCalledWith(['vocab-1'])
  })

  it('inserts a new grammar point with a flat example (no sub-points)', async () => {
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [],
      grammarPoints: [{
        id: null, order: 1, titleZh: 'G1', titleVi: null, structureNote: 'note',
        examples: [{ id: null, order: 1, textZh: 'ex', pinyin: null, translationVi: null }],
        subPoints: [],
      }],
    })
    expect(gpInsertMock).toHaveBeenCalledWith(expect.objectContaining({ title_zh: 'G1', structure_note: 'note' }))
    expect(gpExampleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-new', text_zh: 'ex' })
    )
    expect(spInsertMock).not.toHaveBeenCalled()
  })

  it('inserts a new grammar sub-point and its example under grammar_sub_point_id', async () => {
    existing.grammar_points = [{ id: 'gp-1' }]
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [],
      grammarPoints: [{
        id: 'gp-1', order: 1, titleZh: 'G1', titleVi: null, structureNote: null, examples: [],
        subPoints: [{
          id: null, order: 1, label: 'A', titleZh: 'A1', titleVi: null, structureNote: 'sub note',
          examples: [{ id: null, order: 1, textZh: 'sub-ex', pinyin: null, translationVi: null }],
        }],
      }],
    })
    expect(gpUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ title_zh: 'G1' }))
    expect(spInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_point_id: 'gp-1', label: 'A', structure_note: 'sub note' })
    )
    expect(gpExampleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ grammar_sub_point_id: 'sp-new', text_zh: 'sub-ex' })
    )
  })

  it('deletes grammar points and sub-points missing from the payload', async () => {
    existing.grammar_points = [{ id: 'gp-old' }]
    existing.grammar_sub_points = [{ id: 'sp-old' }]
    await updateLessonFull('lesson-1', {
      titleZh: 'A', titleVi: 'B', dialogues: [], vocabulary: [], grammarPoints: [],
    })
    expect(gpDeleteMock).toHaveBeenCalledWith(['gp-old'])
  })
})
