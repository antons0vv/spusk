import { describe, expect, it } from 'vitest'
import { apply, compose, expandRect, IDENTITY, rect, scaling, translation } from './geometry.js'
import { pt } from './units.js'

describe('geometry', () => {
  it('the identity matrix does not move a point', () => {
    expect(apply(IDENTITY, { x: pt(3), y: pt(4) })).toEqual({ x: 3, y: 4 })
  })

  it('a translation is applied', () => {
    const m = translation(pt(10), pt(-5))
    expect(apply(m, { x: pt(1), y: pt(1) })).toEqual({ x: 11, y: -4 })
  })

  it('compose applies the first matrix, then the second', () => {
    const m = compose(scaling(2), translation(pt(10), pt(0)))
    expect(apply(m, { x: pt(3), y: pt(0) })).toEqual({ x: 16, y: 0 })
  })

  it('the reverse order gives a different result', () => {
    const m = compose(translation(pt(10), pt(0)), scaling(2))
    expect(apply(m, { x: pt(3), y: pt(0) })).toEqual({ x: 26, y: 0 })
  })

  it('expandRect expands each side independently', () => {
    const r = expandRect(rect(10, 10, 100, 50), pt(1), pt(2), pt(3), pt(4))
    expect(r).toEqual({ x: 9, y: 8, w: 104, h: 56 })
  })
})
