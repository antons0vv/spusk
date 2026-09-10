import {
  compose,
  expandRect,
  type Matrix,
  type Rect,
  rect,
  scaling,
  translation,
} from './geometry.js'
import type { Cell, Grid } from './grid.js'
import type { ResolvedMark } from './marks.js'
import type { SheetSide, Side, Slot } from './slots.js'
import { type Pt, pt } from './units.js'

export type PageGeometry = { readonly trim: Rect; readonly media: Rect }
export type SourceSpec = { readonly bleed: Pt; readonly scaling: 'actual' | 'fit' }

export type Placement = {
  readonly source: Slot
  readonly matrix: Matrix
  readonly trim: Rect
  readonly clip: Rect
}

export type Sheet = {
  readonly placements: readonly Placement[]
  readonly side: SheetSide
  readonly folioSideIndex: number
  readonly marks: readonly ResolvedMark[]
}

const geometryFor = (
  slot: Slot,
  pages: readonly PageGeometry[],
  reference: PageGeometry,
): PageGeometry => {
  if (slot.kind === 'blank') return reference
  return pages[slot.index] ?? reference
}

const scaleFor = (source: SourceSpec, geom: PageGeometry, cell: Cell): number => {
  if (source.scaling === 'actual') return 1
  return Math.min(cell.rect.w / geom.trim.w, cell.rect.h / geom.trim.h)
}

const bleedForEdge = (atSheetEdge: boolean, margin: Pt, gap: Pt, wanted: number): Pt =>
  pt(Math.min(wanted, atSheetEdge ? margin : gap / 2))

const placeOne = (
  slot: Slot,
  cell: Cell,
  grid: Grid,
  geom: PageGeometry,
  source: SourceSpec,
  margin: Pt,
  gap: Pt,
): Placement => {
  const scale = scaleFor(source, geom, cell)
  const placedW = geom.trim.w * scale
  const placedH = geom.trim.h * scale
  const originX = cell.rect.x + (cell.rect.w - placedW) / 2
  const originY = cell.rect.y + (cell.rect.h - placedH) / 2

  const matrix = compose(
    compose(translation(pt(-geom.trim.x), pt(-geom.trim.y)), scaling(scale)),
    translation(pt(originX), pt(originY)),
  )
  const trim = rect(originX, originY, placedW, placedH)
  const wanted = source.bleed * scale
  const clip = expandRect(
    trim,
    bleedForEdge(cell.col === 0, margin, gap, wanted),
    bleedForEdge(cell.row === grid.rows - 1, margin, gap, wanted),
    bleedForEdge(cell.col === grid.cols - 1, margin, gap, wanted),
    bleedForEdge(cell.row === 0, margin, gap, wanted),
  )
  return { source: slot, matrix, trim, clip }
}

/** Превращает порядок полос и сетку в физические размещения на листах. */
export const assemble = (
  sides: readonly Side[],
  grid: Grid,
  pages: readonly PageGeometry[],
  reference: PageGeometry,
  source: SourceSpec,
  margin: Pt,
  gap: Pt,
): readonly Sheet[] =>
  sides.map((side) => ({
    placements: side.slots.flatMap((slot, i) => {
      const cell = grid.cells[i]
      if (cell === undefined) return []
      return [placeOne(slot, cell, grid, geometryFor(slot, pages, reference), source, margin, gap)]
    }),
    side: side.side,
    folioSideIndex: side.folioSideIndex,
    marks: [],
  }))
