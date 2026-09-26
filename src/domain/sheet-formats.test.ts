import { describe, expect, it } from 'vitest'
import { size } from './geometry.js'
import type { DocumentInfo, Job } from './job.js'
import { pickSheet } from './sheet-formats.js'
import { mm, pt } from './units.js'

const docOf = (wMm: number, hMm: number, pageCount = 8): DocumentInfo => {
  const page = {
    trim: { x: pt(0), y: pt(0), w: mm(wMm), h: mm(hMm) },
    media: { x: pt(0), y: pt(0), w: mm(wMm), h: mm(hMm) },
    hasTrimBox: false,
    bleed: null,
  }
  return {
    pageCount,
    pages: Array.from({ length: pageCount }, () => page),
    uniformSize: size(mm(wMm), mm(hMm)),
    cropMarks: null,
  }
}

const booklet: Job = {
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
  sheet: { size: size(1, 1), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
}

describe('sheet selection', () => {
  it('an A5 booklet goes on landscape A4', () => {
    expect(pickSheet(booklet, docOf(148, 210))).toMatchObject({
      format: 'a4',
      orientation: 'landscape',
    })
  })

  it('an A4 booklet moves up to landscape A3', () => {
    expect(pickSheet(booklet, docOf(210, 297))).toMatchObject({
      format: 'a3',
      orientation: 'landscape',
    })
  })

  it('a margin for marks pushes an A5 booklet to the next format', () => {
    const withMargin: Job = { ...booklet, sheet: { ...booklet.sheet, margin: mm(10) } }
    expect(pickSheet(withMargin, docOf(148, 210)).format).toBe('a3')
  })

  it('SRA4 sits between A4 and A3: an A5 spread with a five-millimeter margin goes on it', () => {
    const withMargin: Job = { ...booklet, sheet: { ...booklet.sheet, margin: mm(5) } }
    expect(pickSheet(withMargin, docOf(148, 210))).toMatchObject({
      format: 'sra4',
      orientation: 'landscape',
    })
  })

  it('of two suitable orientations it takes the one where the page has more room', () => {
    const single: Job = { ...booklet, scheme: { kind: 'nup', rows: 1, cols: 1, fill: 'rows' } }
    expect(pickSheet(single, docOf(148, 210))).toMatchObject({
      format: 'a4',
      orientation: 'portrait',
    })
  })

  it('if nothing fits, it returns the largest format', () => {
    expect(pickSheet(booklet, docOf(400, 600)).format).toBe('sra3')
  })

  it('with fit scaling any format is suitable, and the smallest is taken', () => {
    const fit: Job = { ...booklet, source: { ...booklet.source, scaling: 'fit' } }
    expect(pickSheet(fit, docOf(400, 600)).format).toBe('a4')
  })
})
