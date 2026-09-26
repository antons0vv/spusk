import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { isErr, isOk } from '../../domain/result.js'
import { MupdfReader } from './mupdf-reader.js'
import { MupdfRenderer } from './mupdf-renderer.js'

const reader = new MupdfReader()
const renderer = new MupdfRenderer(reader)

const open = (bytes: Uint8Array) => {
  const r = reader.open(bytes)
  if (!isOk(r)) throw new Error('did not open')
  return r.value
}

const pixelAt = (image: { width: number; pixels: Uint8ClampedArray }, x: number, y: number) => {
  const at = (y * image.width + x) * 4
  return [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2], image.pixels[at + 3]]
}

describe('page raster', () => {
  it('the long side equals the limit; proportions and size in points are preserved', () => {
    const doc = open(makeNumberedPdf({ pageCount: 2, width: 300, height: 400 }))
    const r = renderer.render(doc.handle, 1, 200)
    if (!isOk(r)) throw new Error('did not render')
    expect(r.value.height).toBe(200)
    expect(r.value.width).toBe(150)
    expect(r.value.pixels).toHaveLength(150 * 200 * 4)
    expect(r.value.page.w).toBeCloseTo(300, 3)
    expect(r.value.page.h).toBeCloseTo(400, 3)
    // The fixture background is 0.85 gray; alpha is always opaque.
    const [red, green, blue, alpha] = pixelAt(r.value, 5, 5)
    for (const channel of [red, green, blue]) expect(Math.abs((channel ?? 0) - 217)).toBeLessThan(3)
    expect(alpha).toBe(255)
    reader.close(doc.handle)
  })

  it('edge pixels are fully painted even if the page width is not a whole pixel count', () => {
    // 301 × 400 at a limit of 200 gives a width of 150.5 pixels. A half-covered edge column
    // is lighter than the background and reads in the preview as a seam between adjacent pages.
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 301, height: 400 }))
    const r = renderer.render(doc.handle, 0, 200)
    if (!isOk(r)) throw new Error('did not render')
    const middle = Math.floor(r.value.height / 2)
    for (const x of [0, r.value.width - 1]) {
      const [red] = pixelAt(r.value, x, middle)
      expect(Math.abs((red ?? 0) - 217)).toBeLessThan(3)
    }
    const [bottom] = pixelAt(r.value, 5, r.value.height - 1)
    expect(Math.abs((bottom ?? 0) - 217)).toBeLessThan(3)
    reader.close(doc.handle)
  })

  it('a rotated page renders at its normalized size, as the domain sees it', () => {
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 300, height: 400, rotate: 90 }))
    const r = renderer.render(doc.handle, 0, 200)
    if (!isOk(r)) throw new Error('did not render')
    const trim = doc.info.pages[0]?.trim
    expect(r.value.page.w).toBeCloseTo(trim?.w ?? 0, 3)
    expect(r.value.width).toBe(200)
    expect(r.value.height).toBe(150)
    reader.close(doc.handle)
  })

  it('a cropped page renders by its CropBox', () => {
    const crop = { left: 20, bottom: 0, right: 30, top: 0 }
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 300, height: 400, crop }))
    const r = renderer.render(doc.handle, 0, 400)
    if (!isOk(r)) throw new Error('did not render')
    expect(r.value.page.w).toBeCloseTo(250, 3)
    reader.close(doc.handle)
  })

  it('a closed document gives a failure, not an exception', () => {
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 100, height: 100 }))
    reader.close(doc.handle)
    expect(isErr(renderer.render(doc.handle, 0, 100))).toBe(true)
  })
})
