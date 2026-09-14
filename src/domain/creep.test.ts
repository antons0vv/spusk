import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.js'
import { applyCreep, creepShift } from './creep.js'
import { rect, size } from './geometry.js'
import { buildGrid } from './grid.js'
import { bookletOrder } from './order/booklet.js'
import { mm, pt } from './units.js'

const A4L = size(841.89, 595.28)
const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

describe('выползание', () => {
  it('внешний лист не сдвигается, каждый следующий сдвигается на шаг', () => {
    expect(creepShift(0, mm(0.4))).toBeCloseTo(0, 9)
    expect(creepShift(1, mm(0.4))).toBeCloseTo(0, 9)
    expect(creepShift(2, mm(0.4))).toBeCloseTo(mm(0.4), 9)
    expect(creepShift(5, mm(0.4))).toBeCloseTo(mm(0.8), 9)
  })

  it('левая полоса разворота едет вправо, правая влево', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const pages = Array.from({ length: 16 }, () => A5)
    const sheets = assemble(
      bookletOrder(16, 'all'),
      grid,
      pages,
      A5,
      { bleed: pt(0), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const inner = sheets[6]
    if (inner === undefined) throw new Error('нет листа')
    const shifted = applyCreep(inner, mm(1), 'left', A4L)
    const left = shifted.placements[0]
    const right = shifted.placements[1]
    expect((left?.matrix[4] ?? 0) - (inner.placements[0]?.matrix[4] ?? 0)).toBeCloseTo(mm(1), 6)
    expect((right?.matrix[4] ?? 0) - (inner.placements[1]?.matrix[4] ?? 0)).toBeCloseTo(-mm(1), 6)
  })

  it('сдвиг двигает и линию реза вместе с содержимым', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      bookletOrder(4, 'all'),
      grid,
      [A5, A5, A5, A5],
      A5,
      { bleed: mm(3), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    const shifted = applyCreep(sheet, mm(2), 'left', A4L)
    expect((shifted.placements[0]?.trim.x ?? 0) - (sheet.placements[0]?.trim.x ?? 0)).toBeCloseTo(
      mm(2),
      6,
    )
    expect((shifted.placements[0]?.clip.x ?? 0) - (sheet.placements[0]?.clip.x ?? 0)).toBeCloseTo(
      mm(2),
      6,
    )
  })

  it('при переплёте сверху сдвиг вертикальный', () => {
    const grid = buildGrid(size(595.28, 841.89), 2, 1, pt(0), pt(0))
    const pages = [A5, A5, A5, A5]
    const sheets = assemble(
      bookletOrder(4, 'all'),
      grid,
      pages,
      A5,
      { bleed: pt(0), scaling: 'fit' },
      pt(0),
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    const shifted = applyCreep(sheet, mm(1), 'top', size(595.28, 841.89))
    expect(
      (shifted.placements[0]?.matrix[5] ?? 0) - (sheet.placements[0]?.matrix[5] ?? 0),
    ).toBeCloseTo(-mm(1), 6)
  })

  it('сдвинутые к корешку полосы обрезаются по линии сгиба и не заходят друг на друга', () => {
    const grid = buildGrid(A4L, 1, 2, pt(0), pt(0))
    const sheets = assemble(
      bookletOrder(16, 'all'),
      grid,
      Array.from({ length: 16 }, () => A5),
      A5,
      { bleed: mm(3), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const inner = sheets[6]
    if (inner === undefined) throw new Error('нет листа')
    const [left, right] = applyCreep(inner, mm(1), 'left', A4L).placements
    if (left === undefined || right === undefined) throw new Error('нет размещений')
    // Содержимое сдвинуто, но за сгиб не выходит: иначе полоса печаталась бы на соседней.
    expect(left.clip.x + left.clip.w).toBeLessThanOrEqual(A4L.w / 2 + 1e-9)
    expect(right.clip.x).toBeGreaterThanOrEqual(A4L.w / 2 - 1e-9)
    // Внешний край не трогается.
    expect(left.clip.x).toBeCloseTo((inner.placements[0]?.clip.x ?? 0) + mm(1), 6)
  })

  it('при переплёте сверху полосы обрезаются по горизонтальному сгибу', () => {
    const tall = size(595.28, 841.89)
    const grid = buildGrid(tall, 2, 1, pt(0), pt(0))
    const sheets = assemble(
      bookletOrder(16, 'all'),
      grid,
      Array.from({ length: 16 }, () => ({
        trim: rect(0, 0, 595.28, 419.53),
        media: rect(0, 0, 595.28, 419.53),
      })),
      { trim: rect(0, 0, 595.28, 419.53), media: rect(0, 0, 595.28, 419.53) },
      { bleed: mm(3), scaling: 'actual' },
      pt(0),
      pt(0),
    )
    const inner = sheets[6]
    if (inner === undefined) throw new Error('нет листа')
    const [top, bottom] = applyCreep(inner, mm(1), 'top', tall).placements
    if (top === undefined || bottom === undefined) throw new Error('нет размещений')
    expect(top.clip.y).toBeGreaterThanOrEqual(tall.h / 2 - 1e-9)
    expect(bottom.clip.y + bottom.clip.h).toBeLessThanOrEqual(tall.h / 2 + 1e-9)
  })
})
