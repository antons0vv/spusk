import { describe, expect, it } from 'vitest'
import { inch, mm, pt, toMm } from './units.js'

describe('units', () => {
  it('millimeters convert to points', () => {
    expect(mm(25.4)).toBeCloseTo(72, 6)
    expect(mm(10)).toBeCloseTo(28.3464567, 6)
  })

  it('inches convert to points', () => {
    expect(inch(1)).toBe(72)
  })

  it('the reverse conversion returns the original value', () => {
    expect(toMm(mm(3))).toBeCloseTo(3, 9)
  })

  it('pt passes the number through as is', () => {
    expect(pt(12.5)).toBe(12.5)
  })
})
