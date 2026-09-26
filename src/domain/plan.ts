import { assemble, type PageGeometry, type Sheet } from './assemble.js'
import { applyCreep, creepShift } from './creep.js'
import { rect, type Size } from './geometry.js'
import { buildGrid } from './grid.js'
import type { DocumentInfo, Job, Scheme, SourcePage } from './job.js'
import { resolveMarks } from './marks.js'
import { bookletOrder } from './order/booklet.js'
import { cutStackOrder } from './order/cut-stack.js'
import { nupOrder } from './order/nup.js'
import { stepRepeatOrder } from './order/step-repeat.js'
import { err, ok, type Result } from './result.js'
import type { Side } from './slots.js'
import { pt } from './units.js'

export type PlanWarning =
  | { readonly kind: 'PaddedToFolio'; readonly added: number }
  | { readonly kind: 'MixedPageSizes' }
  | { readonly kind: 'NoTrimBox'; readonly pages: number }

/**
 * What exactly is wrong with the parameters. The UI maps this field to a recovery
 * action and to highlighting the relevant group of controls; the string goes into the
 * report and the tests, but decisions are made on the label, not on the prose.
 */
export type BadParameter = 'grid' | 'copies' | 'folio' | 'sheet' | 'margins' | 'document' | 'pages'

export type PlanError =
  | { readonly kind: 'DoesNotFit'; readonly needed: Size; readonly available: Size }
  | { readonly kind: 'BadParameters'; readonly what: BadParameter; readonly message: string }

export type Plan = {
  readonly sheetSize: Size
  readonly sheets: readonly Sheet[]
  readonly warnings: readonly PlanWarning[]
  readonly padding: number
}

export const gridShapeFor = (scheme: Scheme): { rows: number; cols: number } => {
  if (scheme.kind === 'booklet') {
    return scheme.binding === 'top' ? { rows: 2, cols: 1 } : { rows: 1, cols: 2 }
  }
  return { rows: scheme.rows, cols: scheme.cols }
}

const orderFor = (scheme: Scheme, pageCount: number): readonly Side[] => {
  switch (scheme.kind) {
    case 'booklet':
      return bookletOrder(pageCount, scheme.folio)
    case 'nup':
      return nupOrder(pageCount, scheme.rows, scheme.cols, scheme.fill)
    case 'stepRepeat':
      return stepRepeatOrder(pageCount, scheme.rows, scheme.cols, scheme.copies)
    case 'cutStack':
      return cutStackOrder(pageCount, scheme.rows, scheme.cols)
  }
}

/**
 * Tolerance for size comparisons: a hundredth of a point, which is thirty-five microns.
 * It cannot be smaller: PDF stores coordinates in single precision, and a page
 * 595.28 tall is read back by the engine as 595.280029, that is, three
 * hundred-thousandths larger. With machine epsilon such a page would not fit on a
 * sheet of exactly its own size.
 */
const SLACK = 0.01

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 1

const isPositive = (value: number): boolean => Number.isFinite(value) && value > 0

const bad = (what: BadParameter, message: string): PlanError => ({
  kind: 'BadParameters',
  what,
  message,
})

const validate = (job: Job, doc: DocumentInfo): PlanError | null => {
  const { rows, cols } = gridShapeFor(job.scheme)
  if (!isCount(rows) || !isCount(cols)) {
    return bad('grid', 'the number of rows and columns must be a whole number, at least one')
  }
  if (job.scheme.kind === 'stepRepeat' && !isCount(job.scheme.copies)) {
    return bad('copies', 'the number of copies must be a whole number, at least one')
  }
  if (
    job.scheme.kind === 'booklet' &&
    job.scheme.folio !== 'all' &&
    (!Number.isInteger(job.scheme.folio) || job.scheme.folio < 4 || job.scheme.folio % 4 !== 0)
  ) {
    return bad('folio', 'a signature must be a multiple of four and at least four')
  }
  if (doc.pageCount < 1) {
    return bad('document', 'the document has no pages')
  }
  if (doc.pages.length !== doc.pageCount) {
    return bad(
      'document',
      'inconsistent document description: page count does not match the number of descriptions',
    )
  }
  // A zero or non-numeric page width gives infinity in the scale and NaN further down
  // the matrix, and in the content stream NaN silently becomes zero: the page would
  // collapse to a point, and nobody would see a failure.
  if (!doc.pages.every((p) => isPositive(p.trim.w) && isPositive(p.trim.h))) {
    return bad('pages', 'the page trim size must be finite and positive')
  }
  if (!isPositive(job.sheet.size.w) || !isPositive(job.sheet.size.h)) {
    return bad('sheet', 'the sheet size must be positive')
  }
  if (job.sheet.margin < 0 || job.sheet.gap < 0 || job.source.bleed < 0) {
    return bad('margins', 'margins, gaps and bleed cannot be negative')
  }
  const usableW = job.sheet.size.w - 2 * job.sheet.margin - (cols - 1) * job.sheet.gap
  const usableH = job.sheet.size.h - 2 * job.sheet.margin - (rows - 1) * job.sheet.gap
  if (usableW <= 0 || usableH <= 0) {
    return bad('margins', 'margins and gaps leave no room for pages')
  }
  return null
}

/**
 * Brings pages to a common trim size when size normalization is on.
 * Each page is centered inside the largest size, so a
 * mixed-size document is laid out without drifting.
 */
const geometryOf = (pages: readonly SourcePage[], normalize: boolean): readonly PageGeometry[] => {
  const plain = pages.map((p) => ({ trim: p.trim, media: p.media }))
  if (!normalize) return plain
  const maxW = Math.max(...plain.map((p) => p.trim.w))
  const maxH = Math.max(...plain.map((p) => p.trim.h))
  return plain.map((p) => ({
    media: p.media,
    trim: rect(p.trim.x + (p.trim.w - maxW) / 2, p.trim.y + (p.trim.h - maxH) / 2, maxW, maxH),
  }))
}

/** With right binding, spreads are mirrored: the first page ends up on the right. */
const mirrorIfRightBound = (sides: readonly Side[], scheme: Scheme): readonly Side[] => {
  if (scheme.kind !== 'booklet' || scheme.binding !== 'right') return sides
  return sides.map((side) => ({ ...side, slots: [...side.slots].reverse() }))
}

const warningsFor = (job: Job, doc: DocumentInfo, padding: number): readonly PlanWarning[] => {
  const warnings: PlanWarning[] = []
  if (padding > 0) warnings.push({ kind: 'PaddedToFolio', added: padding })
  if (doc.uniformSize === null && !job.source.normalizeSizes) {
    warnings.push({ kind: 'MixedPageSizes' })
  }
  if (job.source.bleed > 0) {
    const without = doc.pages.filter((p) => !p.hasTrimBox).length
    if (without > 0) warnings.push({ kind: 'NoTrimBox', pages: without })
  }
  return warnings
}

/** Computes the full imposition plan. Pure function: the same input gives the same output. */
export const plan = (job: Job, doc: DocumentInfo): Result<Plan, PlanError> => {
  const invalid = validate(job, doc)
  if (invalid !== null) return err(invalid)

  const { rows, cols } = gridShapeFor(job.scheme)
  const grid = buildGrid(job.sheet.size, rows, cols, job.sheet.margin, job.sheet.gap)
  const geometry = geometryOf(doc.pages, job.source.normalizeSizes)
  const first = grid.cells[0]
  const reference = geometry[0]
  if (first === undefined || reference === undefined) {
    return err(bad('grid', 'the grid produced no cells'))
  }

  if (job.source.scaling === 'actual') {
    const neededW = Math.max(...geometry.map((p) => p.trim.w))
    const neededH = Math.max(...geometry.map((p) => p.trim.h))
    if (neededW > first.rect.w + SLACK || neededH > first.rect.h + SLACK) {
      return err({
        kind: 'DoesNotFit',
        needed: { w: pt(neededW), h: pt(neededH) },
        available: { w: first.rect.w, h: first.rect.h },
      })
    }
  }

  const sides = mirrorIfRightBound(orderFor(job.scheme, doc.pageCount), job.scheme)
  const usedSlots = sides.reduce((acc, s) => acc + s.slots.length, 0)
  const placedPages = sides.reduce(
    (acc, s) => acc + s.slots.filter((slot) => slot.kind === 'page').length,
    0,
  )
  const padding = job.scheme.kind === 'booklet' ? usedSlots - placedPages : 0

  const assembled = assemble(
    sides,
    grid,
    geometry,
    reference,
    { bleed: job.source.bleed, scaling: job.source.scaling },
    job.sheet.margin,
    job.sheet.gap,
    job.scheme.kind === 'booklet',
  )

  const scheme = job.scheme
  const withCreep =
    scheme.kind === 'booklet' && scheme.creepPerSheet > 0
      ? assembled.map((sheet) =>
          applyCreep(
            sheet,
            creepShift(sheet.folioSideIndex, scheme.creepPerSheet),
            scheme.binding,
            job.sheet.size,
          ),
        )
      : assembled

  const sheets = withCreep.map((sheet) => ({
    ...sheet,
    marks: resolveMarks(
      sheet,
      job.sheet.size,
      grid,
      job.marks,
      job.sheet.margin,
      job.scheme.kind === 'booklet',
    ),
  }))

  return ok({
    sheetSize: job.sheet.size,
    sheets,
    warnings: warningsFor(job, doc, padding),
    padding,
  })
}
