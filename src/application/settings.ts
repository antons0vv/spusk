import { fileBleed } from '../domain/bleed.js'
import type { Binding } from '../domain/creep.js'
import { type Size, size } from '../domain/geometry.js'
import type { DocumentInfo, Job, Scheme } from '../domain/job.js'
import {
  type CropGeometry,
  type MarkSpec,
  MIN_MARGIN_FOR_REGISTRATION_MM,
} from '../domain/marks.js'
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
import { mm, pt, toMm } from '../domain/units.js'

export type SchemeKind = Scheme['kind']

/**
 * Job parameters in the form a person tweaks them: millimeters, format names, mark
 * checkboxes. They turn into a `Job` only in `resolve`.
 */
export type Settings = {
  readonly scheme: SchemeKind
  readonly folio: number | 'all'
  readonly binding: Binding
  readonly creepMm: number
  /** The grid is shared by n-up, step and repeat and cut and stack: switching schemes keeps it. */
  readonly rows: number
  readonly cols: number
  readonly fill: 'rows' | 'cols'
  readonly copies: number
  /** `custom` is a sheet of exactly `customWMm × customHMm`; orientation follows from its sides. */
  readonly format: FormatName | 'auto' | 'custom'
  readonly orientation: Orientation
  readonly customWMm: number
  readonly customHMm: number
  /** `auto` is exactly as much as the bleed and the enabled marks need. */
  readonly marginMm: number | 'auto'
  readonly gapMm: number
  /** `auto` is the bleed declared in the file (BleedBox); without one, zero. */
  readonly bleedMm: number | 'auto'
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
  bleedMm: 'auto',
  normalizeSizes: false,
  marks: { crop: false, fold: false, registration: false },
}

/**
 * Mark geometry isn't exposed in the interface: these are the values print shops are used to.
 * If the file drew crop marks itself, its numbers win: see `cropGeometry`.
 * Crop marks fit entirely into five millimeters of margin: offset two, stroke three. The offset
 * is never less than the bleed, or the mark would land on the bleed and print over the
 * background; the line then gets shorter so the margin stays the same, but never shorter than
 * two millimeters.
 */
const CROP_REACH_MM = 5
const CROP_OFFSET_MM = 2
const CROP_MIN_LENGTH_MM = 2
const FOLD_LENGTH_MM = 5
const PEN = pt(0.25)

const cropOffsetMm = (bleedMm: number) => Math.max(CROP_OFFSET_MM, bleedMm)
const cropLengthMm = (bleedMm: number) =>
  Math.max(CROP_MIN_LENGTH_MM, CROP_REACH_MM - cropOffsetMm(bleedMm))

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

/**
 * Crop marks are drawn with the file's numbers if the file drew them itself: that way the sheet
 * repeats what the person saw in their layout program. An offset smaller than the bleed is not
 * grown then: the white underlay from the same file sets the mark off the bleed background.
 */
const cropGeometry = (bleedMm: number, file: CropGeometry | null): CropGeometry =>
  file ?? {
    offset: mm(cropOffsetMm(bleedMm)),
    length: mm(cropLengthMm(bleedMm)),
    pen: PEN,
    halo: null,
  }

const marksOf = (s: Settings, bleedMm: number, file: CropGeometry | null): readonly MarkSpec[] => {
  const marks: MarkSpec[] = []
  if (s.marks.crop) marks.push({ kind: 'crop', ...cropGeometry(bleedMm, file) })
  if (s.marks.fold) marks.push({ kind: 'fold', length: mm(FOLD_LENGTH_MM), pen: PEN })
  if (s.marks.registration) marks.push({ kind: 'registration', radius: mm(2.5), pen: PEN })
  return marks
}

/** The margin that fits the bleed and all enabled marks. */
export const neededMarginMm = (
  s: Settings,
  bleedMm: number = s.bleedMm === 'auto' ? 0 : s.bleedMm,
  fileMarks: CropGeometry | null = null,
): number =>
  Math.max(
    bleedMm,
    !s.marks.crop
      ? 0
      : fileMarks === null
        ? cropOffsetMm(bleedMm) + cropLengthMm(bleedMm)
        : toMm(pt(fileMarks.offset + fileMarks.length)),
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

/** The file's bleed in millimeters, to a tenth: as precise as the interface shows it. */
const fileBleedMm = (doc: DocumentInfo): number => Math.round(toMm(fileBleed(doc)) * 10) / 10

export type Resolved = {
  readonly job: Job
  readonly sheet: ResolvedSheet
  readonly marginMm: number
  readonly bleedMm: number
  /** Scale of the largest page: 1 if the pages fit as they are. */
  readonly scale: number
  readonly plan: Result<Plan, PlanError>
}

/**
 * Builds the job and the plan. With `auto`, the sheet is picked for the document and the
 * scheme, and the margin for the bleed and the marks. If the pages don't fit on the sheet at
 * actual size, they are scaled to fit: there is nothing to ask the person, and the scale is
 * shown alongside.
 */
export const resolve = (s: Settings, doc: DocumentInfo): Resolved => {
  const bleedMm = s.bleedMm === 'auto' ? fileBleedMm(doc) : s.bleedMm
  const marginMm = s.marginMm === 'auto' ? neededMarginMm(s, bleedMm, doc.cropMarks) : s.marginMm
  const draft: Job = {
    scheme: schemeOf(s),
    sheet: { size: FORMATS.a4, margin: mm(marginMm), gap: mm(s.gapMm) },
    source: { bleed: mm(bleedMm), scaling: 'actual', normalizeSizes: s.normalizeSizes },
    marks: marksOf(s, bleedMm, doc.cropMarks),
  }
  const sheet = sheetOf(s, draft, doc)
  const actual: Job = { ...draft, sheet: { ...draft.sheet, size: sheet.size } }
  const asIs = plan(actual, doc)
  if (asIs.ok || asIs.error.kind !== 'DoesNotFit') {
    return { job: actual, sheet, marginMm, bleedMm, scale: 1, plan: asIs }
  }
  const fitted: Job = { ...actual, source: { ...actual.source, scaling: 'fit' } }
  return {
    job: fitted,
    sheet,
    marginMm,
    bleedMm,
    scale: roominess(fitted, doc, sheet.size),
    plan: plan(fitted, doc),
  }
}
