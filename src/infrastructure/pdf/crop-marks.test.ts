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
 * Метки так, как их кладёт InDesign: у каждого угла вертикальный и горизонтальный штрих
 * по продолжению линий реза, наружу от отступа, под каждым — белая подложка.
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

describe('метки реза в самом файле', () => {
  it('штрихи у четырёх углов дают отступ, длину, перо и подложку', () => {
    const found = cropMarksFrom(indesign(TRIM, 6, 15, 0.25, 1.25), TRIM)
    expect(found?.offset).toBeCloseTo(6, 3)
    expect(found?.length).toBeCloseTo(15, 3)
    expect(found?.pen).toBeCloseTo(0.25, 3)
    expect(found?.halo).toBeCloseTo(1.25, 3)
  })

  it('метки без белой подложки находятся, подложка пустая', () => {
    const found = cropMarksFrom(indesign(TRIM, 8.5, 12, 0.3, null), TRIM)
    expect(found).not.toBeNull()
    expect(found?.halo).toBeNull()
  })

  it('штрихи только у трёх углов — не метки реза', () => {
    expect(cropMarksFrom(indesign(TRIM, 6, 15, 0.25, 1.25, 'topRight'), TRIM)).toBeNull()
  })

  it('рамка и линии, заходящие на полосу, не сбивают и не заменяют метки', () => {
    const noise = [
      // Рамка вокруг полосы в поле, на линиях реза.
      stroke(0, TRIM.y, 453, TRIM.y, 1),
      stroke(TRIM.x, 0, TRIM.x, 623, 1),
      // Линия содержимого на самой полосе.
      stroke(TRIM.x + 20, TRIM.y + 20, TRIM.x + 200, TRIM.y + 20, 0.5),
    ]
    expect(cropMarksFrom(noise, TRIM)).toBeNull()
    const found = cropMarksFrom([...noise, ...indesign(TRIM, 6, 15, 0.25, 1.25)], TRIM)
    expect(found?.offset).toBeCloseTo(6, 3)
    expect(found?.pen).toBeCloseTo(0.25, 3)
  })

  it('разные отступы у углов — это не один набор меток', () => {
    const uneven = [
      ...indesign(TRIM, 6, 15, 0.25, null).slice(0, 4),
      ...indesign(TRIM, 12, 15, 0.25, null).slice(4),
    ]
    expect(cropMarksFrom(uneven, TRIM)).toBeNull()
  })

  it('без штрихов меток нет', () => {
    expect(cropMarksFrom([], TRIM)).toBeNull()
  })
})
