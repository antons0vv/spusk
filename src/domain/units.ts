declare const unit: unique symbol

/** Length in typographic points. The internal unit of the whole project. */
export type Pt = number & { readonly [unit]: 'Pt' }

const PT_PER_MM = 72 / 25.4

// The only place in the project where a type cast is allowed: the brand constructor.
export const pt = (value: number): Pt => value as Pt

export const mm = (value: number): Pt => pt(value * PT_PER_MM)
export const inch = (value: number): Pt => pt(value * 72)
export const toMm = (value: Pt): number => value / PT_PER_MM
