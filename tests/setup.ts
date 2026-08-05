import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement Range/Element.getClientRects or getBoundingClientRect
// (they always return an empty/zeroed result) - TipTap's BubbleMenu/FloatingMenu
// call these on every editor update to position themselves against real text
// coordinates, which throws in jsdom ("target.getClientRects is not a function")
// even though the feature works correctly in an actual browser. Stub both to
// return an empty rect list / zeroed rect so editor updates don't crash.
if (typeof document !== 'undefined') {
  const zeroRect = (): DOMRect => ({
    x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
    toJSON() { return this },
  })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = zeroRect
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList
  Element.prototype.getBoundingClientRect = zeroRect
}
