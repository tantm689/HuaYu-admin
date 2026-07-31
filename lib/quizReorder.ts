// Reorders quiz questions up/down WITHOUT ever crossing the part 1 / part 2
// boundary. The quiz page renders two separate lists (Part 1, Part 2) filtered
// from one flat array, but `moveItem` (adjacent-swap + global 1..N renumber)
// was designed for a single flat list - applying it directly to the flat
// array let a "move down" on the last Part 1 question swap it with the first
// Part 2 question, silently interleaving the two parts' `order` sequences.
//
// This swaps the target item only with its nearest same-part neighbor (by
// scanning past any items belonging to the other part) and renumbers `order`
// per-part (1..N within part 1, 1..N within part 2), so `part` never changes
// as a result of a move and each part's `order` stays a clean sequence.
export function moveQuestionWithinPart<T extends { part: 1 | 2; order: number }>(
  items: T[],
  index: number,
  direction: -1 | 1
): T[] {
  if (index < 0 || index >= items.length) return items

  const part = items[index].part
  let target = index + direction
  while (target >= 0 && target < items.length && items[target].part !== part) {
    target += direction
  }
  if (target < 0 || target >= items.length || items[target].part !== part) {
    return items
  }

  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]

  let part1Order = 1
  let part2Order = 1
  return next.map((item) => {
    if (item.part === 1) return { ...item, order: part1Order++ }
    return { ...item, order: part2Order++ }
  })
}

// Whether the item at `index` can move in `direction` without leaving its
// part - i.e. whether a same-part neighbor exists on that side.
export function canMoveWithinPart<T extends { part: 1 | 2 }>(items: T[], index: number, direction: -1 | 1): boolean {
  if (index < 0 || index >= items.length) return false
  const part = items[index].part
  let target = index + direction
  while (target >= 0 && target < items.length) {
    if (items[target].part === part) return true
    target += direction
  }
  return false
}
