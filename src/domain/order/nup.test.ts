import { describe, expect, it } from 'vitest'
import { nupOrder } from './nup.js'

const readable = (sides: ReturnType<typeof nupOrder>): string[] =>
  sides.map((s) => s.slots.map((x) => (x.kind === 'page' ? String(x.index + 1) : '—')).join(' '))

describe('N-up order', () => {
  it('filling by rows keeps the natural order', () => {
    expect(readable(nupOrder(8, 2, 2, 'rows'))).toEqual(['1 2 3 4', '5 6 7 8'])
  })

  it('filling by columns reorders the cells', () => {
    expect(readable(nupOrder(4, 2, 2, 'cols'))).toEqual(['1 3 2 4'])
  })

  it('the last sheet is padded with empty cells', () => {
    expect(readable(nupOrder(3, 2, 2, 'rows'))).toEqual(['1 2 3 —'])
  })

  it('all sheets are single-sided', () => {
    expect(nupOrder(8, 2, 2, 'rows').every((s) => s.side === 'single')).toBe(true)
  })
})
