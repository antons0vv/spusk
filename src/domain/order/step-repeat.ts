import { BLANK, page, type Side } from '../slots.js'

/** Заполняет лист копиями одной полосы. Каждая исходная полоса получает свою серию листов. */
export const stepRepeatOrder = (
  pageCount: number,
  rows: number,
  cols: number,
  copies: number,
): readonly Side[] => {
  const cells = rows * cols
  const sides: Side[] = []
  for (let index = 0; index < pageCount; index += 1) {
    let remaining = copies
    while (remaining > 0) {
      const filled = Math.min(remaining, cells)
      sides.push({
        slots: Array.from({ length: cells }, (_, i) => (i < filled ? page(index) : BLANK)),
        side: 'single',
        folioSideIndex: 0,
      })
      remaining -= filled
    }
  }
  return sides
}
