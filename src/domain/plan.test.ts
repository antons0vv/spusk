import { describe, expect, it } from 'vitest'
import { type Rect, rect, size } from './geometry.js'
import type { DocumentInfo, Job } from './job.js'
import { type BadParameter, plan } from './plan.js'
import { isErr, isOk } from './result.js'
import { mm, pt } from './units.js'

const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const doc = (pageCount: number, hasTrim = true): DocumentInfo => ({
  pageCount,
  pages: Array.from({ length: pageCount }, () => ({ ...A5, hasTrimBox: hasTrim, bleed: null })),
  uniformSize: size(419.53, 595.28),
  cropMarks: null,
})

const bookletJob = (overrides: Partial<Job> = {}): Job => ({
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: mm(0.4) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
  ...overrides,
})

describe('planner', () => {
  it('a 16-page booklet gives eight sides', () => {
    const r = plan(bookletJob(), doc(16))
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value.sheets).toHaveLength(8)
  })

  it('creep grows monotonically from the outer sheet to the inner one', () => {
    const r = plan(bookletJob(), doc(16))
    if (!isOk(r)) throw new Error('plan not built')
    const leftX = r.value.sheets.map((s) => s.placements[0]?.trim.x ?? 0)
    expect(leftX).toHaveLength(8)
    for (let i = 0; i < leftX.length; i += 2) {
      // Both sides of one sheet are shifted equally.
      expect(leftX[i]).toBeCloseTo(leftX[i + 1] ?? 0, 9)
      // Each next sheet inward is shifted more than the previous one.
      if (i > 0) expect(leftX[i] ?? 0).toBeGreaterThan(leftX[i - 2] ?? 0)
    }
  })

  it('padding with blanks shows up in the warnings', () => {
    const r = plan(bookletJob(), doc(13))
    if (!isOk(r)) throw new Error('plan not built')
    expect(r.value.padding).toBe(3)
    expect(r.value.warnings).toContainEqual({ kind: 'PaddedToFolio', added: 3 })
  })

  it('a missing TrimBox with bleed set gives a warning', () => {
    const job = bookletJob({ source: { bleed: mm(3), scaling: 'actual', normalizeSizes: false } })
    const r = plan(job, doc(4, false))
    if (!isOk(r)) throw new Error('plan not built')
    expect(r.value.warnings).toContainEqual({ kind: 'NoTrimBox', pages: 4 })
  })

  it('mixed page sizes give a warning when size normalization is off', () => {
    const mixed: DocumentInfo = { ...doc(4), uniformSize: null }
    const r = plan(bookletJob(), mixed)
    if (!isOk(r)) throw new Error('plan not built')
    expect(r.value.warnings).toContainEqual({ kind: 'MixedPageSizes' })
  })

  it('an overshoot under a hundredth of a point does not count as not fitting', () => {
    const barely: DocumentInfo = {
      pageCount: 2,
      pages: Array.from({ length: 2 }, () => ({
        // A cell on a landscape A4 sheet is exactly 420.945 wide.
        trim: rect(0, 0, 420.9455, 595.28),
        media: rect(0, 0, 420.9455, 595.28),
        hasTrimBox: true,
        bleed: null,
      })),
      uniformSize: size(420.9455, 595.28),
      cropMarks: null,
    }
    expect(isOk(plan(bookletJob(), barely))).toBe(true)
  })

  it('an overshoot of two hundredths of a point already counts as not fitting', () => {
    const tooBig: DocumentInfo = {
      pageCount: 2,
      pages: Array.from({ length: 2 }, () => ({
        // The cell is exactly 420.945, the overshoot is twice the tolerance.
        trim: rect(0, 0, 420.965, 595.28),
        media: rect(0, 0, 420.965, 595.28),
        hasTrimBox: true,
        bleed: null,
      })),
      uniformSize: size(420.965, 595.28),
      cropMarks: null,
    }
    expect(isErr(plan(bookletJob(), tooBig))).toBe(true)
  })

  it('a page that does not fit at actual size is a failure', () => {
    const job = bookletJob({ sheet: { size: size(400, 400), margin: pt(0), gap: pt(0) } })
    const r = plan(job, doc(4))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('DoesNotFit')
  })

  it('zero rows or columns is a parameter failure', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'nup', rows: 0, cols: 2, fill: 'rows' },
    }
    const r = plan(job, doc(4))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('BadParameters')
  })

  it('size normalization brings different pages to a common trim size', () => {
    const mixed: DocumentInfo = {
      pageCount: 2,
      pages: [
        { trim: rect(0, 0, 400, 500), media: rect(0, 0, 400, 500), hasTrimBox: true, bleed: null },
        { trim: rect(0, 0, 300, 400), media: rect(0, 0, 300, 400), hasTrimBox: true, bleed: null },
      ],
      uniformSize: null,
      cropMarks: null,
    }
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
      source: { bleed: pt(0), scaling: 'actual', normalizeSizes: true },
    })
    const r = plan(job, mixed)
    if (!isOk(r)) throw new Error('plan not built')
    for (const sheet of r.value.sheets) {
      for (const placement of sheet.placements) {
        expect(placement.trim.w).toBeCloseTo(400, 6)
        expect(placement.trim.h).toBeCloseTo(500, 6)
      }
    }
    expect(r.value.warnings).not.toContainEqual({ kind: 'MixedPageSizes' })
  })

  it('a size failure names the largest page, not the first one', () => {
    const mixed: DocumentInfo = {
      pageCount: 2,
      pages: [
        { trim: rect(0, 0, 100, 100), media: rect(0, 0, 100, 100), hasTrimBox: true, bleed: null },
        { trim: rect(0, 0, 900, 100), media: rect(0, 0, 900, 100), hasTrimBox: true, bleed: null },
      ],
      uniformSize: null,
      cropMarks: null,
    }
    const r = plan(bookletJob(), mixed)
    expect(isErr(r)).toBe(true)
    if (isErr(r) && r.error.kind === 'DoesNotFit') {
      expect(r.error.needed.w).toBeCloseTo(900, 6)
    }
  })

  it('right binding mirrors the spreads', () => {
    const straight = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
    })
    const mirrored = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'right', creepPerSheet: pt(0) },
    })
    const left = plan(straight, doc(8))
    const right = plan(mirrored, doc(8))
    if (!isOk(left) || !isOk(right)) throw new Error('plan not built')
    const leftSources = left.value.sheets[0]?.placements.map((p) => p.source) ?? []
    const rightSources = right.value.sheets[0]?.placements.map((p) => p.source) ?? []
    expect(rightSources).toEqual([...leftSources].reverse())
  })

  it('top binding puts pages one above the other', () => {
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'top', creepPerSheet: pt(0) },
      sheet: { size: size(595.28, 841.89), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    })
    const r = plan(job, doc(4))
    if (!isOk(r)) throw new Error('plan not built')
    const placements = r.value.sheets[0]?.placements ?? []
    expect(placements).toHaveLength(2)
    expect(placements[0]?.trim.y ?? 0).toBeGreaterThan(placements[1]?.trim.y ?? 0)
    expect(placements[0]?.trim.x).toBeCloseTo(placements[1]?.trim.x ?? 0, 6)
  })

  it('eight-page signatures reset creep at the signature boundary', () => {
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 8, binding: 'left', creepPerSheet: mm(0.5) },
    })
    const r = plan(job, doc(16))
    if (!isOk(r)) throw new Error('plan not built')
    const leftX = r.value.sheets.map((s) => s.placements[0]?.trim.x ?? 0)
    expect(leftX[0]).toBeCloseTo(leftX[4] ?? 0, 9)
    expect(leftX[6] ?? 0).toBeGreaterThan(leftX[4] ?? 0)
  })

  it('marks are expanded onto every sheet', () => {
    const job = bookletJob({
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2), halo: null }],
    })
    const r = plan(job, doc(8))
    if (!isOk(r)) throw new Error('plan not built')
    // Two outer verticals and two horizontals of the spread, a stroke at each end; the spine
    // is not cut.
    for (const sheet of r.value.sheets) {
      expect(sheet.marks.filter((m) => m.kind === 'line')).toHaveLength(8)
    }
  })

  it('step and repeat, and cut and stack, go through the planner without padding', () => {
    const fit = { bleed: pt(0), scaling: 'fit', normalizeSizes: false } as const
    const repeat = plan(
      bookletJob({ scheme: { kind: 'stepRepeat', rows: 2, cols: 2, copies: 6 }, source: fit }),
      doc(1),
    )
    if (!isOk(repeat)) throw new Error('plan not built')
    expect(repeat.value.sheets).toHaveLength(2)
    expect(repeat.value.padding).toBe(0)

    const stack = plan(
      bookletJob({ scheme: { kind: 'cutStack', rows: 2, cols: 2 }, source: fit }),
      doc(16),
    )
    if (!isOk(stack)) throw new Error('plan not built')
    expect(stack.value.sheets).toHaveLength(4)
    expect(stack.value.padding).toBe(0)
  })

  it('contradictory parameters are rejected and name exactly what is wrong', () => {
    const cases: readonly (readonly [Job, BadParameter])[] = [
      [bookletJob({ scheme: { kind: 'nup', rows: 2.5, cols: 2, fill: 'rows' } }), 'grid'],
      [bookletJob({ scheme: { kind: 'stepRepeat', rows: 2, cols: 2, copies: 0 } }), 'copies'],
      [
        bookletJob({
          scheme: { kind: 'booklet', folio: 6, binding: 'left', creepPerSheet: pt(0) },
        }),
        'folio',
      ],
      [bookletJob({ sheet: { size: size(0, 595.28), margin: pt(0), gap: pt(0) } }), 'sheet'],
      [
        bookletJob({ sheet: { size: size(841.89, 595.28), margin: pt(500), gap: pt(0) } }),
        'margins',
      ],
      [bookletJob({ source: { bleed: pt(-1), scaling: 'fit', normalizeSizes: false } }), 'margins'],
    ]
    for (const [job, what] of cases) {
      const r = plan(job, doc(4))
      expect(isErr(r)).toBe(true)
      if (!isErr(r)) continue
      expect(r.error.kind).toBe('BadParameters')
      if (r.error.kind !== 'BadParameters') continue
      expect(r.error.what).toBe(what)
      expect(r.error.message.length).toBeGreaterThan(0)
    }
  })

  it('a page with a zero or non-numeric trim size is rejected', () => {
    const broken: readonly Rect[] = [
      rect(0, 0, 0, 595.28),
      rect(0, 0, 419.53, 0),
      rect(0, 0, Number.NaN, 595.28),
      rect(0, 0, 419.53, Number.POSITIVE_INFINITY),
      rect(0, 0, -419.53, 595.28),
    ]
    for (const trim of broken) {
      const damaged: DocumentInfo = {
        pageCount: 2,
        // The second page is intact: one damaged page alone must still cause a failure.
        pages: [
          { trim, media: rect(0, 0, 419.53, 595.28), hasTrimBox: true, bleed: null },
          { ...A5, hasTrimBox: true, bleed: null },
        ],
        uniformSize: null,
        cropMarks: null,
      }
      const r = plan(bookletJob(), damaged)
      expect(isErr(r)).toBe(true)
      if (!isErr(r)) continue
      expect(r.error.kind).toBe('BadParameters')
      if (r.error.kind !== 'BadParameters') continue
      expect(r.error.what).toBe('pages')
    }
  })

  it('an empty document and an inconsistent description are rejected', () => {
    const empty = plan(bookletJob(), doc(0))
    expect(isErr(empty)).toBe(true)

    const inconsistent: DocumentInfo = { ...doc(4), pageCount: 5 }
    const r = plan(bookletJob(), inconsistent)
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('BadParameters')
  })

  it('a signature that is not a multiple of four is a parameter failure', () => {
    for (const folio of [0, 3, 6, -8]) {
      const job = bookletJob({
        scheme: { kind: 'booklet', folio, binding: 'left', creepPerSheet: mm(0.4) },
      })
      const r = plan(job, doc(16))
      expect(isErr(r)).toBe(true)
      if (isErr(r)) expect(r.error.kind).toBe('BadParameters')
    }
  })

  it('invariant: every page appears exactly once', () => {
    for (const pageCount of [4, 7, 16, 33]) {
      const r = plan(bookletJob(), doc(pageCount))
      if (!isOk(r)) throw new Error('plan not built')
      const seen = r.value.sheets
        .flatMap((s) => s.placements)
        .flatMap((p) => (p.source.kind === 'page' ? [p.source.index] : []))
      expect(new Set(seen).size).toBe(pageCount)
      expect(seen).toHaveLength(pageCount)
    }
  })

  it('invariant: the number of placements equals sheets times cells', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'nup', rows: 2, cols: 2, fill: 'rows' },
      // Four A5 pages do not fit on an A4 sheet at actual size,
      // so the invariant is checked in “fit” mode.
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const r = plan(job, doc(7))
    if (!isOk(r)) throw new Error('plan not built')
    const total = r.value.sheets.reduce((acc, s) => acc + s.placements.length, 0)
    expect(total).toBe(r.value.sheets.length * 4)
  })
})
