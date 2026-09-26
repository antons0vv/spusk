import { describe, expect, it } from 'vitest'
import { stepRepeatOrder } from './step-repeat.js'

describe('step and repeat order', () => {
  it('a single page fills the whole grid with copies', () => {
    const sides = stepRepeatOrder(1, 2, 2, 4)
    expect(sides).toHaveLength(1)
    expect(sides[0]?.slots.every((s) => s.kind === 'page' && s.index === 0)).toBe(true)
  })

  it('more copies than cells adds a sheet', () => {
    const sides = stepRepeatOrder(1, 2, 2, 6)
    expect(sides).toHaveLength(2)
    const second = sides[1]?.slots.map((s) => s.kind)
    expect(second).toEqual(['page', 'page', 'blank', 'blank'])
  })

  it('each source page gets its own sheets', () => {
    const sides = stepRepeatOrder(2, 1, 2, 2)
    expect(sides).toHaveLength(2)
    expect(sides[0]?.slots[0]).toEqual({ kind: 'page', index: 0 })
    expect(sides[1]?.slots[0]).toEqual({ kind: 'page', index: 1 })
  })
})
