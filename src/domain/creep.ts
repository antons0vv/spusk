import type { Placement, Sheet } from './assemble.js'
import { compose, type Size, translation } from './geometry.js'
import { type Pt, pt } from './units.js'

export type Binding = 'left' | 'right' | 'top'

/** Сдвиг для стороны листа: внешний лист тетради не сдвигается, каждый следующий на шаг больше. */
export const creepShift = (folioSideIndex: number, perSheet: Pt): Pt =>
  pt(Math.floor(folioSideIndex / 2) * perSheet)

const shiftRect = (r: Placement['trim'], dx: Pt, dy: Pt): Placement['trim'] => ({
  x: pt(r.x + dx),
  y: pt(r.y + dy),
  w: r.w,
  h: r.h,
})

const directionFor = (placement: Placement, binding: Binding, sheetSize: Size): [Pt, Pt] => {
  const centerX = placement.trim.x + placement.trim.w / 2
  const centerY = placement.trim.y + placement.trim.h / 2
  if (binding === 'top') {
    return centerY > sheetSize.h / 2 ? [pt(0), pt(-1)] : [pt(0), pt(1)]
  }
  return centerX < sheetSize.w / 2 ? [pt(1), pt(0)] : [pt(-1), pt(0)]
}

/** Сдвигает содержимое каждой полосы листа к корешку на заданную величину. */
export const applyCreep = (sheet: Sheet, shift: Pt, binding: Binding, sheetSize: Size): Sheet => ({
  ...sheet,
  placements: sheet.placements.map((placement) => {
    const [sx, sy] = directionFor(placement, binding, sheetSize)
    const dx = pt(sx * shift)
    const dy = pt(sy * shift)
    return {
      ...placement,
      matrix: compose(placement.matrix, translation(dx, dy)),
      trim: shiftRect(placement.trim, dx, dy),
      clip: shiftRect(placement.clip, dx, dy),
    }
  }),
})
