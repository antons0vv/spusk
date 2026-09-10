import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from './make-pdf.js'
import { cellOf, readBack } from './read-back.js'

describe('фикстуры', () => {
  it('генератор делает документ с нужным числом полос', () => {
    const bytes = makeNumberedPdf({ pageCount: 8, width: 419.53, height: 595.28 })
    const sheets = readBack(bytes)
    expect(sheets).toHaveLength(8)
  })

  it('на каждой полосе есть её собственная метка', () => {
    const sheets = readBack(makeNumberedPdf({ pageCount: 3, width: 300, height: 400 }))
    expect(sheets[0]?.labels.some((l) => l.text.includes('P1'))).toBe(true)
    expect(sheets[2]?.labels.some((l) => l.text.includes('P3'))).toBe(true)
  })

  it('обратный разбор определяет ячейку по координатам', () => {
    const sheets = readBack(makeNumberedPdf({ pageCount: 1, width: 400, height: 400 }))
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    expect(cellOf(sheet, 1, 1, 'P1')).toEqual({ row: 0, col: 0 })
  })

  it('вылет расширяет MediaBox относительно TrimBox', () => {
    const bytes = makeNumberedPdf({ pageCount: 1, width: 200, height: 200, bleed: 10 })
    const sheets = readBack(bytes)
    expect(sheets[0]?.width).toBeCloseTo(220, 3)
  })
})
