import { describe, it, expect } from 'vitest'
import { moveItem } from '@/lib/moveItem'

const items = [
  { order: 1, textZh: 'a' },
  { order: 2, textZh: 'b' },
  { order: 3, textZh: 'c' },
]

describe('moveItem', () => {
  it('moves an item up and renumbers order to match the new positions', () => {
    const result = moveItem(items, 1, -1)
    expect(result.map((i) => i.textZh)).toEqual(['b', 'a', 'c'])
    expect(result.map((i) => i.order)).toEqual([1, 2, 3])
  })

  it('moves an item down and renumbers order', () => {
    const result = moveItem(items, 0, 1)
    expect(result.map((i) => i.textZh)).toEqual(['b', 'a', 'c'])
    expect(result.map((i) => i.order)).toEqual([1, 2, 3])
  })

  it('returns the original array when moving the first item up', () => {
    expect(moveItem(items, 0, -1)).toBe(items)
  })

  it('returns the original array when moving the last item down', () => {
    expect(moveItem(items, 2, 1)).toBe(items)
  })

  it('returns the original array for an out-of-range index', () => {
    expect(moveItem(items, 9, -1)).toBe(items)
  })

  it('does not mutate the input array', () => {
    moveItem(items, 0, 1)
    expect(items.map((i) => i.textZh)).toEqual(['a', 'b', 'c'])
  })
})
