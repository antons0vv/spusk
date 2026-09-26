import type { PageGeometry, SourceSpec } from './assemble.js'
import type { Binding } from './creep.js'
import type { Rect, Size } from './geometry.js'
import type { CropGeometry, MarkSpec } from './marks.js'
import type { Pt } from './units.js'

export type Scheme =
  | {
      readonly kind: 'booklet'
      readonly folio: number | 'all'
      readonly binding: Binding
      readonly creepPerSheet: Pt
    }
  | {
      readonly kind: 'nup'
      readonly rows: number
      readonly cols: number
      readonly fill: 'rows' | 'cols'
    }
  | {
      readonly kind: 'stepRepeat'
      readonly rows: number
      readonly cols: number
      readonly copies: number
    }
  | { readonly kind: 'cutStack'; readonly rows: number; readonly cols: number }

export type SheetSpec = { readonly size: Size; readonly margin: Pt; readonly gap: Pt }

export type JobSource = SourceSpec & { readonly normalizeSizes: boolean }

export type Job = {
  readonly scheme: Scheme
  readonly sheet: SheetSpec
  readonly source: JobSource
  readonly marks: readonly MarkSpec[]
}

export type SourcePage = PageGeometry & {
  readonly hasTrimBox: boolean
  /** BleedBox in page space, clipped to the page edge; null if the file did not declare one. */
  readonly bleed: Rect | null
}

export type DocumentInfo = {
  readonly pageCount: number
  readonly pages: readonly SourcePage[]
  /** null if the pages differ in size. */
  readonly uniformSize: Size | null
  /** Crop marks the file drew itself around the first page; null if there are none. */
  readonly cropMarks: CropGeometry | null
}
