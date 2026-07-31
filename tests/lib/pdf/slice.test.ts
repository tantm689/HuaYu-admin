import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { sliceBookPdf } from '@/lib/pdf/slice'

async function makeTestPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([100, 100])
    page.drawText(`page ${i + 1}`, { x: 10, y: 50 })
  }
  return doc.save()
}

describe('sliceBookPdf', () => {
  it('returns a PDF with only the requested page range', async () => {
    const source = await makeTestPdf(10)
    const sliced = await sliceBookPdf(source, 3, 5)
    const doc = await PDFDocument.load(sliced)
    expect(doc.getPageCount()).toBe(3)
  })

  it('throws when pageStart is greater than pageEnd', async () => {
    const source = await makeTestPdf(5)
    await expect(sliceBookPdf(source, 4, 2)).rejects.toThrow(/pageStart/)
  })

  it('throws when pageEnd exceeds the document length', async () => {
    const source = await makeTestPdf(5)
    await expect(sliceBookPdf(source, 1, 10)).rejects.toThrow(/pageEnd/)
  })
})
