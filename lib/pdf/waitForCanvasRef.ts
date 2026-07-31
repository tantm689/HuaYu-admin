// React does not guarantee that a ref callback has fired by the time the
// next line of code in an async render loop runs (the DOM commit for a
// newly-added canvas can land a tick after the state update that grew the
// list). Checking `canvasRefs.current[idx]` immediately after such a state
// update can therefore see `null` even though the canvas is about to exist,
// silently and permanently skipping that page's thumbnail.
//
// This polls the ref array a few times, yielding to the browser's paint via
// requestAnimationFrame between attempts, before giving up.
export async function waitForCanvasRef(
  refs: { current: Array<HTMLCanvasElement | null> },
  index: number,
  isCancelled: () => boolean,
  maxAttempts = 30
): Promise<HTMLCanvasElement | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const canvas = refs.current[index]
    if (canvas) return canvas
    if (isCancelled()) return null
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return refs.current[index] ?? null
}
