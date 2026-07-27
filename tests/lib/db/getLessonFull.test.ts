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
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
      }
      if (table === 'vocabulary') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
      }
      if (table === 'grammar_points') {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [{ id: 'gp-1', lesson_id: 'lesson-1', order: 1, title_zh: 'G1', title_vi: null, structure_note: null }],
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
                    title_zh: 'A1', title_vi: null, structure_note: 'sub note',
                  }],
                }),
            }),
          }),
        }
      }
      if (table === 'grammar_examples') {
        return {
          select: () => ({
            or: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'ex-1', grammar_point_id: 'gp-1', grammar_sub_point_id: null, order: 1, text_zh: 'flat-ex', pinyin: null, translation_vi: null },
                    { id: 'ex-2', grammar_point_id: null, grammar_sub_point_id: 'sp-1', order: 1, text_zh: 'sub-ex', pinyin: null, translation_vi: null },
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
  it('assigns each grammar example to its own grammar point or sub-point, not both', async () => {
    const lesson = await getLessonFull('lesson-1')
    expect(lesson).not.toBeNull()
    expect(lesson!.grammarPoints).toHaveLength(1)

    const gp = lesson!.grammarPoints[0]
    expect(gp.examples).toEqual([
      expect.objectContaining({ id: 'ex-1', textZh: 'flat-ex' }),
    ])

    expect(gp.subPoints).toHaveLength(1)
    expect(gp.subPoints[0]).toMatchObject({ id: 'sp-1', label: 'A', structureNote: 'sub note' })
    expect(gp.subPoints[0].examples).toEqual([
      expect.objectContaining({ id: 'ex-2', textZh: 'sub-ex' }),
    ])
  })
})
