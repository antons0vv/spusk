import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.js'
import { apply, rect, size } from './geometry.js'
import { buildGrid } from './grid.js'
import { BLANK, page, type Side } from './slots.js'
import { mm, pt } from './units.js'

const A4L = size(841.89, 595.28)
/** A sheet exactly two A5 pages wide: the cell matches the page, centering gives zero. */
const EXACT = size(839.06, 595.28)
const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const oneSide = (slots: Side['slots']): Side[] => [{ slots, side: 'front', folioSideIndex: 0 }]

describe('placement assembly', () => {
  it('at actual size a page sits flush against the cell edge', () => {
    const grid = buildGrid(EXACT, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A5, A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const first = sheets[0]?.placements[0]
    expect(first?.matrix).toEqual([1, 0, 0, 1, 0, 0])
    expect(first?.trim).toEqual({ x: 0, y: 0, w: 419.53, h: 595.28 })
    expect(sheets[0]?.placements[1]?.matrix[4]).toBeCloseTo(419.53, 6)
  })

  it('pages form one block centered on the sheet, not each centered in its own cell', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A5, A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const [left, right] = sheets[0]?.placements ?? []
    if (left === undefined || right === undefined) throw new Error('no placements')
    // The sheet is 2.83 pt wider than the spread: all the spare room goes outward in equal
    // parts, and the seam stays flush.
    expect(left.trim.x).toBeCloseTo((841.89 - 2 * 419.53) / 2, 6)
    expect(right.trim.x).toBeCloseTo(left.trim.x + 419.53, 6)
  })

  it('a booklet spread on a large sheet closes at the spine', () => {
    const A3L = size(1190.55, 841.89)
    const grid = buildGrid(A3L, 1, 2, mm(8), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A5, A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      mm(8),
      pt(0),
    )
    const [left, right] = sheets[0]?.placements ?? []
    if (left === undefined || right === undefined) throw new Error('no placements')
    expect(left.trim.x + left.trim.w).toBeCloseTo(A3L.w / 2, 6)
    expect(right.trim.x).toBeCloseTo(A3L.w / 2, 6)
    expect(left.trim.y).toBeCloseTo((A3L.h - 595.28) / 2, 6)
  })

  it('the gap between pages in the block is exactly the one given', () => {
    const grid = buildGrid(A4L, 2, 2, mm(10), mm(6))
    const card = { trim: rect(0, 0, 255, 141), media: rect(0, 0, 255, 141) }
    const sheets = assemble(
      oneSide([page(0), page(0), page(0), page(0)]),
      grid,
      [card],
      card,
      { bleed: pt(0), scaling: 'actual' },
      mm(10),
      mm(6),
    )
    const [a, b, c] = sheets[0]?.placements ?? []
    if (a === undefined || b === undefined || c === undefined) throw new Error('no placements')
    expect(b.trim.x - (a.trim.x + a.trim.w)).toBeCloseTo(mm(6), 6)
    // Row zero is at the top: the second row sits below the first by a page height and the gap.
    expect(a.trim.y - (c.trim.y + c.trim.h)).toBeCloseTo(mm(6), 6)
  })

  it('“fit” mode scales by the smaller side', () => {
    const grid = buildGrid(A4L, 1, 2, mm(10), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A5, A5],
      A5,
      { bleed: pt(0), scaling: 'fit' },
      mm(10),
      pt(0),
    )
    const m = sheets[0]?.placements[0]?.matrix
    expect(m?.[0]).toBeLessThan(1)
    expect(m?.[0]).toBeCloseTo(m?.[3] ?? 0, 9)
  })

  it('bleed at the spine is limited by half the gap, on the outside by the sheet margin', () => {
    const margin = mm(10)
    const sheet = size(839.06 + 2 * margin, 595.28 + 2 * margin)
    const grid = buildGrid(sheet, 1, 2, margin, pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A5, A5],
      A5,
      { bleed: mm(5), scaling: 'actual' },
      margin,
      pt(0),
    )
    const left = sheets[0]?.placements[0]
    if (left === undefined) throw new Error('no placement')
    // On the right is the neighboring cell with zero gap: no bleed at all.
    expect(left.clip.x + left.clip.w - (left.trim.x + left.trim.w)).toBeCloseTo(0, 6)
    // On the left is the sheet edge: the margin is wider than the requested bleed, so the
    // bleed is kept in full.
    expect(left.trim.x - left.clip.x).toBeCloseTo(mm(5), 6)
  })

  it('an empty slot takes up a cell and gets its own trim size', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([BLANK, page(0)]),
      grid,
      [A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    expect(sheets[0]?.placements[0]?.source).toEqual({ kind: 'blank' })
    expect(sheets[0]?.placements[0]?.trim.w).toBeCloseTo(419.53, 6)
  })

  it('a trim size that does not start at zero is brought to the cell corner', () => {
    const bleed = mm(3)
    const withBleed = {
      trim: rect(bleed, bleed, 419.53, 595.28),
      media: rect(0, 0, 419.53 + 2 * bleed, 595.28 + 2 * bleed),
    }
    const grid = buildGrid(EXACT, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [withBleed, withBleed],
      withBleed,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const first = sheets[0]?.placements[0]
    if (first === undefined) throw new Error('no placement')
    // The matrix must shift the content by minus the origin of the trim size.
    expect(first.matrix[4]).toBeCloseTo(-bleed, 6)
    expect(first.matrix[5]).toBeCloseTo(-bleed, 6)
    // Once the matrix is applied, the trim size's bottom-left corner lands on the trim line corner.
    const corner = apply(first.matrix, { x: pt(bleed), y: pt(bleed) })
    expect(corner.x).toBeCloseTo(first.trim.x, 6)
    expect(corner.y).toBeCloseTo(first.trim.y, 6)
  })

  it('in a booklet a smaller page is pushed to the spine, not left floating mid-slot', () => {
    const A4P = size(595.28, 841.89)
    const A6 = { trim: rect(0, 0, 297.64, 419.53), media: rect(0, 0, 297.64, 419.53) }
    const sheetSize = size(2 * 595.28, 841.89)
    const grid = buildGrid(sheetSize, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A6, { trim: rect(0, 0, A4P.w, A4P.h), media: rect(0, 0, A4P.w, A4P.h) }],
      A6,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
      true,
    )
    const [small, big] = sheets[0]?.placements ?? []
    if (small === undefined || big === undefined) throw new Error('no placements')
    expect(small.trim.x + small.trim.w).toBeCloseTo(sheetSize.w / 2, 6)
    expect(big.trim.x).toBeCloseTo(sheetSize.w / 2, 6)
    // Across the spine the page is centered.
    expect(small.trim.y).toBeCloseTo((841.89 - 419.53) / 2, 6)
  })

  it('with top binding a smaller page is pushed against the horizontal fold', () => {
    const A6L = { trim: rect(0, 0, 419.53, 297.64), media: rect(0, 0, 419.53, 297.64) }
    const A5L = { trim: rect(0, 0, 595.28, 419.53), media: rect(0, 0, 595.28, 419.53) }
    const sheetSize = size(595.28, 2 * 419.53)
    const grid = buildGrid(sheetSize, 2, 1, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0), page(1)]),
      grid,
      [A6L, A5L],
      A6L,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
      true,
    )
    const [top] = sheets[0]?.placements ?? []
    if (top === undefined) throw new Error('no placement')
    expect(top.trim.y).toBeCloseTo(sheetSize.h / 2, 6)
  })
})
