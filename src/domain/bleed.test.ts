import { describe, expect, it } from 'vitest'
import { fileBleed } from './bleed.js'
import { rect, size } from './geometry.js'
import type { DocumentInfo, SourcePage } from './job.js'
import { pt } from './units.js'

const page = (bleed: SourcePage['bleed']): SourcePage => ({
  trim: rect(20, 20, 200, 300),
  media: rect(0, 0, 240, 340),
  hasTrimBox: true,
  bleed,
})

const doc = (pages: readonly SourcePage[]): DocumentInfo => ({
  pageCount: pages.length,
  pages,
  uniformSize: size(200, 300),
})

describe('вылет из файла', () => {
  it('равен запасу от линии реза до BleedBox', () => {
    expect(fileBleed(doc([page(rect(11.5, 11.5, 217, 317))]))).toBeCloseTo(8.5, 6)
  })

  it('берётся по самой узкой стороне: несимметричный вылет не должен вылезти белым', () => {
    expect(fileBleed(doc([page(rect(11.5, 17, 214, 311.5))]))).toBeCloseTo(3, 6)
  })

  it('берётся по самой бедной полосе документа', () => {
    const wide = page(rect(11.5, 11.5, 217, 317))
    const narrow = page(rect(17, 17, 206, 306))
    expect(fileBleed(doc([wide, narrow, wide]))).toBeCloseTo(3, 6)
  })

  it('полоса без BleedBox обнуляет вылет документа', () => {
    expect(fileBleed(doc([page(rect(11.5, 11.5, 217, 317)), page(null)]))).toBe(pt(0))
  })

  it('BleedBox внутри линии реза не даёт отрицательного вылета', () => {
    expect(fileBleed(doc([page(rect(25, 25, 190, 290))]))).toBe(pt(0))
  })
})
