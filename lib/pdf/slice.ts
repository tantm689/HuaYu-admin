import { PDFDocument } from 'pdf-lib'

export async function sliceBookPdf(
  sourceBytes: Uint8Array,
  pageStart: number,
  pageEnd: number
): Promise<Uint8Array> {
  if (pageStart > pageEnd) {
    throw new Error(`pageStart (${pageStart}) must be <= pageEnd (${pageEnd})`)
  }

  const source = await PDFDocument.load(sourceBytes)
  const totalPages = source.getPageCount()

  if (pageEnd > totalPages) {
    throw new Error(`pageEnd (${pageEnd}) exceeds document length (${totalPages})`)
  }

  const out = await PDFDocument.create()
  const indices = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart - 1 + i)
  const copiedPages = await out.copyPages(source, indices)
  copiedPages.forEach((page) => out.addPage(page))

  return out.save()
}
