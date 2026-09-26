import type { Sheet } from './assemble.js'
import type { Point, Size } from './geometry.js'
import type { Grid } from './grid.js'
import { mm, type Pt, pt } from './units.js'

export type ResolvedMark =
  | {
      readonly kind: 'line'
      readonly from: Point
      readonly to: Point
      readonly pen: Pt
      readonly dash: readonly number[] | null
      /**
       * White line under the stroke, wider than the stroke weight: separates the mark from the
       * bleed background.
       */
      readonly halo: Pt | null
    }
  | { readonly kind: 'registration'; readonly center: Point; readonly radius: Pt; readonly pen: Pt }

/** Crop mark: offset from the trim line, stroke length, stroke weight and white underlay. */
export type CropGeometry = {
  readonly offset: Pt
  readonly length: Pt
  readonly pen: Pt
  readonly halo: Pt | null
}

export type MarkSpec =
  | ({ readonly kind: 'crop' } & CropGeometry)
  | { readonly kind: 'fold'; readonly length: Pt; readonly pen: Pt }
  | { readonly kind: 'registration'; readonly radius: Pt; readonly pen: Pt }

/** Registration marks go only in a margin at least this wide: else the circle lands on the page. */
export const MIN_MARGIN_FOR_REGISTRATION_MM = 8
const MIN_MARGIN_FOR_REGISTRATION = mm(MIN_MARGIN_FOR_REGISTRATION_MM)
const FOLD_DASH: readonly number[] = [3, 3]

const point = (x: number, y: number): Point => ({ x: pt(x), y: pt(y) })

const line = (
  from: Point,
  to: Point,
  pen: Pt,
  dash: readonly number[] | null,
  halo: Pt | null = null,
) => ({ kind: 'line', from, to, pen, dash, halo }) as const

/** A hundredth of a point: the precision to which adjacent trim lines coincide at zero gap. */
const SAME_LINE = 0.01

const distinct = (values: readonly number[]): readonly number[] =>
  [...values]
    .sort((a, b) => a - b)
    .reduce<number[]>((kept, v) => {
      const last = kept[kept.length - 1]
      if (last === undefined || v - last > SAME_LINE) kept.push(v)
      return kept
    }, [])

type Block = {
  readonly left: number
  readonly right: number
  readonly bottom: number
  readonly top: number
}

/**
 * Frame of all the sheet's cells, empty ones included: strokes stand in the same places on every
 * sheet of the run, and the guillotine cuts across the whole sheet anyway.
 */
const blockOf = (sheet: Sheet): Block | null => {
  if (sheet.placements.length === 0) return null
  const trims = sheet.placements.map((p) => p.trim)
  return {
    left: Math.min(...trims.map((t) => t.x)),
    right: Math.max(...trims.map((t) => t.x + t.w)),
    bottom: Math.min(...trims.map((t) => t.y)),
    top: Math.max(...trims.map((t) => t.y + t.h)),
  }
}

/**
 * Trim lines of a sheet. In n-up and cutting schemes only occupied cells produce them: the
 * cutter has no use for a line around nothing but empty space. In a folded scheme the inner grid
 * boundaries are a fold, not a cut, so page edges facing the spine produce no lines at any gap.
 */
const cutLinesOf = (sheet: Sheet, grid: Grid, folded: boolean) => {
  const xs: number[] = []
  const ys: number[] = []
  sheet.placements.forEach((placement, i) => {
    const cell = grid.cells[i]
    // An empty n-up cell is waste, there is nothing to cut around it. An empty booklet page is a
    // page of the signature: after folding its edge is trimmed along with the rest.
    if (cell === undefined || (placement.source.kind !== 'page' && !folded)) return
    const cut = (outer: boolean) => !folded || outer
    const { x, y, w, h } = placement.trim
    if (cut(cell.col === 0)) xs.push(x)
    if (cut(cell.col === grid.cols - 1)) xs.push(x + w)
    if (cut(cell.row === grid.rows - 1)) ys.push(y)
    if (cut(cell.row === 0)) ys.push(y + h)
  })
  return { xs: distinct(xs), ys: distinct(ys) }
}

/**
 * Stroke from the block edge outward: starts at the offset, runs for the length and is
 * clipped by the sheet edge. If the sheet edge is closer than even the offset, there is no stroke.
 */
const outward = (
  edge: number,
  direction: 1 | -1,
  offset: number,
  length: number,
  limit: number,
): readonly [number, number] | null => {
  const start = edge + direction * offset
  const end = edge + direction * (offset + length)
  if (direction === 1) return start >= limit ? null : [start, Math.min(end, limit)]
  return start <= 0 ? null : [start, Math.max(end, 0)]
}

/**
 * Crop marks along trim lines, not around pages: each line gets a stroke in the sheet margin
 * at both ends, with no marks inside the page block. This is how imposition software places
 * them; see the analysis in docs/crop-marks-research.md.
 */
const cropMarksFor = (
  sheet: Sheet,
  sheetSize: Size,
  grid: Grid,
  spec: Extract<MarkSpec, { kind: 'crop' }>,
  folded: boolean,
): ResolvedMark[] => {
  const block = blockOf(sheet)
  if (block === null) return []
  const { xs, ys } = cutLinesOf(sheet, grid, folded)
  const marks: ResolvedMark[] = []
  const { offset, length, pen, halo } = spec
  for (const x of xs) {
    for (const [edge, direction] of [
      [block.top, 1],
      [block.bottom, -1],
    ] as const) {
      const span = outward(edge, direction, offset, length, sheetSize.h)
      if (span !== null) marks.push(line(point(x, span[0]), point(x, span[1]), pen, null, halo))
    }
  }
  for (const y of ys) {
    for (const [edge, direction] of [
      [block.right, 1],
      [block.left, -1],
    ] as const) {
      const span = outward(edge, direction, offset, length, sheetSize.w)
      if (span !== null) marks.push(line(point(span[0], y), point(span[1], y), pen, null, halo))
    }
  }
  return marks
}

/**
 * The fold line runs along the boundary between adjacent cells, not along a fraction of the
 * sheet: fractions coincide with cells only with two columns, with three or more the mark would
 * drift off the real seam. With a non-zero gap the boundary is the middle of the gap.
 */
const foldMarksFor = (grid: Grid, sheetSize: Size, margin: Pt, length: Pt, pen: Pt) => {
  const marks: ResolvedMark[] = []
  const reach = Math.min(margin, length)
  for (let col = 1; col < grid.cols; col += 1) {
    const before = grid.cells[col - 1]
    const after = grid.cells[col]
    if (before === undefined || after === undefined) continue
    const x = (before.rect.x + before.rect.w + after.rect.x) / 2
    marks.push(line(point(x, 0), point(x, reach), pen, FOLD_DASH))
    marks.push(line(point(x, sheetSize.h - reach), point(x, sheetSize.h), pen, FOLD_DASH))
  }
  for (let row = 1; row < grid.rows; row += 1) {
    const above = grid.cells[(row - 1) * grid.cols]
    const below = grid.cells[row * grid.cols]
    if (above === undefined || below === undefined) continue
    const y = (above.rect.y + below.rect.y + below.rect.h) / 2
    marks.push(line(point(0, y), point(reach, y), pen, FOLD_DASH))
    marks.push(line(point(sheetSize.w - reach, y), point(sheetSize.w, y), pen, FOLD_DASH))
  }
  return marks
}

const registrationMarksFor = (sheetSize: Size, margin: Pt, radius: Pt, pen: Pt) => {
  // The mark sits mid-margin, so a radius over half the margin would push it onto the page.
  if (margin < MIN_MARGIN_FOR_REGISTRATION || radius > margin / 2) return []
  const inset = margin / 2
  return [
    { kind: 'registration', center: point(sheetSize.w / 2, inset), radius, pen },
    { kind: 'registration', center: point(sheetSize.w / 2, sheetSize.h - inset), radius, pen },
    { kind: 'registration', center: point(inset, sheetSize.h / 2), radius, pen },
    { kind: 'registration', center: point(sheetSize.w - inset, sheetSize.h / 2), radius, pen },
  ] as const
}

/**
 * Expands the mark spec into geometry for a specific sheet. `folded` means the
 * sheet gets folded (booklet and signatures): only then is there a fold, which is
 * marked with a dashed line and not cut.
 */
export const resolveMarks = (
  sheet: Sheet,
  sheetSize: Size,
  grid: Grid,
  specs: readonly MarkSpec[],
  margin: Pt,
  folded: boolean,
): readonly ResolvedMark[] =>
  specs.flatMap((spec) => {
    if (spec.kind === 'crop') return cropMarksFor(sheet, sheetSize, grid, spec, folded)
    if (spec.kind === 'fold') {
      // In n-up and cutting schemes cell boundaries are cut, not folded: a dashed line there
      // would mislead the cutter.
      return folded ? foldMarksFor(grid, sheetSize, margin, spec.length, spec.pen) : []
    }
    return registrationMarksFor(sheetSize, margin, spec.radius, spec.pen)
  })
