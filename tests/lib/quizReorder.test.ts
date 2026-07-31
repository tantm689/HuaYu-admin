import { describe, it, expect } from 'vitest'
import { canMoveWithinPart, moveQuestionWithinPart } from '@/lib/quizReorder'

// 4-question fixture: 2 in Part 1 (indices 0,1), 2 in Part 2 (indices 2,3) -
// the exact shape the original reviewer traced `moveItem` through, so the
// same trace can be redone against the fixed helper.
function fixture() {
  return [
    { part: 1 as const, order: 1, label: 'p1-a' },
    { part: 1 as const, order: 2, label: 'p1-b' },
    { part: 2 as const, order: 1, label: 'p2-a' },
    { part: 2 as const, order: 2, label: 'p2-b' },
  ]
}

describe('moveQuestionWithinPart', () => {
  it('never lets the last Part 1 question move into the Part 2 slot', () => {
    const items = fixture()
    // index 1 = 'p1-b', the LAST Part 1 question. Moving it "down" (+1)
    // would, under plain adjacent-swap moveItem, swap it with index 2
    // ('p2-a', the first Part 2 question) - exactly the bug. The fix must
    // return the array unchanged instead.
    const result = moveQuestionWithinPart(items, 1, 1)
    expect(result).toBe(items) // unchanged reference: no same-part neighbor below
    expect(result.map((i) => i.label)).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b'])
    expect(result.map((i) => i.part)).toEqual([1, 1, 2, 2])
  })

  it('never lets the first Part 2 question move into the Part 1 slot', () => {
    const items = fixture()
    // index 2 = 'p2-a', the FIRST Part 2 question. Moving it "up" (-1) would
    // under plain moveItem swap with index 1 ('p1-b'). Must be a no-op.
    const result = moveQuestionWithinPart(items, 2, -1)
    expect(result).toBe(items)
    expect(result.map((i) => i.label)).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b'])
  })

  it('reorders within Part 1 correctly and keeps per-part order numbering', () => {
    const items = fixture()
    // Move index 0 ('p1-a') down: should swap with index 1 ('p1-b'), the
    // only other Part 1 item - a same-part neighbor, so this must succeed.
    const result = moveQuestionWithinPart(items, 0, 1)
    expect(result.map((i) => i.label)).toEqual(['p1-b', 'p1-a', 'p2-a', 'p2-b'])
    expect(result.map((i) => i.part)).toEqual([1, 1, 2, 2])
    // order renumbered 1..N within each part, unaffected by the other part.
    expect(result.map((i) => i.order)).toEqual([1, 2, 1, 2])
  })

  it('reorders within Part 2 correctly and keeps per-part order numbering', () => {
    const items = fixture()
    // Move index 3 ('p2-b') up: should swap with index 2 ('p2-a').
    const result = moveQuestionWithinPart(items, 3, -1)
    expect(result.map((i) => i.label)).toEqual(['p1-a', 'p1-b', 'p2-b', 'p2-a'])
    expect(result.map((i) => i.part)).toEqual([1, 1, 2, 2])
    expect(result.map((i) => i.order)).toEqual([1, 2, 1, 2])
  })

  it('skips past a differently-partitioned item when parts are interleaved', () => {
    // Not how the page currently lays things out (it filters into two
    // contiguous blocks before rendering), but the underlying flat array
    // order is whatever `keyedQuestions` holds - the helper must still find
    // the correct same-part neighbor by scanning past foreign-part items.
    const items = [
      { part: 1 as const, order: 1, label: 'p1-a' },
      { part: 2 as const, order: 1, label: 'p2-a' },
      { part: 1 as const, order: 2, label: 'p1-b' },
    ]
    const result = moveQuestionWithinPart(items, 0, 1) // move p1-a down
    expect(result.map((i) => i.label)).toEqual(['p1-b', 'p2-a', 'p1-a'])
    expect(result.map((i) => i.part)).toEqual([1, 2, 1])
  })

  it('returns the same array reference for an out-of-range index', () => {
    const items = fixture()
    expect(moveQuestionWithinPart(items, 9, -1)).toBe(items)
    expect(moveQuestionWithinPart(items, -1, 1)).toBe(items)
  })

  it('does not mutate the input array', () => {
    const items = fixture()
    moveQuestionWithinPart(items, 0, 1)
    expect(items.map((i) => i.label)).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b'])
  })
})

describe('canMoveWithinPart', () => {
  it('is false for the last item of Part 1 moving down and the first item of Part 2 moving up', () => {
    const items = fixture()
    expect(canMoveWithinPart(items, 1, 1)).toBe(false) // last of part 1, down
    expect(canMoveWithinPart(items, 2, -1)).toBe(false) // first of part 2, up
  })

  it('is true when a same-part neighbor exists', () => {
    const items = fixture()
    expect(canMoveWithinPart(items, 0, 1)).toBe(true) // p1-a can move down to p1-b
    expect(canMoveWithinPart(items, 1, -1)).toBe(true) // p1-b can move up to p1-a
    expect(canMoveWithinPart(items, 2, 1)).toBe(true) // p2-a can move down to p2-b
    expect(canMoveWithinPart(items, 3, -1)).toBe(true) // p2-b can move up to p2-a
  })
})
