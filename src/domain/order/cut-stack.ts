import { BLANK, page, type Side } from '../slots.js'

/** Layout for cutting as a stack: the number of stacks equals the number of cells. */
export const cutStackOrder = (pageCount: number, rows: number, cols: number): readonly Side[] => {
  const stacks = rows * cols
  const perStack = Math.ceil(pageCount / stacks)
  const sides: Side[] = []
  for (let s = 0; s < perStack; s += 1) {
    sides.push({
      slots: Array.from({ length: stacks }, (_, stack) => {
        const index = stack * perStack + s
        return index < pageCount ? page(index) : BLANK
      }),
      side: 'single',
      folioSideIndex: 0,
    })
  }
  return sides
}
