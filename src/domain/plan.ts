import { assemble, type Sheet } from './assemble.js'
import { applyCreep, creepShift } from './creep.js'
import type { Size } from './geometry.js'
import { buildGrid } from './grid.js'
import type { DocumentInfo, Job, Scheme } from './job.js'
import { resolveMarks } from './marks.js'
import { bookletOrder } from './order/booklet.js'
import { cutStackOrder } from './order/cut-stack.js'
import { nupOrder } from './order/nup.js'
import { stepRepeatOrder } from './order/step-repeat.js'
import { err, ok, type Result } from './result.js'
import type { Side } from './slots.js'

export type PlanWarning =
  | { readonly kind: 'PaddedToFolio'; readonly added: number }
  | { readonly kind: 'MixedPageSizes' }
  | { readonly kind: 'NoTrimBox'; readonly pages: number }

export type PlanError =
  | { readonly kind: 'DoesNotFit'; readonly needed: Size; readonly available: Size }
  | { readonly kind: 'BadParameters'; readonly message: string }

export type Plan = {
  readonly sheetSize: Size
  readonly sheets: readonly Sheet[]
  readonly warnings: readonly PlanWarning[]
  readonly padding: number
}

const gridShapeFor = (scheme: Scheme): { rows: number; cols: number } => {
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

const validate = (job: Job, doc: DocumentInfo): PlanError | null => {
  const { rows, cols } = gridShapeFor(job.scheme)
  if (rows < 1 || cols < 1) {
    return { kind: 'BadParameters', message: 'число строк и колонок должно быть не меньше одной' }
  }
  if (job.scheme.kind === 'stepRepeat' && job.scheme.copies < 1) {
    return { kind: 'BadParameters', message: 'число копий должно быть не меньше одной' }
  }
  if (
    job.scheme.kind === 'booklet' &&
    job.scheme.folio !== 'all' &&
    (job.scheme.folio < 4 || job.scheme.folio % 4 !== 0)
  ) {
    return {
      kind: 'BadParameters',
      message: 'тетрадь должна быть кратна четырём и не меньше четырёх',
    }
  }
  if (doc.pageCount < 1) {
    return { kind: 'BadParameters', message: 'в документе нет полос' }
  }
  return null
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

/** Считает полный план спуска. Чистая функция: одинаковый вход даёт одинаковый выход. */
export const plan = (job: Job, doc: DocumentInfo): Result<Plan, PlanError> => {
  const invalid = validate(job, doc)
  if (invalid !== null) return err(invalid)

  const { rows, cols } = gridShapeFor(job.scheme)
  const grid = buildGrid(job.sheet.size, rows, cols, job.sheet.margin, job.sheet.gap)
  const first = grid.cells[0]
  const reference = doc.pages[0]
  if (first === undefined || reference === undefined) {
    return err({ kind: 'BadParameters', message: 'пустая сетка или пустой документ' })
  }

  if (job.source.scaling === 'actual') {
    const needs = doc.pages.some(
      (p) => p.trim.w > first.rect.w + 1e-6 || p.trim.h > first.rect.h + 1e-6,
    )
    if (needs) {
      return err({
        kind: 'DoesNotFit',
        needed: { w: reference.trim.w, h: reference.trim.h },
        available: { w: first.rect.w, h: first.rect.h },
      })
    }
  }

  const sides = orderFor(job.scheme, doc.pageCount)
  const usedSlots = sides.reduce((acc, s) => acc + s.slots.length, 0)
  const placedPages = sides.flatMap((s) => s.slots).filter((s) => s.kind === 'page').length
  const padding = job.scheme.kind === 'booklet' ? usedSlots - placedPages : 0

  const geometry = doc.pages.map((p) => ({ trim: p.trim, media: p.media }))
  const referenceGeometry = { trim: reference.trim, media: reference.media }
  const assembled = assemble(
    sides,
    grid,
    geometry,
    referenceGeometry,
    { bleed: job.source.bleed, scaling: job.source.scaling },
    job.sheet.margin,
    job.sheet.gap,
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
    marks: resolveMarks(sheet, job.sheet.size, grid, job.marks, job.sheet.margin),
  }))

  return ok({
    sheetSize: job.sheet.size,
    sheets,
    warnings: warningsFor(job, doc, padding),
    padding,
  })
}
