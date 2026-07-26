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
}))

vi.mock('@/lib/tts/edgeTts', () => ({ generateVocabAudio: generateVocabAudioMock }))

// Existing rows in the fake DB, keyed by table, used to answer the
// "which ids already exist" select() the sync functions issue before diffing.
const existing = {
  dialogues: [{ id: 'dlg-1' }],
  dialogue_lines: [{ id: 'line-1' }],
  vocabulary: [{ id: 'vocab-1' }],
  grammar_points: [] as { id: string }[],
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
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-new' }, error: null }) }) }
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
    expect(lessonUpdateMock).toHaveBeenCalledWith({ title_zh: 'A2', title_vi: 'B2' })
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
})
