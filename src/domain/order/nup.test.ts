import { describe, expect, it } from 'vitest'
import { nupOrder } from './nup.js'

const readable = (sides: ReturnType<typeof nupOrder>): string[] =>
  sides.map((s) => s.slots.map((x) => (x.kind === 'page' ? String(x.index + 1) : '—')).join(' '))

describe('порядок N-up', () => {
  it('заполнение по строкам сохраняет естественный порядок', () => {
    expect(readable(nupOrder(8, 2, 2, 'rows'))).toEqual(['1 2 3 4', '5 6 7 8'])
  })

  it('заполнение по колонкам переставляет ячейки', () => {
    expect(readable(nupOrder(4, 2, 2, 'cols'))).toEqual(['1 3 2 4'])
  })

  it('последний лист добивается пустыми ячейками', () => {
    expect(readable(nupOrder(3, 2, 2, 'rows'))).toEqual(['1 2 3 —'])
  })

  it('все листы односторонние', () => {
    expect(nupOrder(8, 2, 2, 'rows').every((s) => s.side === 'single')).toBe(true)
  })
})
