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

type Room = { readonly w: number; readonly h: number }

/**
 * Slot for one page: the largest page of the document at its scale. Computed over the whole
 * document, not per sheet, otherwise the trim lines of a stack of sheets would drift apart.
 */
const slotSizeOf = (pages: readonly PageGeometry[], source: SourceSpec, cell: Cell): Room =>
  pages.reduce(
    (acc, geom) => {
      const scale = scaleFor(source, geom, cell)
      return { w: Math.max(acc.w, geom.trim.w * scale), h: Math.max(acc.h, geom.trim.h * scale) }
    },
    { w: 0, h: 0 },
  )

/**
 * Slot rectangle for a cell. Pages sit as one block with the given gap, and the block is
 * centered on the sheet: otherwise the spare room in the cells would open up as slits between
 * pages, a booklet spread would not close at the spine, and every cut would need its own line.
 */
const slotRectFor = (cell: Cell, grid: Grid, slot: Room, gap: Pt): Rect => {
  const first = grid.cells[0]
  const last = grid.cells[grid.cells.length - 1]
  if (first === undefined || last === undefined) return cell.rect
  const centerX = (first.rect.x + last.rect.x + last.rect.w) / 2
  const centerY = (last.rect.y + first.rect.y + first.rect.h) / 2
  const blockW = grid.cols * slot.w + (grid.cols - 1) * gap
  const blockH = grid.rows * slot.h + (grid.rows - 1) * gap
  return rect(
    centerX - blockW / 2 + cell.col * (slot.w + gap),
    centerY + blockH / 2 - (cell.row + 1) * slot.h - cell.row * gap,
    slot.w,
    slot.h,
  )
}

const placeOne = (
  slot: Slot,
  cell: Cell,
  grid: Grid,
  geom: PageGeometry,
  source: SourceSpec,
  margin: Pt,
  gap: Pt,
  place: Rect,
  folded: boolean,
): Placement => {
  const scale = scaleFor(source, geom, cell)
  const placedW = geom.trim.w * scale
  const placedH = geom.trim.h * scale
  // A page smaller than its slot (a mixed-size document) sits in the center of its slot. In a
  // folded scheme it is pushed against the spine: otherwise after folding it would not reach
  // the binding. Across the spine it stays centered.
  const spareX = place.w - placedW
  const spareY = place.h - placedH
  const alongX = !folded || grid.cols === 1 ? spareX / 2 : cell.col === 0 ? spareX : 0
  const alongY = !folded || grid.rows === 1 ? spareY / 2 : cell.row === 0 ? 0 : spareY
  const originX = place.x + alongX
  const originY = place.y + alongY

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

/** Turns the page order and the grid into physical placements on sheets. */
export const assemble = (
  sides: readonly Side[],
  grid: Grid,
  pages: readonly PageGeometry[],
  reference: PageGeometry,
  source: SourceSpec,
  margin: Pt,
  gap: Pt,
  folded = false,
): readonly Sheet[] => {
  const firstCell = grid.cells[0]
  const slot =
    firstCell === undefined ? { w: 0, h: 0 } : slotSizeOf([...pages, reference], source, firstCell)
  return sides.map((side) => ({
    placements: side.slots.flatMap((s, i) => {
      const cell = grid.cells[i]
      if (cell === undefined) return []
      return [
        placeOne(
          s,
          cell,
          grid,
          geometryFor(s, pages, reference),
          source,
          margin,
          gap,
          slotRectFor(cell, grid, slot, gap),
          folded,
        ),
      ]
    }),
    side: side.side,
    folioSideIndex: side.folioSideIndex,
    marks: [],
  }))
}
