import { compose, type Matrix, type Point, type Rect, type Size } from '../../domain/geometry.js'
import { pt } from '../../domain/units.js'

/** The sheet on the canvas: how many pixels per point and where the sheet's top-left corner is. */
export type View = { readonly scale: number; readonly x: number; readonly y: number }

export type Box = { readonly w: number; readonly h: number }

/** Fits the sheet into the canvas rectangle, centered. */
export const fitView = (sheet: Size, box: Box): View => {
  const scale = Math.max(0, Math.min(box.w / sheet.w, box.h / sheet.h))
  return { scale, x: (box.w - sheet.w * scale) / 2, y: (box.h - sheet.h * scale) / 2 }
}

/** The sheet in PDF space, Y axis up, onto the canvas, where the Y axis points down. */
export const sheetToCanvas = (sheet: Size, view: View): Matrix => [
  view.scale,
  0,
  0,
  -view.scale,
  pt(view.x),
  pt(view.y + sheet.h * view.scale),
]

export type Raster = { readonly width: number; readonly height: number; readonly page: Size }

/**
 * Page raster pixels onto the canvas. The raster runs top-down over the normalized page,
 * then comes the same placement matrix the writer executes: the preview and the file
 * differ only in resolution.
 */
export const rasterToCanvas = (
  raster: Raster,
  placement: Matrix,
  sheet: Size,
  view: View,
): Matrix => {
  const toPage: Matrix = [
    raster.page.w / raster.width,
    0,
    0,
    -raster.page.h / raster.height,
    pt(0),
    pt(raster.page.h),
  ]
  return compose(compose(toPage, placement), sheetToCanvas(sheet, view))
}

export const pointToCanvas = (p: Point, sheet: Size, view: View): { x: number; y: number } => ({
  x: view.x + p.x * view.scale,
  y: view.y + (sheet.h - p.y) * view.scale,
})

export const rectToCanvas = (r: Rect, sheet: Size, view: View) => ({
  x: view.x + r.x * view.scale,
  y: view.y + (sheet.h - r.y - r.h) * view.scale,
  w: r.w * view.scale,
  h: r.h * view.scale,
})

/**
 * Snaps the raster edges to whole device pixels. Neighboring pages share one trim line;
 * if it runs through the middle of a pixel, both edges paint it partially and a seam
 * shows through between the pages. The shift is at most half a pixel, invisible in a
 * preview. Leaves a rotated matrix alone: its edges don't run along the pixels.
 */
export const snapToPixels = (m: Matrix, width: number, height: number): Matrix => {
  if (m[1] !== 0 || m[2] !== 0) return m
  const x0 = Math.round(m[4])
  const x1 = Math.round(m[0] * width + m[4])
  const y0 = Math.round(m[5])
  const y1 = Math.round(m[3] * height + m[5])
  return [(x1 - x0) / width, 0, 0, (y1 - y0) / height, pt(x0), pt(y0)]
}
