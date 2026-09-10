import { describe, expect, it } from 'vitest'
import { inch, mm, pt, toMm } from './units.js'

describe('единицы', () => {
  it('миллиметры переводятся в пункты', () => {
    expect(mm(25.4)).toBeCloseTo(72, 6)
    expect(mm(10)).toBeCloseTo(28.3464567, 6)
  })

  it('дюймы переводятся в пункты', () => {
    expect(inch(1)).toBe(72)
  })

  it('обратный перевод возвращает исходное значение', () => {
    expect(toMm(mm(3))).toBeCloseTo(3, 9)
  })

  it('pt пропускает число как есть', () => {
    expect(pt(12.5)).toBe(12.5)
  })
})
