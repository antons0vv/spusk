export type Slot = { readonly kind: 'page'; readonly index: number } | { readonly kind: 'blank' }

export const page = (index: number): Slot => ({ kind: 'page', index })
export const BLANK: Slot = { kind: 'blank' }

export type SheetSide = 'front' | 'back' | 'single'

/** One side of one sheet: slots in grid cell order. */
export type Side = {
  readonly slots: readonly Slot[]
  readonly side: SheetSide
  /** Index of the side within its signature, needed to compute creep. */
  readonly folioSideIndex: number
}
