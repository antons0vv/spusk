import { describe, expect, it } from 'vitest'
import { apply, expandRect, IDENTITY, rect, scaling, then, translation } from './geometry.js'
import { pt } from './units.js'

describe('геометрия', () => {
  it('единичная матрица не двигает точку', () => {
    expect(apply(IDENTITY, { x: pt(3), y: pt(4) })).toEqual({ x: 3, y: 4 })
  })

  it('сдвиг применяется', () => {
    const m = translation(pt(10), pt(-5))
    expect(apply(m, { x: pt(1), y: pt(1) })).toEqual({ x: 11, y: -4 })
  })

  it('then применяет сначала первую матрицу, потом вторую', () => {
    const m = then(scaling(2), translation(pt(10), pt(0)))
    expect(apply(m, { x: pt(3), y: pt(0) })).toEqual({ x: 16, y: 0 })
  })

  it('обратный порядок даёт другой результат', () => {
    const m = then(translation(pt(10), pt(0)), scaling(2))
    expect(apply(m, { x: pt(3), y: pt(0) })).toEqual({ x: 26, y: 0 })
  })

  it('expandRect расширяет по каждой стороне отдельно', () => {
    const r = expandRect(rect(10, 10, 100, 50), pt(1), pt(2), pt(3), pt(4))
    expect(r).toEqual({ x: 9, y: 8, w: 104, h: 56 })
  })
})
