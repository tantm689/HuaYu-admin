import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'lessons') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'lesson-1', lesson_no: 1, title_zh: 'A', title_vi: 'B',
                    theme: null, objectives: [], status: 'draft',
                    grammar_markdown: '## Ngữ pháp 1: Test\n\n**CHỨC NĂNG**\n\nNội dung.',
                  },
                  error: null,
                }),
            }),
          }),
        }
      }
      if (table === 'dialogues') {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [{ id: 'dlg-1', lesson_id: 'lesson-1', order: 1, kind: 'dialogue', audio_code: null, audio_url: null }],
                }),
            }),
          }),
        }
      }
      if (table === 'dialogue_lines') {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'line-1', dialogue_id: 'dlg-1', order: 1,
                      speaker_zh: null, speaker_pinyin: null, text_zh: 'Ni hao',
                      pinyin: null, translation_vi: null, audio_url: null,
                      start_time: 1.5, end_time: 3.25,
                    },
                    {
                      id: 'line-2', dialogue_id: 'dlg-1', order: 2,
                      speaker_zh: null, speaker_pinyin: null, text_zh: 'Zaijian',
                      pinyin: null, translation_vi: null, audio_url: null,
                      start_time: null, end_time: null,
                    },
                  ],
                }),
            }),
          }),
        }
      }
      if (table === 'vocabulary') {
        return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { getLessonFull } from '@/lib/db/getLessonFull'

describe('getLessonFull', () => {
  it('maps grammar_markdown to grammarMarkdown', async () => {
    const lesson = await getLessonFull('lesson-1')
    expect(lesson).not.toBeNull()
    expect(lesson!.grammarMarkdown).toBe('## Ngữ pháp 1: Test\n\n**CHỨC NĂNG**\n\nNội dung.')
  })

  it('maps dialogue_lines.start_time/end_time to startTime/endTime', async () => {
    const lesson = await getLessonFull('lesson-1')
    expect(lesson).not.toBeNull()
    expect(lesson!.dialogues).toHaveLength(1)

    const lines = lesson!.dialogues[0].lines
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ id: 'line-1', startTime: 1.5, endTime: 3.25 })
    expect(lines[1]).toMatchObject({ id: 'line-2', startTime: null, endTime: null })
  })
})
