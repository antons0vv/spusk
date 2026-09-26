import { describe, expect, it } from 'vitest'
import { apply, type Matrix, size } from '../../domain/geometry.js'
import type { DocumentInfo, Job } from '../../domain/job.js'
import { plan } from '../../domain/plan.js'
import { mm, pt } from '../../domain/units.js'
import { fitView, rasterToCanvas, rectToCanvas, snapToPixels } from './transform.js'

const A4_LANDSCAPE = size(mm(297), mm(210))

const doc: DocumentInfo = {
  pageCount: 4,
  pages: Array.from({ length: 4 }, () => ({
    trim: { x: pt(0), y: pt(0), w: mm(148.5), h: mm(210) },
    media: { x: pt(0), y: pt(0), w: mm(148.5), h: mm(210) },
    hasTrimBox: false,
    bleed: null,
  })),
  uniformSize: size(mm(148.5), mm(210)),
  cropMarks: null,
}

const job: Job = {
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
  sheet: { size: A4_LANDSCAPE, margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
}

const at = (m: Parameters<typeof apply>[0], x: number, y: number) => {
  const p = apply(m, { x: pt(x), y: pt(y) })
  return { x: p.x, y: p.y }
}

describe('page raster on the canvas', () => {
  it('the sheet is fitted in the center', () => {
    const view = fitView(A4_LANDSCAPE, { w: 1000, h: 1000 })
    expect(view.x).toBeCloseTo(0, 6)
    expect(view.y).toBeCloseTo((1000 - (210 / 297) * 1000) / 2, 6)
  })

  it('raster corners of the right page of a spread land on the corners of its trim line', () => {
    const built = plan(job, doc)
    if (!built.ok) throw new Error('plan not built')
    const right = built.value.sheets[0]?.placements[1]
    if (right === undefined) throw new Error('no placement')
    const view = fitView(A4_LANDSCAPE, { w: 1188, h: 840 })
    const raster = { width: 297, height: 420, page: size(mm(148.5), mm(210)) }
    const m = rasterToCanvas(raster, right.matrix, A4_LANDSCAPE, view)
    const trim = rectToCanvas(right.trim, A4_LANDSCAPE, view)

    const topLeft = at(m, 0, 0)
    expect(topLeft.x).toBeCloseTo(trim.x, 6)
    expect(topLeft.y).toBeCloseTo(trim.y, 6)
    expect(topLeft.x).toBeCloseTo(594, 6)

    const bottomRight = at(m, raster.width, raster.height)
    expect(bottomRight.x).toBeCloseTo(trim.x + trim.w, 6)
    expect(bottomRight.y).toBeCloseTo(trim.y + trim.h, 6)
  })

  it('raster edges snap to whole pixels, neighboring pages meet without a seam', () => {
    const left = snapToPixels([0.3337, 0, 0, -0.3337, pt(10.4), pt(300.6)], 900, 900)
    const right = snapToPixels(
      [0.3337, 0, 0, -0.3337, pt(10.4 + 0.3337 * 900), pt(300.6)],
      900,
      900,
    )
    const leftEdge = left[0] * 900 + left[4]
    expect(Number.isInteger(left[4])).toBe(true)
    expect(Number.isInteger(leftEdge)).toBe(true)
    expect(right[4]).toBe(leftEdge)
    expect(Number.isInteger(left[3] * 900 + left[5])).toBe(true)
  })

  it('leaves a rotated matrix alone', () => {
    const turned: Matrix = [0, 1, -1, 0, pt(3.5), pt(2.5)]
    expect(snapToPixels(turned, 10, 10)).toEqual(turned)
  })
})
