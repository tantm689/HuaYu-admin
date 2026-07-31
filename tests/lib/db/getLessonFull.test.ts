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
      if (table === 'grammar_points') {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [{ id: 'gp-1', lesson_id: 'lesson-1', order: 1, title_zh: 'G1', title_vi: null }],
                }),
            }),
          }),
        }
      }
      if (table === 'grammar_sub_points') {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: [{
                    id: 'sp-1', grammar_point_id: 'gp-1', order: 1, label: 'A',
                    title_zh: 'A1', title_vi: null,
                  }],
                }),
            }),
          }),
        }
      }
      if (table === 'grammar_sections') {
        return {
          select: () => ({
            or: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'sec-1', grammar_point_id: 'gp-1', grammar_sub_point_id: null, parent_section_id: null, order: 1, label: 'Cấu trúc', content: 'flat note' },
                    { id: 'sec-2', grammar_point_id: null, grammar_sub_point_id: 'sp-1', parent_section_id: null, order: 1, label: 'Cấu trúc', content: 'sub note' },
                  ],
                }),
            }),
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'item-1', grammar_point_id: null, grammar_sub_point_id: null, parent_section_id: 'sec-1', order: 1, label: '1', content: 'item note' },
                  ],
                }),
            }),
          }),
        }
      }
      if (table === 'grammar_examples') {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'ex-1', grammar_section_id: 'sec-1', order: 1, text_zh: 'flat-ex', pinyin: null, translation_vi: null },
                    { id: 'ex-2', grammar_section_id: 'sec-2', order: 1, text_zh: 'sub-ex', pinyin: null, translation_vi: null },
                    { id: 'ex-3', grammar_section_id: 'item-1', order: 1, text_zh: 'item-ex', pinyin: null, translation_vi: null },
                  ],
                }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { getLessonFull } from '@/lib/db/getLessonFull'

describe('getLessonFull', () => {
  it('assigns each grammar section (and its examples) to its own grammar point or sub-point, not both', async () => {
    const lesson = await getLessonFull('lesson-1')
    expect(lesson).not.toBeNull()
    expect(lesson!.grammarPoints).toHaveLength(1)

    const gp = lesson!.grammarPoints[0]
    expect(gp.sections).toHaveLength(1)
    expect(gp.sections[0]).toMatchObject({ id: 'sec-1', label: 'Cấu trúc', content: 'flat note' })
    expect(gp.sections[0].examples).toEqual([
      expect.objectContaining({ id: 'ex-1', textZh: 'flat-ex' }),
    ])
    expect(gp.sections[0].items).toHaveLength(1)
    expect(gp.sections[0].items[0]).toMatchObject({ id: 'item-1', label: '1', content: 'item note' })
    expect(gp.sections[0].items[0].examples).toEqual([
      expect.objectContaining({ id: 'ex-3', textZh: 'item-ex' }),
    ])

    expect(gp.subPoints).toHaveLength(1)
    expect(gp.subPoints[0]).toMatchObject({ id: 'sp-1', label: 'A' })
    expect(gp.subPoints[0].sections).toHaveLength(1)
    expect(gp.subPoints[0].sections[0]).toMatchObject({ id: 'sec-2', content: 'sub note' })
    expect(gp.subPoints[0].sections[0].examples).toEqual([
      expect.objectContaining({ id: 'ex-2', textZh: 'sub-ex' }),
    ])
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
