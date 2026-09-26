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
  cropMarks: null,
})

describe('bleed from the file', () => {
  it('equals the distance from the trim line to the BleedBox', () => {
    expect(fileBleed(doc([page(rect(11.5, 11.5, 217, 317))]))).toBeCloseTo(8.5, 6)
  })

  it('is taken from the narrowest side: asymmetric bleed must not show white', () => {
    expect(fileBleed(doc([page(rect(11.5, 17, 214, 311.5))]))).toBeCloseTo(3, 6)
  })

  it('is taken from the page with the least bleed in the document', () => {
    const wide = page(rect(11.5, 11.5, 217, 317))
    const narrow = page(rect(17, 17, 206, 306))
    expect(fileBleed(doc([wide, narrow, wide]))).toBeCloseTo(3, 6)
  })

  it('a page without a BleedBox zeroes the document bleed', () => {
    expect(fileBleed(doc([page(rect(11.5, 11.5, 217, 317)), page(null)]))).toBe(pt(0))
  })

  it('a BleedBox inside the trim line does not give negative bleed', () => {
    expect(fileBleed(doc([page(rect(25, 25, 190, 290))]))).toBe(pt(0))
  })
})
