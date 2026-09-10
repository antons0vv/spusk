import { BLANK, page, type Side, type Slot } from '../slots.js'

const roundUpTo4 = (n: number): number => Math.ceil(n / 4) * 4

const slotFor = (index: number, pageCount: number): Slot =>
  index < pageCount ? page(index) : BLANK

/**
 * Порядок полос для сшивки на скрепку. При folio = 'all' весь документ идёт
 * одной тетрадью, иначе режется на тетради по folio полос.
 */
export const bookletOrder = (pageCount: number, folio: number | 'all'): readonly Side[] => {
  const chunk = folio === 'all' ? roundUpTo4(pageCount) : roundUpTo4(folio)
  const total = Math.ceil(pageCount / chunk) * chunk
  const sides: Side[] = []
  for (let start = 0; start < total; start += chunk) {
    for (let i = 0; i < chunk / 2; i += 1) {
      const outer = start + chunk - 1 - i
      const inner = start + i
      const [left, right] = i % 2 === 0 ? [outer, inner] : [inner, outer]
      sides.push({
        slots: [slotFor(left, pageCount), slotFor(right, pageCount)],
        side: i % 2 === 0 ? 'front' : 'back',
        folioSideIndex: i,
      })
    }
  }
  return sides
}
