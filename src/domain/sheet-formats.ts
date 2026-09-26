import { type Size, size } from './geometry.js'
import { buildGrid } from './grid.js'
import type { DocumentInfo, Job } from './job.js'
import { gridShapeFor, plan } from './plan.js'
import { isOk } from './result.js'
import { mm } from './units.js'

export type FormatName = 'a4' | 'sra4' | 'a3' | 'sra3'
export type Orientation = 'portrait' | 'landscape'

/** Formats in portrait orientation, from smallest to largest. */
export const FORMATS: Readonly<Record<FormatName, Size>> = {
  a4: size(mm(210), mm(297)),
  sra4: size(mm(225), mm(320)),
  a3: size(mm(297), mm(420)),
  sra3: size(mm(320), mm(450)),
}

export const FORMAT_NAMES: readonly FormatName[] = ['a4', 'sra4', 'a3', 'sra3']

export const oriented = (format: Size, orientation: Orientation): Size => {
  const short = Math.min(format.w, format.h)
  const long = Math.max(format.w, format.h)
  return orientation === 'portrait' ? size(short, long) : size(long, short)
}

export type SheetChoice = {
  readonly format: FormatName
  readonly orientation: Orientation
  readonly size: Size
}

/** How many times over the largest page would fit in a cell: more means roomier. */
export const roominess = (job: Job, doc: DocumentInfo, sheet: Size): number => {
  const { rows, cols } = gridShapeFor(job.scheme)
  const cell = buildGrid(sheet, rows, cols, job.sheet.margin, job.sheet.gap).cells[0]
  if (cell === undefined) return 0
  const maxW = Math.max(...doc.pages.map((p) => p.trim.w))
  const maxH = Math.max(...doc.pages.map((p) => p.trim.h))
  return Math.min(cell.rect.w / maxW, cell.rect.h / maxH)
}

/**
 * The smallest standard format the plan can be built on. Suitability is decided by the
 * planner itself, not by a separate check: the “fits” rule lives in one place.
 * Of two suitable orientations, the one where the page has more room is taken: a portrait
 * page goes on a portrait sheet, a booklet spread on a landscape one. If nothing is suitable,
 * the largest format is returned, and the plan itself will say why.
 */
export const pickSheet = (job: Job, doc: DocumentInfo): SheetChoice => {
  let fallback: SheetChoice | null = null
  for (const format of FORMAT_NAMES) {
    const candidates = (['portrait', 'landscape'] as const)
      .map((orientation) => {
        const sheetSize = oriented(FORMATS[format], orientation)
        const withSheet: Job = { ...job, sheet: { ...job.sheet, size: sheetSize } }
        return {
          choice: { format, orientation, size: sheetSize },
          fits: isOk(plan(withSheet, doc)),
          room: roominess(withSheet, doc, sheetSize),
        }
      })
      .sort((a, b) => b.room - a.room)
    const best = candidates.find((c) => c.fits)
    if (best !== undefined) return best.choice
    fallback = candidates[0]?.choice ?? fallback
  }
  return fallback ?? { format: 'sra3', orientation: 'portrait', size: FORMATS.sra3 }
}
