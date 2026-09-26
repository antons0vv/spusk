import type { DocumentInfo } from './job.js'
import { type Pt, pt } from './units.js'

/**
 * The bleed the file actually has: the smallest distance from the trim line to the BleedBox
 * across all sides of all pages. The narrowest edge wins, otherwise it would show a white
 * strip after cutting. A page without a BleedBox zeroes the bleed: in such files the space
 * beyond the trim line is often taken up by marks and margins, and must not print as bleed.
 */
export const fileBleed = (doc: DocumentInfo): Pt => {
  if (doc.pages.length === 0) return pt(0)
  let least = Number.POSITIVE_INFINITY
  for (const { trim, bleed } of doc.pages) {
    if (bleed === null) return pt(0)
    least = Math.min(
      least,
      trim.x - bleed.x,
      trim.y - bleed.y,
      bleed.x + bleed.w - (trim.x + trim.w),
      bleed.y + bleed.h - (trim.y + trim.h),
    )
  }
  return pt(Math.max(0, least))
}
