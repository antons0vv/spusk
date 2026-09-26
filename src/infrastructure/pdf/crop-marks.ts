import type { Point, Rect } from '../../domain/geometry.js'
import type { CropGeometry } from '../../domain/marks.js'
import { pt } from '../../domain/units.js'

/** A stroked segment in PDF space: origin at bottom left, Y axis up. */
export type Stroke = { readonly from: Point; readonly to: Point; readonly width: number }

/** Tolerance for matching a trim line: PDF generators each round coordinates their own way. */
const ALIGN = 0.1
/** How far the offsets and lengths of strokes in one set of marks may differ. */
const SAME = 0.5

type Found = { readonly offset: number; readonly length: number; readonly width: number }

/**
 * A crop mark stroke lies on the extension of a trim line, entirely outside the page. The key
 * says which corner it stands at and which way it points: each corner has two.
 */
const asMark = (s: Stroke, trim: Rect): { readonly key: string; readonly found: Found } | null => {
  const left = trim.x
  const right = trim.x + trim.w
  const bottom = trim.y
  const top = trim.y + trim.h
  const near = (a: number, b: number) => Math.abs(a - b) <= ALIGN
  if (near(s.from.x, s.to.x)) {
    const x = near(s.from.x, left) ? 'left' : near(s.from.x, right) ? 'right' : null
    const lo = Math.min(s.from.y, s.to.y)
    const hi = Math.max(s.from.y, s.to.y)
    if (x === null || hi - lo <= ALIGN) return null
    if (lo >= top - ALIGN)
      return { key: `top-${x}-v`, found: { offset: lo - top, length: hi - lo, width: s.width } }
    if (hi <= bottom + ALIGN) {
      return {
        key: `bottom-${x}-v`,
        found: { offset: bottom - hi, length: hi - lo, width: s.width },
      }
    }
    return null
  }
  if (near(s.from.y, s.to.y)) {
    const y = near(s.from.y, bottom) ? 'bottom' : near(s.from.y, top) ? 'top' : null
    const lo = Math.min(s.from.x, s.to.x)
    const hi = Math.max(s.from.x, s.to.x)
    if (y === null || hi - lo <= ALIGN) return null
    if (lo >= right - ALIGN)
      return { key: `${y}-right-h`, found: { offset: lo - right, length: hi - lo, width: s.width } }
    if (hi <= left + ALIGN)
      return { key: `${y}-left-h`, found: { offset: left - hi, length: hi - lo, width: s.width } }
  }
  return null
}

const KEYS = ['top', 'bottom'].flatMap((y) =>
  ['left', 'right'].flatMap((x) => [`${y}-${x}-v`, `${y}-${x}-h`]),
)

const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values)
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length

/**
 * Crop marks the file drew itself. They count as marks only if all four corners have both
 * strokes and these share the same offsets and lengths. The stroke is the thinnest line in its
 * place; a thicker one in the same place is the white underlay, which is how InDesign lays them.
 */
export const cropMarksFrom = (strokes: readonly Stroke[], trim: Rect): CropGeometry | null => {
  const byKey = new Map<string, Found[]>()
  for (const s of strokes) {
    const mark = asMark(s, trim)
    if (mark === null) continue
    byKey.set(mark.key, [...(byKey.get(mark.key) ?? []), mark.found])
  }
  const marks: { readonly line: Found; readonly halo: number | null }[] = []
  for (const key of KEYS) {
    const candidates = byKey.get(key)
    if (candidates === undefined) return null
    const line = candidates.reduce((thin, c) => (c.width < thin.width ? c : thin))
    const under = candidates.filter(
      (c) =>
        c.width > line.width &&
        Math.abs(c.offset - line.offset) <= SAME &&
        Math.abs(c.length - line.length) <= SAME,
    )
    marks.push({ line, halo: under.length === 0 ? null : Math.max(...under.map((c) => c.width)) })
  }
  const offsets = marks.map((m) => m.line.offset)
  const lengths = marks.map((m) => m.line.length)
  if (spread(offsets) > SAME || spread(lengths) > SAME) return null
  const halos = marks.flatMap((m) => (m.halo === null ? [] : [m.halo]))
  return {
    offset: pt(Math.max(0, mean(offsets))),
    length: pt(mean(lengths)),
    pen: pt(Math.min(...marks.map((m) => m.line.width))),
    halo: halos.length === marks.length ? pt(Math.min(...halos)) : null,
  }
}
