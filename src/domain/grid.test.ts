import { describe, expect, it } from 'vitest'
import { size } from './geometry.js'
import { buildGrid } from './grid.js'
import { pt } from './units.js'

const A4 = size(595.28, 841.89)

describe('cell grid', () => {
  it('a single cell with no margins fills the whole sheet', () => {
    const g = buildGrid(A4, 1, 1, pt(0), pt(0))
    expect(g.cells).toHaveLength(1)
    expect(g.cells[0]?.rect).toEqual({ x: 0, y: 0, w: 595.28, h: 841.89 })
  })

  it('cells run row by row, row zero at the top', () => {
    const g = buildGrid(A4, 2, 2, pt(0), pt(0))
    expect(g.cells.map((c) => [c.row, c.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ])
    const topLeft = g.cells[0]?.rect
    const bottomLeft = g.cells[2]?.rect
    expect(topLeft?.y).toBeCloseTo(841.89 / 2, 6)
    expect(bottomLeft?.y).toBeCloseTo(0, 6)
  })

  it('margins and gaps are subtracted from the usable area', () => {
    const g = buildGrid(A4, 1, 2, pt(20), pt(10))
    const expectedWidth = (595.28 - 40 - 10) / 2
    expect(g.cells[0]?.rect.w).toBeCloseTo(expectedWidth, 6)
    expect(g.cells[0]?.rect.x).toBeCloseTo(20, 6)
    expect(g.cells[1]?.rect.x).toBeCloseTo(20 + expectedWidth + 10, 6)
  })

  it('cell widths, margins and gaps sum to the sheet width', () => {
    const g = buildGrid(A4, 3, 4, pt(15), pt(7))
    const row = g.cells.filter((c) => c.row === 0)
    const total = row.reduce((acc, c) => acc + c.rect.w, 0) + 2 * 15 + 3 * 7
    expect(total).toBeCloseTo(595.28, 6)
  })

  it('margins and gaps are subtracted vertically', () => {
    const g = buildGrid(A4, 2, 1, pt(20), pt(10))
    const expectedHeight = (841.89 - 40 - 10) / 2
    expect(g.cells[0]?.rect.h).toBeCloseTo(expectedHeight, 6)
    // Row zero is the sheet top, so its bottom sits a cell height plus a gap above row one's.
    expect(g.cells[0]?.rect.y).toBeCloseTo(20 + expectedHeight + 10, 6)
    expect(g.cells[1]?.rect.y).toBeCloseTo(20, 6)
  })

  it('cell heights, margins and gaps sum to the sheet height', () => {
    const g = buildGrid(A4, 3, 4, pt(15), pt(7))
    const column = g.cells.filter((c) => c.col === 0)
    const total = column.reduce((acc, c) => acc + c.rect.h, 0) + 2 * 15 + 2 * 7
    expect(total).toBeCloseTo(841.89, 6)
  })
})
