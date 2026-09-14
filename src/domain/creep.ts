import type { Placement, Sheet } from './assemble.js'
import { compose, type Rect, rect, type Size, translation } from './geometry.js'
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

/**
 * Клип полосы не заходит за линию сгиба. Сдвиг к корешку уводит содержимое за сгиб, и без
 * этой границы полоса напечаталась бы на соседней: после фальцовки полоска чужого
 * содержимого оказалась бы по другую сторону корешка.
 */
const clipAtFold = (clip: Rect, sx: number, sy: number, sheetSize: Size): Rect => {
  const foldX = sheetSize.w / 2
  const foldY = sheetSize.h / 2
  const x0 = sx < 0 ? Math.max(clip.x, foldX) : clip.x
  const x1 = sx > 0 ? Math.min(clip.x + clip.w, foldX) : clip.x + clip.w
  // Ось Y вверх: верхняя полоса едет вниз и не опускается ниже сгиба, нижняя наоборот.
  const y0 = sy < 0 ? Math.max(clip.y, foldY) : clip.y
  const y1 = sy > 0 ? Math.min(clip.y + clip.h, foldY) : clip.y + clip.h
  return rect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0))
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
      clip: clipAtFold(shiftRect(placement.clip, dx, dy), sx, sy, sheetSize),
    }
  }),
})
