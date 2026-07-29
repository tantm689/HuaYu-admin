// Moves one element of an array up (-1) or down (+1), returning a new array.
// Out-of-range moves return the original array so callers can wire the
// buttons up unconditionally and let the UI disable them at the edges.
// `order` fields are renumbered to match the new positions, since every
// grammar/dialogue row carries a 1-based `order` the DB sorts by.
export function moveItem<T extends { order: number }>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)

  return next.map((item, idx) => ({ ...item, order: idx + 1 }))
}
