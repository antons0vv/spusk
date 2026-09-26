import { describe, expect, it } from 'vitest'
import type { Side } from '../slots.js'
import { bookletOrder } from './booklet.js'

/** Human-readable form: page numbers from one, a blank page is a dash. */
const readable = (sides: readonly Side[]): string[] =>
  sides.map((s) => s.slots.map((x) => (x.kind === 'page' ? String(x.index + 1) : '—')).join('|'))

describe('booklet order', () => {
  it('sixteen pages as one signature', () => {
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

  it('sides alternate front and back', () => {
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

  it('thirteen pages are padded with blanks to a multiple of four', () => {
    const sides = bookletOrder(13, 'all')
    expect(sides).toHaveLength(8)
    expect(readable(sides)[0]).toBe('—|1')
    expect(readable(sides)[3]).toBe('4|13')
  })

  it('eight-page signatures split the document in two', () => {
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

  it('the side index within a signature restarts for each signature', () => {
    expect(bookletOrder(16, 8).map((s) => s.folioSideIndex)).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
  })
})
