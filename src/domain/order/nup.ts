import { BLANK, page, type Side, type Slot } from '../slots.js'

const cellIndexFor = (k: number, rows: number, cols: number, fill: 'rows' | 'cols'): number => {
  if (fill === 'rows') return k
  const col = Math.floor(k / rows)
  const row = k % rows
  return row * cols + col
}

/** Раскладывает полосы по сетке в естественном порядке, по одному разу каждую. */
export const nupOrder = (
  pageCount: number,
  rows: number,
  cols: number,
  fill: 'rows' | 'cols',
): readonly Side[] => {
  const cells = rows * cols
  const sheets = Math.ceil(pageCount / cells)
  const sides: Side[] = []
  for (let s = 0; s < sheets; s += 1) {
    const slots: Slot[] = Array.from({ length: cells }, () => BLANK)
    for (let k = 0; k < cells; k += 1) {
      const index = s * cells + k
      if (index >= pageCount) continue
      slots[cellIndexFor(k, rows, cols, fill)] = page(index)
    }
    sides.push({ slots, side: 'single', folioSideIndex: 0 })
  }
  return sides
}
