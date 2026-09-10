export type Slot = { readonly kind: 'page'; readonly index: number } | { readonly kind: 'blank' }

export const page = (index: number): Slot => ({ kind: 'page', index })
export const BLANK: Slot = { kind: 'blank' }

export type SheetSide = 'front' | 'back' | 'single'

/** Одна сторона одного листа: слоты в порядке ячеек сетки. */
export type Side = {
  readonly slots: readonly Slot[]
  readonly side: SheetSide
  /** Индекс стороны внутри своей тетради, нужен для расчёта выползания. */
  readonly folioSideIndex: number
}
