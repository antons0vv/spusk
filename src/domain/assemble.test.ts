import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.js'
import { rect, size } from './geometry.js'
import { buildGrid } from './grid.js'
import { BLANK, page, type Side } from './slots.js'
import { mm, pt } from './units.js'

const A4L = size(841.89, 595.28)
/** Лист ровно в две полосы A5: ячейка совпадает с полосой, центрирование даёт ноль. */
const EXACT = size(839.06, 595.28)
const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const oneSide = (slots: Side['slots']): Side[] => [{ slots, side: 'front', folioSideIndex: 0 }]

describe('сборка размещений', () => {
  it('в натуральную величину полоса встаёт вплотную к краю ячейки', () => {
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

  it('полоса центрируется, когда ячейка шире её', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      oneSide([page(0)]),
      grid,
      [A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    // Ячейка A4L/2 = 420.945 шире полосы 419.53, половина разницы уходит в отступ слева.
    expect(sheets[0]?.placements[0]?.matrix[4]).toBeCloseTo((420.945 - 419.53) / 2, 6)
  })

  it('режим «вписать» масштабирует по меньшей стороне', () => {
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

  it('вылет у корешка ограничен половиной зазора, снаружи — полем листа', () => {
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
    if (left === undefined) throw new Error('нет размещения')
    // Справа соседняя ячейка при нулевом зазоре: вылета нет вовсе.
    expect(left.clip.x + left.clip.w - (left.trim.x + left.trim.w)).toBeCloseTo(0, 6)
    // Слева край листа: поле шире запрошенного вылета, значит вылет сохраняется целиком.
    expect(left.trim.x - left.clip.x).toBeCloseTo(mm(5), 6)
  })

  it('пустой слот занимает ячейку и получает свой обрезной формат', () => {
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
})
