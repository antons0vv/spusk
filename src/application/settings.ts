import type { Binding } from '../domain/creep.js'
import { type Size, size } from '../domain/geometry.js'
import type { DocumentInfo, Job, Scheme } from '../domain/job.js'
import { type MarkSpec, MIN_MARGIN_FOR_REGISTRATION_MM } from '../domain/marks.js'
import { type Plan, type PlanError, plan } from '../domain/plan.js'
import type { Result } from '../domain/result.js'
import {
  FORMATS,
  type FormatName,
  type Orientation,
  oriented,
  pickSheet,
  roominess,
} from '../domain/sheet-formats.js'
import { mm, pt } from '../domain/units.js'

export type SchemeKind = Scheme['kind']

/**
 * Параметры задания в том виде, в каком их крутит человек: миллиметры, названия
 * форматов, флажки меток. В `Job` они превращаются только в `resolve`.
 */
export type Settings = {
  readonly scheme: SchemeKind
  readonly folio: number | 'all'
  readonly binding: Binding
  readonly creepMm: number
  /** Сетка общая для n-up, step and repeat и cut and stack: смена схемы её не сбрасывает. */
  readonly rows: number
  readonly cols: number
  readonly fill: 'rows' | 'cols'
  readonly copies: number
  /** `custom` — лист ровно `customWMm × customHMm`, ориентация следует из сторон. */
  readonly format: FormatName | 'auto' | 'custom'
  readonly orientation: Orientation
  readonly customWMm: number
  readonly customHMm: number
  /** `auto` — ровно столько, сколько нужно вылету и включённым меткам. */
  readonly marginMm: number | 'auto'
  readonly gapMm: number
  readonly bleedMm: number
  readonly normalizeSizes: boolean
  readonly marks: { readonly crop: boolean; readonly fold: boolean; readonly registration: boolean }
}

export const DEFAULT_SETTINGS: Settings = {
  scheme: 'booklet',
  folio: 'all',
  binding: 'left',
  creepMm: 0,
  rows: 2,
  cols: 2,
  fill: 'rows',
  copies: 10,
  format: 'auto',
  orientation: 'portrait',
  customWMm: 210,
  customHMm: 297,
  marginMm: 'auto',
  gapMm: 0,
  bleedMm: 0,
  normalizeSizes: false,
  marks: { crop: false, fold: false, registration: false },
}

/**
 * Геометрия меток в интерфейс не выведена: для типографии это привычные величины.
 * Отступ метки реза не меньше вылета, иначе метка ляжет на вылет и напечатается
 * поверх фона.
 */
const CROP_LENGTH_MM = 5
const CROP_OFFSET_MM = 3
const FOLD_LENGTH_MM = 5
const PEN = pt(0.25)

const cropOffsetMm = (s: Settings) => Math.max(CROP_OFFSET_MM, s.bleedMm)

const schemeOf = (s: Settings): Scheme => {
  switch (s.scheme) {
    case 'booklet':
      return { kind: 'booklet', folio: s.folio, binding: s.binding, creepPerSheet: mm(s.creepMm) }
    case 'nup':
      return { kind: 'nup', rows: s.rows, cols: s.cols, fill: s.fill }
    case 'stepRepeat':
      return { kind: 'stepRepeat', rows: s.rows, cols: s.cols, copies: s.copies }
    case 'cutStack':
      return { kind: 'cutStack', rows: s.rows, cols: s.cols }
  }
}

const marksOf = (s: Settings): readonly MarkSpec[] => {
  const marks: MarkSpec[] = []
  if (s.marks.crop) {
    marks.push({ kind: 'crop', length: mm(CROP_LENGTH_MM), offset: mm(cropOffsetMm(s)), pen: PEN })
  }
  if (s.marks.fold) marks.push({ kind: 'fold', length: mm(FOLD_LENGTH_MM), pen: PEN })
  if (s.marks.registration) marks.push({ kind: 'registration', radius: mm(2.5), pen: PEN })
  return marks
}

/** Поле, в которое помещаются вылет и все включённые метки. */
export const neededMarginMm = (s: Settings): number =>
  Math.max(
    s.bleedMm,
    s.marks.crop ? cropOffsetMm(s) + CROP_LENGTH_MM : 0,
    s.marks.fold && s.scheme === 'booklet' ? FOLD_LENGTH_MM : 0,
    s.marks.registration ? MIN_MARGIN_FOR_REGISTRATION_MM : 0,
  )

export type ResolvedSheet = {
  readonly format: FormatName | 'custom'
  readonly orientation: Orientation
  readonly size: Size
}

const sheetOf = (s: Settings, draft: Job, doc: DocumentInfo): ResolvedSheet => {
  if (s.format === 'auto') return pickSheet(draft, doc)
  if (s.format === 'custom') {
    return {
      format: 'custom',
      orientation: s.customWMm > s.customHMm ? 'landscape' : 'portrait',
      size: size(mm(s.customWMm), mm(s.customHMm)),
    }
  }
  return {
    format: s.format,
    orientation: s.orientation,
    size: oriented(FORMATS[s.format], s.orientation),
  }
}

export type Resolved = {
  readonly job: Job
  readonly sheet: ResolvedSheet
  readonly marginMm: number
  /** Масштаб самой большой полосы: 1, если полосы влезли как есть. */
  readonly scale: number
  readonly plan: Result<Plan, PlanError>
}

/**
 * Собирает задание и план. Лист при `auto` подбирается под документ и схему, поле при
 * `auto` — под вылет и метки. Если полосы не влезают на лист в натуральную величину,
 * они вписываются: спрашивать человека не о чем, а масштаб показывается рядом.
 */
export const resolve = (s: Settings, doc: DocumentInfo): Resolved => {
  const marginMm = s.marginMm === 'auto' ? neededMarginMm(s) : s.marginMm
  const draft: Job = {
    scheme: schemeOf(s),
    sheet: { size: FORMATS.a4, margin: mm(marginMm), gap: mm(s.gapMm) },
    source: { bleed: mm(s.bleedMm), scaling: 'actual', normalizeSizes: s.normalizeSizes },
    marks: marksOf(s),
  }
  const sheet = sheetOf(s, draft, doc)
  const actual: Job = { ...draft, sheet: { ...draft.sheet, size: sheet.size } }
  const asIs = plan(actual, doc)
  if (asIs.ok || asIs.error.kind !== 'DoesNotFit') {
    return { job: actual, sheet, marginMm, scale: 1, plan: asIs }
  }
  const fitted: Job = { ...actual, source: { ...actual.source, scaling: 'fit' } }
  return {
    job: fitted,
    sheet,
    marginMm,
    scale: roominess(fitted, doc, sheet.size),
    plan: plan(fitted, doc),
  }
}
