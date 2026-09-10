import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { isErr, isOk } from '../../domain/result.js'
import { MupdfReader } from './mupdf-reader.js'

const reader = new MupdfReader()

describe('чтение документа', () => {
  it('читает число полос и размеры', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 5, width: 300, height: 400 }))
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value.info.pageCount).toBe(5)
    expect(r.value.info.uniformSize?.w).toBeCloseTo(300, 3)
    reader.close(r.value.handle)
  })

  it('видит TrimBox, когда он есть', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200, bleed: 10 }))
    if (!isOk(r)) throw new Error('не открылось')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(true)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    expect(r.value.info.pages[0]?.media.w).toBeCloseTo(220, 3)
    reader.close(r.value.handle)
  })

  it('без TrimBox обрезным считается CropBox', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200 }))
    if (!isOk(r)) throw new Error('не открылось')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(false)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    reader.close(r.value.handle)
  })

  it('чужой файл отвергается как не PDF', () => {
    const r = reader.open(new TextEncoder().encode('это не pdf'))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('NotAPdf')
  })

  it('обрезанный файл всё равно открывается', () => {
    const full = makeNumberedPdf({ pageCount: 8, width: 200, height: 200 })
    const cut = full.slice(0, Math.floor(full.length * 0.8))
    const r = reader.open(cut)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) reader.close(r.value.handle)
  })
})
