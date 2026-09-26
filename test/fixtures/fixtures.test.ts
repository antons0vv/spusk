import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from './make-pdf.js'
import { cellOf, readBack } from './read-back.js'

describe('fixtures', () => {
  it('the generator makes a document with the requested number of pages', () => {
    const bytes = makeNumberedPdf({ pageCount: 8, width: 419.53, height: 595.28 })
    const sheets = readBack(bytes)
    expect(sheets).toHaveLength(8)
  })

  it('every page has its own label', () => {
    const sheets = readBack(makeNumberedPdf({ pageCount: 3, width: 300, height: 400 }))
    expect(sheets[0]?.labels.some((l) => l.text.includes('P1'))).toBe(true)
    expect(sheets[2]?.labels.some((l) => l.text.includes('P3'))).toBe(true)
  })

  it('the read-back finds the cell by coordinates', () => {
    const sheets = readBack(makeNumberedPdf({ pageCount: 1, width: 400, height: 400 }))
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('no sheet')
    expect(cellOf(sheet, 1, 1, 'P1')).toEqual({ row: 0, col: 0 })
  })

  it('the read-back treats row zero as the top of the sheet', () => {
    const sheets = readBack(makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }))
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('no sheet')
    // The top- and bottom- labels sit at opposite edges of one page, so when it is read as
    // two rows they must fall into different rows.
    expect(cellOf(sheet, 2, 1, 'top-P1')).toEqual({ row: 0, col: 0 })
    expect(cellOf(sheet, 2, 1, 'bottom-P1')).toEqual({ row: 1, col: 0 })
  })

  it('bleed widens the MediaBox relative to the TrimBox', () => {
    const bytes = makeNumberedPdf({ pageCount: 1, width: 200, height: 200, bleed: 10 })
    const sheets = readBack(bytes)
    expect(sheets[0]?.width).toBeCloseTo(220, 3)
  })
})
