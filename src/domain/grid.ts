import { type Rect, rect, type Size } from './geometry.js'
import type { Pt } from './units.js'

export type Cell = { readonly rect: Rect; readonly row: number; readonly col: number }
export type Grid = { readonly rows: number; readonly cols: number; readonly cells: readonly Cell[] }

/** Builds the cell grid. Order is row by row; row zero is the top of the sheet. */
export const buildGrid = (sheet: Size, rows: number, cols: number, margin: Pt, gap: Pt): Grid => {
  const cellW = (sheet.w - 2 * margin - (cols - 1) * gap) / cols
  const cellH = (sheet.h - 2 * margin - (rows - 1) * gap) / rows
  const cells: Cell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = margin + col * (cellW + gap)
      const y = sheet.h - margin - (row + 1) * cellH - row * gap
      cells.push({ rect: rect(x, y, cellW, cellH), row, col })
    }
  }
  return { rows, cols, cells }
}
