import type { Point } from './geometry.js'
import type { Pt } from './units.js'

export type ResolvedMark =
  | {
      readonly kind: 'line'
      readonly from: Point
      readonly to: Point
      readonly pen: Pt
      readonly dash: readonly number[] | null
    }
  | { readonly kind: 'registration'; readonly center: Point; readonly radius: Pt; readonly pen: Pt }
