import type { PageGeometry, SourceSpec } from './assemble.js'
import type { Binding } from './creep.js'
import type { Rect, Size } from './geometry.js'
import type { MarkSpec } from './marks.js'
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
  /** BleedBox в пространстве полосы, обрезанный её краем; null, если файл его не объявил. */
  readonly bleed: Rect | null
}

export type DocumentInfo = {
  readonly pageCount: number
  readonly pages: readonly SourcePage[]
  /** null, если полосы разного размера. */
  readonly uniformSize: Size | null
}
