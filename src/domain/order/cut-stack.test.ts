import { describe, expect, it } from 'vitest'
import { cutStackOrder } from './cut-stack.js'

const readable = (sides: ReturnType<typeof cutStackOrder>): string[] =>
  sides.map((s) => s.slots.map((x) => (x.kind === 'page' ? String(x.index + 1) : '—')).join(' '))

describe('cut and stack order', () => {
  it('sixteen pages in four stacks', () => {
    expect(readable(cutStackOrder(16, 2, 2))).toEqual([
      '1 5 9 13',
      '2 6 10 14',
      '3 7 11 15',
      '4 8 12 16',
    ])
  })

  it('after cutting each stack runs in sequence', () => {
    const sides = cutStackOrder(16, 2, 2)
    for (let stack = 0; stack < 4; stack += 1) {
      const column = sides.map((s) => s.slots[stack])
      const numbers = column.map((s) => (s?.kind === 'page' ? s.index : -1))
      expect(numbers).toEqual([stack * 4, stack * 4 + 1, stack * 4 + 2, stack * 4 + 3])
    }
  })

  it('an incomplete tail leaves empty cells in the last stack', () => {
    expect(readable(cutStackOrder(6, 1, 2))).toEqual(['1 4', '2 5', '3 6'])
    expect(readable(cutStackOrder(5, 1, 2))).toEqual(['1 4', '2 5', '3 —'])
  })
})
