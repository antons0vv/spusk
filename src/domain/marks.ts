import type { Sheet } from './assemble.js'
import type { Point, Rect, Size } from './geometry.js'
import type { Grid } from './grid.js'
import { mm, type Pt, pt } from './units.js'

export type ResolvedMark =
  | {
      readonly kind: 'line'
      readonly from: Point
      readonly to: Point
      readonly pen: Pt
      readonly dash: readonly number[] | null
    }
  | { readonly kind: 'registration'; readonly center: Point; readonly radius: Pt; readonly pen: Pt }

export type MarkSpec =
  | { readonly kind: 'crop'; readonly length: Pt; readonly offset: Pt; readonly pen: Pt }
  | { readonly kind: 'fold'; readonly length: Pt; readonly pen: Pt }
  | { readonly kind: 'registration'; readonly radius: Pt; readonly pen: Pt }

const MIN_MARGIN_FOR_REGISTRATION = mm(8)
const FOLD_DASH: readonly number[] = [3, 3]

const point = (x: number, y: number): Point => ({ x: pt(x), y: pt(y) })

const line = (from: Point, to: Point, pen: Pt, dash: readonly number[] | null) =>
  ({ kind: 'line', from, to, pen, dash }) as const

const cropMarksFor = (trim: Rect, length: Pt, offset: Pt, pen: Pt) => {
  const left = trim.x
  const right = trim.x + trim.w
  const bottom = trim.y
  const top = trim.y + trim.h
  return [
    line(point(left - offset - length, bottom), point(left - offset, bottom), pen, null),
    line(point(left, bottom - offset - length), point(left, bottom - offset), pen, null),
    line(point(right + offset, bottom), point(right + offset + length, bottom), pen, null),
    line(point(right, bottom - offset - length), point(right, bottom - offset), pen, null),
    line(point(left - offset - length, top), point(left - offset, top), pen, null),
    line(point(left, top + offset), point(left, top + offset + length), pen, null),
    line(point(right + offset, top), point(right + offset + length, top), pen, null),
    line(point(right, top + offset), point(right, top + offset + length), pen, null),
  ]
}

const foldMarksFor = (grid: Grid, sheetSize: Size, margin: Pt, length: Pt, pen: Pt) => {
  const marks: ResolvedMark[] = []
  for (let col = 1; col < grid.cols; col += 1) {
    const x = (sheetSize.w * col) / grid.cols
    marks.push(line(point(x, 0), point(x, Math.min(margin, length)), pen, FOLD_DASH))
    marks.push(
      line(point(x, sheetSize.h - Math.min(margin, length)), point(x, sheetSize.h), pen, FOLD_DASH),
    )
  }
  for (let row = 1; row < grid.rows; row += 1) {
    const y = (sheetSize.h * row) / grid.rows
    marks.push(line(point(0, y), point(Math.min(margin, length), y), pen, FOLD_DASH))
    marks.push(
      line(point(sheetSize.w - Math.min(margin, length), y), point(sheetSize.w, y), pen, FOLD_DASH),
    )
  }
  return marks
}

const registrationMarksFor = (sheetSize: Size, margin: Pt, radius: Pt, pen: Pt) => {
  // Метка сидит по центру поля, поэтому радиус больше половины поля вывел бы её на полосу.
  if (margin < MIN_MARGIN_FOR_REGISTRATION || radius > margin / 2) return []
  const inset = margin / 2
  return [
    { kind: 'registration', center: point(sheetSize.w / 2, inset), radius, pen },
    { kind: 'registration', center: point(sheetSize.w / 2, sheetSize.h - inset), radius, pen },
    { kind: 'registration', center: point(inset, sheetSize.h / 2), radius, pen },
    { kind: 'registration', center: point(sheetSize.w - inset, sheetSize.h / 2), radius, pen },
  ] as const
}

/** Разворачивает спецификацию меток в геометрию для конкретного листа. */
export const resolveMarks = (
  sheet: Sheet,
  sheetSize: Size,
  grid: Grid,
  specs: readonly MarkSpec[],
  margin: Pt,
): readonly ResolvedMark[] =>
  specs.flatMap((spec) => {
    if (spec.kind === 'crop') {
      return sheet.placements.flatMap((p) =>
        cropMarksFor(p.trim, spec.length, spec.offset, spec.pen),
      )
    }
    if (spec.kind === 'fold') {
      return foldMarksFor(grid, sheetSize, margin, spec.length, spec.pen)
    }
    return registrationMarksFor(sheetSize, margin, spec.radius, spec.pen)
  })
