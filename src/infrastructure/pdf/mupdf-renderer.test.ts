import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { isErr, isOk } from '../../domain/result.js'
import { MupdfReader } from './mupdf-reader.js'
import { MupdfRenderer } from './mupdf-renderer.js'

const reader = new MupdfReader()
const renderer = new MupdfRenderer(reader)

const open = (bytes: Uint8Array) => {
  const r = reader.open(bytes)
  if (!isOk(r)) throw new Error('не открылось')
  return r.value
}

const pixelAt = (image: { width: number; pixels: Uint8ClampedArray }, x: number, y: number) => {
  const at = (y * image.width + x) * 4
  return [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2], image.pixels[at + 3]]
}

describe('растр полосы', () => {
  it('длинная сторона равна пределу, пропорции и размер в пунктах сохранены', () => {
    const doc = open(makeNumberedPdf({ pageCount: 2, width: 300, height: 400 }))
    const r = renderer.render(doc.handle, 1, 200)
    if (!isOk(r)) throw new Error('не отрисовалось')
    expect(r.value.height).toBe(200)
    expect(r.value.width).toBe(150)
    expect(r.value.pixels).toHaveLength(150 * 200 * 4)
    expect(r.value.page.w).toBeCloseTo(300, 3)
    expect(r.value.page.h).toBeCloseTo(400, 3)
    // Подложка фикстуры серая 0.85, альфа всегда непрозрачная.
    const [red, green, blue, alpha] = pixelAt(r.value, 5, 5)
    for (const channel of [red, green, blue]) expect(Math.abs((channel ?? 0) - 217)).toBeLessThan(3)
    expect(alpha).toBe(255)
    reader.close(doc.handle)
  })

  it('крайние пиксели растра закрашены целиком, даже если ширина полосы не кратна пикселю', () => {
    // 301 × 400 при пределе 200 даёт ширину 150.5 пикселя. Полупокрытый крайний столбец
    // светлее подложки и в превью читается как шов между соседними полосами.
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 301, height: 400 }))
    const r = renderer.render(doc.handle, 0, 200)
    if (!isOk(r)) throw new Error('не отрисовалось')
    const middle = Math.floor(r.value.height / 2)
    for (const x of [0, r.value.width - 1]) {
      const [red] = pixelAt(r.value, x, middle)
      expect(Math.abs((red ?? 0) - 217)).toBeLessThan(3)
    }
    const [bottom] = pixelAt(r.value, 5, r.value.height - 1)
    expect(Math.abs((bottom ?? 0) - 217)).toBeLessThan(3)
    reader.close(doc.handle)
  })

  it('повёрнутая полоса рисуется в приведённых размерах, как их видит домен', () => {
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 300, height: 400, rotate: 90 }))
    const r = renderer.render(doc.handle, 0, 200)
    if (!isOk(r)) throw new Error('не отрисовалось')
    const trim = doc.info.pages[0]?.trim
    expect(r.value.page.w).toBeCloseTo(trim?.w ?? 0, 3)
    expect(r.value.width).toBe(200)
    expect(r.value.height).toBe(150)
    reader.close(doc.handle)
  })

  it('кропнутая полоса рисуется по кропбоксу', () => {
    const crop = { left: 20, bottom: 0, right: 30, top: 0 }
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 300, height: 400, crop }))
    const r = renderer.render(doc.handle, 0, 400)
    if (!isOk(r)) throw new Error('не отрисовалось')
    expect(r.value.page.w).toBeCloseTo(250, 3)
    reader.close(doc.handle)
  })

  it('закрытый документ даёт отказ, а не исключение', () => {
    const doc = open(makeNumberedPdf({ pageCount: 1, width: 100, height: 100 }))
    reader.close(doc.handle)
    expect(isErr(renderer.render(doc.handle, 0, 100))).toBe(true)
  })
})
