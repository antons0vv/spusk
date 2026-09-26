import { describe, expect, it } from 'vitest'
import { type Rect, rect } from '../../domain/geometry.js'
import { pt } from '../../domain/units.js'
import { cropMarksFrom, type Stroke } from './crop-marks.js'

const TRIM = rect(21, 21, 411, 581)

const stroke = (x0: number, y0: number, x1: number, y1: number, width: number): Stroke => ({
  from: { x: pt(x0), y: pt(y0) },
  to: { x: pt(x1), y: pt(y1) },
  width,
})

/**
 * Marks as InDesign lays them: at each corner a vertical and a horizontal stroke along the
 * extensions of the trim lines, running outward from the offset, each with a white underlay.
 */
const indesign = (
  trim: Rect,
  offset: number,
  length: number,
  pen: number,
  halo: number | null,
  skip: 'topRight' | null = null,
): Stroke[] => {
  const left = trim.x
  const right = trim.x + trim.w
  const bottom = trim.y
  const top = trim.y + trim.h
  const strokes: Stroke[] = []
  for (const [x, outX, nameX] of [
    [left, -1, 'Left'],
    [right, 1, 'Right'],
  ] as const) {
    for (const [y, outY, nameY] of [
      [bottom, -1, 'bottom'],
      [top, 1, 'top'],
    ] as const) {
      if (`${nameY}${nameX}` === skip) continue
      const lines = [
        stroke(x, y + outY * offset, x, y + outY * (offset + length), 0),
        stroke(x + outX * offset, y, x + outX * (offset + length), y, 0),
      ]
      for (const l of lines) {
        if (halo !== null) strokes.push({ ...l, width: halo })
        strokes.push({ ...l, width: pen })
      }
    }
  }
  return strokes
}

describe('crop marks in the file itself', () => {
  it('strokes at four corners give offset, length, stroke weight and underlay', () => {
    const found = cropMarksFrom(indesign(TRIM, 6, 15, 0.25, 1.25), TRIM)
    expect(found?.offset).toBeCloseTo(6, 3)
    expect(found?.length).toBeCloseTo(15, 3)
    expect(found?.pen).toBeCloseTo(0.25, 3)
    expect(found?.halo).toBeCloseTo(1.25, 3)
  })

  it('marks without a white underlay are found, and the underlay is empty', () => {
    const found = cropMarksFrom(indesign(TRIM, 8.5, 12, 0.3, null), TRIM)
    expect(found).not.toBeNull()
    expect(found?.halo).toBeNull()
  })

  it('strokes at only three corners are not crop marks', () => {
    expect(cropMarksFrom(indesign(TRIM, 6, 15, 0.25, 1.25, 'topRight'), TRIM)).toBeNull()
  })

  it('a frame and lines running onto the page neither confuse nor replace the marks', () => {
    const noise = [
      // A frame around the page in the margin, on the trim lines.
      stroke(0, TRIM.y, 453, TRIM.y, 1),
      stroke(TRIM.x, 0, TRIM.x, 623, 1),
      // A content line on the page itself.
      stroke(TRIM.x + 20, TRIM.y + 20, TRIM.x + 200, TRIM.y + 20, 0.5),
    ]
    expect(cropMarksFrom(noise, TRIM)).toBeNull()
    const found = cropMarksFrom([...noise, ...indesign(TRIM, 6, 15, 0.25, 1.25)], TRIM)
    expect(found?.offset).toBeCloseTo(6, 3)
    expect(found?.pen).toBeCloseTo(0.25, 3)
  })

  it('different offsets at the corners are not one set of marks', () => {
    const uneven = [
      ...indesign(TRIM, 6, 15, 0.25, null).slice(0, 4),
      ...indesign(TRIM, 12, 15, 0.25, null).slice(4),
    ]
    expect(cropMarksFrom(uneven, TRIM)).toBeNull()
  })

  it('no strokes means no marks', () => {
    expect(cropMarksFrom([], TRIM)).toBeNull()
  })
})
