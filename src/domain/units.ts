declare const unit: unique symbol

/** Длина в типографских пунктах. Внутренняя единица всего проекта. */
export type Pt = number & { readonly [unit]: 'Pt' }

const PT_PER_MM = 72 / 25.4

// Единственное место в проекте, где допускается приведение типа: конструктор бренда.
export const pt = (value: number): Pt => value as Pt

export const mm = (value: number): Pt => pt(value * PT_PER_MM)
export const inch = (value: number): Pt => pt(value * 72)
export const toMm = (value: Pt): number => value / PT_PER_MM
