import { describe, expect, it } from 'vitest'
import { assemble, type Sheet } from './assemble.js'
import { rect, size } from './geometry.js'
import { buildGrid, type Grid } from './grid.js'
import { type ResolvedMark, resolveMarks } from './marks.js'
import { BLANK, page } from './slots.js'
import { mm, type Pt, pt } from './units.js'

const A4L = size(841.89, 595.28)
const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const sheetWith = (margin = mm(10)) => {
  const grid = buildGrid(A4L, 1, 2, margin, pt(0))
  const sheets = assemble(
    [{ slots: [page(0), page(1)], side: 'front', folioSideIndex: 0 }],
    grid,
    [A5, A5],
    A5,
    { bleed: mm(3), scaling: 'fit' },
    margin,
    pt(0),
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('no sheet')
  return { sheet, grid, margin }
}

/** A sheet for three pages in a row: here sheet fractions and cell boundaries diverge. */
const threeUp = (margin: Pt, gap: Pt) => {
  const sheetSize = size(700, 320)
  const grid = buildGrid(sheetSize, 1, 3, margin, gap)
  const sheets = assemble(
    [{ slots: [page(0), page(1), page(2)], side: 'single', folioSideIndex: 0 }],
    grid,
    [A5, A5, A5],
    A5,
    { bleed: pt(0), scaling: 'fit' },
    margin,
    gap,
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('no sheet')
  return { sheet, grid, sheetSize, margin }
}

const CROP = { kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2), halo: null } as const
const FOLD = { kind: 'fold', length: mm(5), pen: pt(0.2) } as const

const cropOf = (sheet: Sheet, grid: Grid, margin: Pt, folded: boolean, sheetSize = A4L) =>
  resolveMarks(sheet, sheetSize, grid, [CROP], margin, folded)

/**
 * A spread where the pages butt up: a sheet exactly for two pages plus margins, actual size.
 * With fit scaling the pages are centered in their cells and a slit remains between them.
 */
const spread = (margin = mm(10)) => {
  const sheetSize = size(2 * A5.trim.w + 2 * margin, A5.trim.h + 2 * margin)
  const grid = buildGrid(sheetSize, 1, 2, margin, pt(0))
  const sheets = assemble(
    [{ slots: [page(0), page(1)], side: 'front', folioSideIndex: 0 }],
    grid,
    [A5, A5],
    A5,
    { bleed: mm(3), scaling: 'actual' },
    margin,
    pt(0),
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('no sheet')
  return { sheet, grid, margin, sheetSize }
}

const blockOf = (sheet: Sheet) => ({
  left: Math.min(...sheet.placements.map((p) => p.trim.x)),
  right: Math.max(...sheet.placements.map((p) => p.trim.x + p.trim.w)),
  bottom: Math.min(...sheet.placements.map((p) => p.trim.y)),
  top: Math.max(...sheet.placements.map((p) => p.trim.y + p.trim.h)),
})

const distinctRounded = (values: readonly number[]) =>
  [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)

/** Coordinates of the vertical trim lines the strokes sit on. */
const verticalXs = (marks: readonly ResolvedMark[]) =>
  distinctRounded(
    marks.flatMap((m) => (m.kind === 'line' && m.from.x === m.to.x ? [m.from.x] : [])),
  )

const horizontalYs = (marks: readonly ResolvedMark[]) =>
  distinctRounded(
    marks.flatMap((m) => (m.kind === 'line' && m.from.y === m.to.y ? [m.from.y] : [])),
  )

const foldLinesX = (marks: readonly ResolvedMark[]): readonly number[] =>
  [...new Set(marks.flatMap((m) => (m.kind === 'line' && m.dash !== null ? [m.from.x] : [])))].sort(
    (a, b) => a - b,
  )

describe('marks', () => {
  it('crop marks sit on trim lines, a line shared by adjacent pages gives one mark', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const marks = cropOf(sheet, grid, margin, false, sheetSize)
    // Three vertical lines (one shared in the middle) and two horizontal, a stroke at each end.
    expect(verticalXs(marks)).toHaveLength(3)
    expect(horizontalYs(marks)).toHaveLength(2)
    expect(marks).toHaveLength(10)
  })

  it('the white underlay of a crop mark carries to each stroke, the fold mark has none', () => {
    const { sheet, grid, margin } = spread()
    const marks = resolveMarks(
      sheet,
      spread().sheetSize,
      grid,
      [{ ...CROP, halo: pt(1.25) }, FOLD],
      margin,
      true,
    )
    const lines = marks.flatMap((m) => (m.kind === 'line' ? [m] : []))
    const crop = lines.filter((m) => m.dash === null)
    const fold = lines.filter((m) => m.dash !== null)
    expect(crop.length).toBeGreaterThan(0)
    expect(fold.length).toBeGreaterThan(0)
    expect(crop.map((m) => m.halo)).toEqual(crop.map(() => pt(1.25)))
    expect(fold.map((m) => m.halo)).toEqual(fold.map(() => null))
  })

  it('there are no crop marks inside the page block', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const block = blockOf(sheet)
    // A stroke on the adjacent page's trim line is inside too: it would print on that page's edge.
    const e = 0.01
    const within = (p: { x: number; y: number }) =>
      p.x > block.left + e && p.x < block.right - e && p.y > block.bottom - e && p.y < block.top + e
    const inside = cropOf(sheet, grid, margin, false, sheetSize).some(
      (m) => m.kind === 'line' && (within(m.from) || within(m.to)),
    )
    expect(inside).toBe(false)
  })

  it('a stroke starts at the offset from the block edge and runs outward for its length', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const block = blockOf(sheet)
    const above = cropOf(sheet, grid, margin, false, sheetSize).filter(
      (m) => m.kind === 'line' && m.from.x === m.to.x && m.from.y > block.top,
    )
    expect(above).toHaveLength(3)
    for (const m of above) {
      if (m.kind !== 'line') continue
      expect(Math.min(m.from.y, m.to.y)).toBeCloseTo(block.top + mm(3), 6)
      expect(Math.abs(m.to.y - m.from.y)).toBeCloseTo(mm(5), 6)
    }
  })

  it('there is no crop mark at the spine of a folded spread', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const marks = cropOf(sheet, grid, margin, true, sheetSize)
    const xs = verticalXs(marks)
    expect(xs).toHaveLength(2)
    expect(xs.some((x) => Math.abs(x - sheetSize.w / 2) < 1)).toBe(false)
    expect(marks).toHaveLength(8)
  })

  it('with a gap each page has its own trim line', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), mm(6))
    const marks = resolveMarks(sheet, sheetSize, grid, [CROP], margin, false)
    expect(verticalXs(marks)).toHaveLength(6)
  })

  it('a line that bounds only an empty cell gets no marks', () => {
    const margin = mm(10)
    const grid = buildGrid(A4L, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [page(0), BLANK], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5, A5],
      A5,
      { bleed: mm(3), scaling: 'fit' },
      margin,
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('no sheet')
    const marks = cropOf(sheet, grid, margin, false)
    // The occupied page's left and shared edges are there, the empty cell's right edge is not.
    expect(verticalXs(marks)).toHaveLength(2)
    // The occupied page's horizontals reach the whole block's edge; the empty cell does not count.
    expect(horizontalYs(marks)).toHaveLength(2)
  })

  it('a narrow margin clips strokes at the sheet edge and does not let them past it', () => {
    const { sheet, grid, sheetSize } = spread(mm(5))
    const marks = cropOf(sheet, grid, mm(5), false, sheetSize)
    for (const m of marks) {
      if (m.kind !== 'line') continue
      for (const p of [m.from, m.to]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9)
        expect(p.y).toBeGreaterThanOrEqual(-1e-9)
        expect(p.x).toBeLessThanOrEqual(sheetSize.w + 1e-9)
        expect(p.y).toBeLessThanOrEqual(sheetSize.h + 1e-9)
      }
    }
    expect(marks.length).toBeGreaterThan(0)
  })

  it('a margin no wider than the offset leaves no room for any stroke', () => {
    const { sheet, grid, sheetSize } = spread(mm(2))
    expect(cropOf(sheet, grid, mm(2), false, sheetSize)).toHaveLength(0)
  })

  it('a scheme without a fold gets no fold marks, even when asked', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(sheet, A4L, grid, [FOLD], margin, false)
    expect(marks).toHaveLength(0)
  })

  it('a fold mark is drawn dashed on the fold of the spread', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    const folds = marks.filter((m) => m.kind === 'line' && m.dash !== null)
    expect(folds).toHaveLength(2)
    for (const f of folds) {
      if (f.kind === 'line') expect(f.from.x).toBeCloseTo(A4L.w / 2, 6)
    }
  })

  it('with three columns fold marks follow cell boundaries, not sheet fractions', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), pt(0))
    const marks = resolveMarks(
      sheet,
      sheetSize,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    // Sheet fractions would give 233.33 and 466.67, missing the page seam by almost ten points.
    const xs = foldLinesX(marks)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(242.7822, 3)
    expect(xs[1]).toBeCloseTo(457.2178, 3)
  })

  it('with a gap the fold mark runs down its middle', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), mm(6))
    const marks = resolveMarks(
      sheet,
      sheetSize,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    const xs = foldLinesX(marks)
    expect(xs[0]).toBeCloseTo(239.9475, 3)
    expect(xs[1]).toBeCloseTo(460.0525, 3)
  })

  it('no crop marks are drawn around an empty slot', () => {
    const margin = mm(10)
    const grid = buildGrid(A4L, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [page(0), BLANK], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5, A5],
      A5,
      { bleed: mm(3), scaling: 'fit' },
      margin,
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('no sheet')
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2), halo: null }],
      margin,
      false,
    )
    // Eight lines for the only occupied cell, nothing around the empty one.
    expect(marks.filter((m) => m.kind === 'line')).toHaveLength(8)
  })

  it('registration marks are not placed with a narrow margin', () => {
    const { sheet, grid } = sheetWith(mm(4))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      mm(4),
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(0)
  })

  it('registration marks are not placed if the radius does not fit in the margin', () => {
    const { sheet, grid, margin } = sheetWith(mm(12))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(10), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(0)
  })

  it('a margin exactly at the threshold gets registration marks', () => {
    const { sheet, grid, margin } = sheetWith(mm(8))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(4)
  })

  it('registration marks go on all four sides given enough margin', () => {
    const { sheet, grid, margin } = sheetWith(mm(12))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(4)
  })

  it('an empty booklet page is cut like a real one: after folding it is a signature page', () => {
    const margin = mm(10)
    const sheetSize = size(2 * A5.trim.w + 2 * margin, A5.trim.h + 2 * margin)
    const grid = buildGrid(sheetSize, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [BLANK, page(0)], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      margin,
      pt(0),
      true,
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('no sheet')
    const xs = verticalXs(resolveMarks(sheet, sheetSize, grid, [CROP], margin, true))
    // Both outer edges of the spread: on the empty page and on the occupied one.
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(margin, 2)
  })
})
