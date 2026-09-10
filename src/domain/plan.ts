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

/**
 * Допуск на сравнение размеров: сотая доля пункта, это тридцать пять микрон.
 * Меньше брать нельзя: координаты в PDF хранятся с одинарной точностью, и полоса
 * высотой 595.28 читается движком обратно как 595.280029, то есть на три
 * стотысячных больше. При машинном эпсилоне такая полоса не влезала бы на лист
 * ровно своего размера.
 */
const SLACK = 0.01

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 1

const validate = (job: Job, doc: DocumentInfo): PlanError | null => {
  const { rows, cols } = gridShapeFor(job.scheme)
  if (!isCount(rows) || !isCount(cols)) {
    return {
      kind: 'BadParameters',
      message: 'число строк и колонок должно быть целым и не меньше одного',
    }
  }
  if (job.scheme.kind === 'stepRepeat' && !isCount(job.scheme.copies)) {
    return { kind: 'BadParameters', message: 'число копий должно быть целым и не меньше одной' }
  }
  if (
    job.scheme.kind === 'booklet' &&
    job.scheme.folio !== 'all' &&
    (!Number.isInteger(job.scheme.folio) || job.scheme.folio < 4 || job.scheme.folio % 4 !== 0)
  ) {
    return {
      kind: 'BadParameters',
      message: 'тетрадь должна быть кратна четырём и не меньше четырёх',
    }
  }
  if (doc.pageCount < 1) {
    return { kind: 'BadParameters', message: 'в документе нет полос' }
  }
  if (doc.pages.length !== doc.pageCount) {
    return {
      kind: 'BadParameters',
      message: 'описание документа противоречиво: число полос не совпадает с числом описаний',
    }
  }
  if (
    !Number.isFinite(job.sheet.size.w) ||
    !Number.isFinite(job.sheet.size.h) ||
    job.sheet.size.w <= 0 ||
    job.sheet.size.h <= 0
  ) {
    return { kind: 'BadParameters', message: 'размер листа должен быть положительным' }
  }
  if (job.sheet.margin < 0 || job.sheet.gap < 0 || job.source.bleed < 0) {
    return {
      kind: 'BadParameters',
      message: 'поля, зазоры и вылеты не могут быть отрицательными',
    }
  }
  const usableW = job.sheet.size.w - 2 * job.sheet.margin - (cols - 1) * job.sheet.gap
  const usableH = job.sheet.size.h - 2 * job.sheet.margin - (rows - 1) * job.sheet.gap
  if (usableW <= 0 || usableH <= 0) {
    return { kind: 'BadParameters', message: 'поля и зазоры не оставляют места под полосы' }
  }
  return null
}

/**
 * Приводит полосы к общему обрезному формату, если включено выравнивание.
 * Каждая полоса центрируется внутри самого большого формата, поэтому
 * разноразмерный документ раскладывается без разъезда.
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

/** При переплёте справа развороты зеркалятся: первая полоса оказывается справа. */
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

/** Считает полный план спуска. Чистая функция: одинаковый вход даёт одинаковый выход. */
export const plan = (job: Job, doc: DocumentInfo): Result<Plan, PlanError> => {
  const invalid = validate(job, doc)
  if (invalid !== null) return err(invalid)

  const { rows, cols } = gridShapeFor(job.scheme)
  const grid = buildGrid(job.sheet.size, rows, cols, job.sheet.margin, job.sheet.gap)
  const geometry = geometryOf(doc.pages, job.source.normalizeSizes)
  const first = grid.cells[0]
  const reference = geometry[0]
  if (first === undefined || reference === undefined) {
    return err({ kind: 'BadParameters', message: 'сетка не дала ни одной ячейки' })
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
