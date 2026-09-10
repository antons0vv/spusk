import { describe, expect, it } from 'vitest'
import type { Side } from '../slots.js'
import { bookletOrder } from './booklet.js'

/** Человекочитаемая запись: номера полос с единицы, пустая полоса — прочерк. */
const readable = (sides: readonly Side[]): string[] =>
  sides.map((s) => s.slots.map((x) => (x.kind === 'page' ? String(x.index + 1) : '—')).join('|'))

describe('порядок брошюры', () => {
  it('шестнадцать полос одной тетрадью', () => {
    expect(readable(bookletOrder(16, 'all'))).toEqual([
      '16|1',
      '2|15',
      '14|3',
      '4|13',
      '12|5',
      '6|11',
      '10|7',
      '8|9',
    ])
  })

  it('стороны чередуются лицо и оборот', () => {
    expect(bookletOrder(16, 'all').map((s) => s.side)).toEqual([
      'front',
      'back',
      'front',
      'back',
      'front',
      'back',
      'front',
      'back',
    ])
  })

  it('тринадцать полос добиваются пустыми до кратности четырём', () => {
    const sides = bookletOrder(13, 'all')
    expect(sides).toHaveLength(8)
    expect(readable(sides)[0]).toBe('—|1')
    expect(readable(sides)[3]).toBe('4|13')
  })

  it('тетради по восемь полос режут документ на две', () => {
    expect(readable(bookletOrder(16, 8))).toEqual([
      '8|1',
      '2|7',
      '6|3',
      '4|5',
      '16|9',
      '10|15',
      '14|11',
      '12|13',
    ])
  })

  it('индекс стороны внутри тетради считается заново для каждой тетради', () => {
    expect(bookletOrder(16, 8).map((s) => s.folioSideIndex)).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
  })
})
