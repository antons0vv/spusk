import { type Pt, pt } from './units.js'

export type Size = { readonly w: Pt; readonly h: Pt }
export type Point = { readonly x: Pt; readonly y: Pt }
export type Rect = { readonly x: Pt; readonly y: Pt; readonly w: Pt; readonly h: Pt }

/** Матрица PDF: [a b c d e f]. */
export type Matrix = readonly [number, number, number, number, Pt, Pt]

export const size = (w: number, h: number): Size => ({ w: pt(w), h: pt(h) })
export const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x: pt(x),
  y: pt(y),
  w: pt(w),
  h: pt(h),
})

export const IDENTITY: Matrix = [1, 0, 0, 1, pt(0), pt(0)]

export const translation = (dx: Pt, dy: Pt): Matrix => [1, 0, 0, 1, dx, dy]
export const scaling = (s: number): Matrix => [s, 0, 0, s, pt(0), pt(0)]

/** Композиция: сначала a, потом b. */
// biome-ignore lint/suspicious/noThenProperty: функция специально называется then для API композиции матриц
export const then = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  pt(a[4] * b[0] + a[5] * b[2] + b[4]),
  pt(a[4] * b[1] + a[5] * b[3] + b[5]),
]

export const apply = (m: Matrix, p: Point): Point => ({
  x: pt(m[0] * p.x + m[2] * p.y + m[4]),
  y: pt(m[1] * p.x + m[3] * p.y + m[5]),
})

export const expandRect = (r: Rect, left: Pt, bottom: Pt, right: Pt, top: Pt): Rect => ({
  x: pt(r.x - left),
  y: pt(r.y - bottom),
  w: pt(r.w + left + right),
  h: pt(r.h + bottom + top),
})
