import * as mupdf from 'mupdf'
import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { cellOf, type Label, readBack } from '../../../test/fixtures/read-back.js'
import { type Size, size } from '../../domain/geometry.js'
import type { Job } from '../../domain/job.js'
import { plan } from '../../domain/plan.js'
import { isErr, isOk } from '../../domain/result.js'
import { mm, pt } from '../../domain/units.js'
import { MupdfReader } from './mupdf-reader.js'
import { MupdfWriter } from './mupdf-writer.js'

const reader = new MupdfReader()
const writer = new MupdfWriter(reader)

const bookletJob = (): Job => ({
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
})

const imposedFrom = (source: Uint8Array, job: Job): Uint8Array => {
  const opened = reader.open(source)
  if (!isOk(opened)) throw new Error('document did not open')
  const built = plan(job, opened.value.info)
  if (!isOk(built)) throw new Error(`plan not built: ${JSON.stringify(built.error)}`)
  const written = writer.write(opened.value.handle, built.value)
  if (!isOk(written)) throw new Error(`file not written: ${JSON.stringify(written.error)}`)
  reader.close(opened.value.handle)
  return written.value
}

const imposed = (
  pageCount: number,
  job: Job,
  extra: { origin?: number; rotate?: number } = {},
): Uint8Array =>
  imposedFrom(makeNumberedPdf({ pageCount, width: 419.53, height: 595.28, ...extra }), job)

/** One page per sheet at actual size: a label position reads directly. */
const oneToOne = (sheet: Size): Job => ({
  scheme: { kind: 'nup', rows: 1, cols: 1, fill: 'rows' },
  sheet: { size: sheet, margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
})

const labelAt = (bytes: Uint8Array, text: string): Label => {
  const first = readBack(bytes)[0]
  if (first === undefined) throw new Error('no sheet')
  const found = first.labels.find((l) => l.text === text)
  if (found === undefined) throw new Error(`no label ${text}`)
  return found
}

describe('writer', () => {
  it('a 16-page booklet puts the pages in the right cells', () => {
    const sheets = readBack(imposed(16, bookletJob()))
    expect(sheets).toHaveLength(8)
    const first = sheets[0]
    const second = sheets[1]
    if (first === undefined || second === undefined) throw new Error('no sheets')
    expect(cellOf(first, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
    expect(cellOf(second, 1, 2, 'bottom-P2')).toEqual({ row: 0, col: 0 })
    expect(cellOf(second, 1, 2, 'bottom-P15')).toEqual({ row: 0, col: 1 })
  })

  it('sheet size matches the plan', () => {
    const sheets = readBack(imposed(4, bookletJob()))
    expect(sheets[0]?.width).toBeCloseTo(841.89, 2)
    expect(sheets[0]?.height).toBeCloseTo(595.28, 2)
  })

  it('cut and stack lays pages out in stacks', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'cutStack', rows: 2, cols: 2 },
      sheet: { size: size(841.89, 1190.55), margin: pt(0), gap: pt(0) },
      // An A3/4 cell is a fraction of a point shorter than an A5 page, so the page is fitted.
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const sheets = readBack(imposed(16, job))
    const first = sheets[0]
    if (first === undefined) throw new Error('no sheet')
    expect(cellOf(first, 2, 2, 'bottom-P1')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 2, 2, 'bottom-P5')).toEqual({ row: 0, col: 1 })
    expect(cellOf(first, 2, 2, 'bottom-P9')).toEqual({ row: 1, col: 0 })
    expect(cellOf(first, 2, 2, 'bottom-P13')).toEqual({ row: 1, col: 1 })
  })

  it('a page with an offset origin lands in its own cell', () => {
    const sheets = readBack(imposed(4, bookletJob(), { origin: 40 }))
    const first = sheets[0]
    if (first === undefined) throw new Error('no sheet')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  })

  it('a rotated page is placed rotated, not as is', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(1190.55, 841.89), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const sheets = readBack(imposed(4, job, { rotate: 90 }))
    const first = sheets[0]
    if (first === undefined) throw new Error('no sheet')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    // After a clockwise rotation the label at the bottom of the page ends up at the top of
    // the sheet. Without rotation it would stay at the bottom, so the row is what tells the
    // cases apart here.
    expect(cellOf(first, 2, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
  })

  it('bleed is cut at the clip boundary', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(5), gap: pt(0) },
      source: { bleed: mm(3), scaling: 'fit', normalizeSizes: false },
    }
    const bytes = imposed(4, job)
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(readBack(bytes)).toHaveLength(2)
  })

  it('a page with a CropBox is placed by its CropBox, and content it hides is not printed', () => {
    const crop = { left: 8, bottom: 10, right: 6, top: 4 }
    const plain = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }),
      oneToOne(size(300, 400)),
    )
    const cropped = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400, crop }),
      // Sheet exactly the size of the CropBox: the page goes into it one to one.
      oneToOne(size(300 - crop.left - crop.right, 400 - crop.bottom - crop.top)),
    )
    const before = labelAt(plain, 'bottom-P1')
    const after = labelAt(cropped, 'bottom-P1')
    // Positions count from the CropBox origin, so the label shifts by exactly its offsets.
    expect(after.x).toBeCloseTo(before.x - crop.left, 2)
    expect(after.y).toBeCloseTo(before.y - crop.top, 2)
    const sheet = readBack(cropped)[0]
    expect(sheet?.labels.some((l) => l.text.startsWith('outside-'))).toBe(false)
  })

  it('bleed inside the CropBox does not shift the page vertically', () => {
    // The TrimBox sits asymmetrically in the CropBox: eight points at the bottom, two at
    // the top. The page must still land on the trim line, as if there were no boxes at all.
    const source = makeNumberedPdf({
      pageCount: 1,
      width: 300,
      height: 400,
      bleed: 10,
      crop: { left: 8, bottom: 2, right: 4, top: 8 },
    })
    const trimmed = imposedFrom(source, oneToOne(size(300, 400)))
    const plain = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }),
      oneToOne(size(300, 400)),
    )
    const before = labelAt(plain, 'bottom-P1')
    const after = labelAt(trimmed, 'bottom-P1')
    expect(after.x).toBeCloseTo(before.x, 2)
    expect(after.y).toBeCloseTo(before.y, 2)
  })

  it('a page without a content stream does not crash the export', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      withoutContents: [1],
    })
    const sheets = readBack(imposedFrom(source, bookletJob()))
    expect(sheets).toHaveLength(2)
    const first = sheets[0]
    const second = sheets[1]
    if (first === undefined || second === undefined) throw new Error('no sheets')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
    // The blank page sits on the left and prints nothing; its neighbor is placed as usual.
    expect(cellOf(second, 1, 2, 'bottom-P3')).toEqual({ row: 0, col: 1 })
    expect(cellOf(second, 1, 2, 'bottom-P2')).toBeNull()
  })

  it('content split across two streams is joined in full', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      splitContents: true,
    })
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2), halo: null }],
    }
    const sheets = readBack(imposedFrom(source, job))
    expect(sheets).toHaveLength(2)
    const first = sheets[0]
    if (first === undefined) throw new Error('no sheet')
    // The large label is in the first stream, the corner ones in the second.
    expect(first.labels.some((l) => l.text === 'P4')).toBe(true)
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'top-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  })

  it('the transparency group is carried into the form', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      transparencyGroup: true,
    })
    const out = imposedFrom(source, bookletJob())
    const opened = mupdf.Document.openDocument(out, 'application/pdf').asPDF()
    if (opened === null) throw new Error('result is not a PDF')
    // Narrow to PDF; otherwise the page type stays generic and has no dictionary.
    const doc: mupdf.PDFDocument = opened
    const forms = doc.loadPage(0).getObject().get('Resources').get('XObject')
    const kinds: string[] = []
    forms.forEach((form) => {
      const kind = form.resolve().get('Group').resolve().get('S')
      kinds.push(kind.isName() ? kind.asName() : 'no group')
    })
    doc.destroy()
    expect(kinds).toHaveLength(2)
    expect(new Set(kinds)).toEqual(new Set(['Transparency']))
  })

  it('a handle from another reader cannot build a file', () => {
    const other = new MupdfReader()
    const opened = other.open(makeNumberedPdf({ pageCount: 4, width: 300, height: 400 }))
    if (!isOk(opened)) throw new Error('document did not open')
    const built = plan(oneToOne(size(300, 400)), opened.value.info)
    if (!isOk(built)) throw new Error('plan not built')
    // The writer is bound to another reader: it must not accept a foreign document number.
    const written = writer.write(opened.value.handle, built.value)
    expect(isErr(written)).toBe(true)
    other.close(opened.value.handle)
  })

  it('crop marks reach the file and do not break it', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: mm(3), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2), halo: null }],
    }
    const sheets = readBack(imposed(4, job))
    expect(sheets).toHaveLength(2)
    expect(sheets[0]?.labels.some((l) => l.text.includes('P1'))).toBe(true)
  })
})
