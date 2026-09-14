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
    }
  | { readonly kind: 'registration'; readonly center: Point; readonly radius: Pt; readonly pen: Pt }

export type MarkSpec =
  | { readonly kind: 'crop'; readonly length: Pt; readonly offset: Pt; readonly pen: Pt }
  | { readonly kind: 'fold'; readonly length: Pt; readonly pen: Pt }
  | { readonly kind: 'registration'; readonly radius: Pt; readonly pen: Pt }

/** Метки приводки ставятся только в поле не уже этого: иначе круг ляжет на полосу. */
export const MIN_MARGIN_FOR_REGISTRATION_MM = 8
const MIN_MARGIN_FOR_REGISTRATION = mm(MIN_MARGIN_FOR_REGISTRATION_MM)
const FOLD_DASH: readonly number[] = [3, 3]

const point = (x: number, y: number): Point => ({ x: pt(x), y: pt(y) })

const line = (from: Point, to: Point, pen: Pt, dash: readonly number[] | null) =>
  ({ kind: 'line', from, to, pen, dash }) as const

/** Сотая пункта: с этой точностью совпадают линии реза соседних полос при нулевом зазоре. */
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
 * Рамка всех ячеек листа, включая пустые: штрихи стоят на одних местах на всех листах
 * серии, а гильотина всё равно режет через весь лист.
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
 * Линии реза листа. В n-up и нарезке их дают только занятые ячейки: линия вокруг одной
 * пустоты резчику не нужна. В сфальцованной схеме внутренние границы сетки — сгиб, а не рез, поэтому
 * края полос, обращённые к корешку, линий не дают при любом зазоре.
 */
const cutLinesOf = (sheet: Sheet, grid: Grid, folded: boolean) => {
  const xs: number[] = []
  const ys: number[] = []
  sheet.placements.forEach((placement, i) => {
    const cell = grid.cells[i]
    // Пустая ячейка n-up — отход, резать вокруг неё нечего. Пустая полоса брошюры — страница
    // тетради: после фальцовки её край обрезается вместе с остальными.
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
 * Штрих от края блока наружу: начинается на отступе, тянется на длину и обрезается
 * краем листа. Если до края листа не хватает даже отступа, штриха нет.
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
 * Метки реза по линиям реза, а не вокруг полос: каждая линия отмечается штрихом в поле
 * листа с обоих концов, внутри блока полос меток нет. Так их ставят программы спуска,
 * разбор в docs/crop-marks-research.md.
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
  const { offset, length, pen } = spec
  for (const x of xs) {
    for (const [edge, direction] of [
      [block.top, 1],
      [block.bottom, -1],
    ] as const) {
      const span = outward(edge, direction, offset, length, sheetSize.h)
      if (span !== null) marks.push(line(point(x, span[0]), point(x, span[1]), pen, null))
    }
  }
  for (const y of ys) {
    for (const [edge, direction] of [
      [block.right, 1],
      [block.left, -1],
    ] as const) {
      const span = outward(edge, direction, offset, length, sheetSize.w)
      if (span !== null) marks.push(line(point(span[0], y), point(span[1], y), pen, null))
    }
  }
  return marks
}

/**
 * Линия сгиба идёт по границе соседних ячеек, а не по доле листа: доли совпадают
 * с ячейками только при двух колонках, при трёх и больше метка уехала бы от реального
 * стыка. При ненулевом зазоре граница — середина зазора.
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

/**
 * Разворачивает спецификацию меток в геометрию для конкретного листа. `folded` —
 * лист фальцуют (брошюра и тетради): только там есть сгиб, который метят пунктиром
 * и который не режут.
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
      // Границы ячеек в n-up и нарезке режут, а не фальцуют: пунктир там сбил бы резчика.
      return folded ? foldMarksFor(grid, sheetSize, margin, spec.length, spec.pen) : []
    }
    return registrationMarksFor(sheetSize, margin, spec.radius, spec.pen)
  })
