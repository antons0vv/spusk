import { describe, expect, it } from 'vitest'
import { assemble, type Sheet } from './assemble.js'
import { rect, size } from './geometry.js'
import { buildGrid, type Grid } from './grid.js'
import { type ResolvedMark, resolveMarks } from './marks.js'
import { BLANK, page } from './slots.js'
import { mm, type Pt, pt } from './units.js'

const A4L = size(841.89, 595.28)
const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const sheetWith = (margin = mm(10)) => {
  const grid = buildGrid(A4L, 1, 2, margin, pt(0))
  const sheets = assemble(
    [{ slots: [page(0), page(1)], side: 'front', folioSideIndex: 0 }],
    grid,
    [A5, A5],
    A5,
    { bleed: mm(3), scaling: 'fit' },
    margin,
    pt(0),
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('нет листа')
  return { sheet, grid, margin }
}

/** Лист под три полосы в ряд: доли листа и границы ячеек здесь расходятся. */
const threeUp = (margin: Pt, gap: Pt) => {
  const sheetSize = size(700, 320)
  const grid = buildGrid(sheetSize, 1, 3, margin, gap)
  const sheets = assemble(
    [{ slots: [page(0), page(1), page(2)], side: 'single', folioSideIndex: 0 }],
    grid,
    [A5, A5, A5],
    A5,
    { bleed: pt(0), scaling: 'fit' },
    margin,
    gap,
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('нет листа')
  return { sheet, grid, sheetSize, margin }
}

const CROP = { kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) } as const
const FOLD = { kind: 'fold', length: mm(5), pen: pt(0.2) } as const

const cropOf = (sheet: Sheet, grid: Grid, margin: Pt, folded: boolean, sheetSize = A4L) =>
  resolveMarks(sheet, sheetSize, grid, [CROP], margin, folded)

/**
 * Разворот, где полосы стоят вплотную: лист ровно под две полосы с полями, масштаб
 * натуральный. При вписывании полосы центрируются в ячейках и между ними остаётся щель.
 */
const spread = (margin = mm(10)) => {
  const sheetSize = size(2 * A5.trim.w + 2 * margin, A5.trim.h + 2 * margin)
  const grid = buildGrid(sheetSize, 1, 2, margin, pt(0))
  const sheets = assemble(
    [{ slots: [page(0), page(1)], side: 'front', folioSideIndex: 0 }],
    grid,
    [A5, A5],
    A5,
    { bleed: mm(3), scaling: 'actual' },
    margin,
    pt(0),
  )
  const sheet = sheets[0]
  if (sheet === undefined) throw new Error('нет листа')
  return { sheet, grid, margin, sheetSize }
}

const blockOf = (sheet: Sheet) => ({
  left: Math.min(...sheet.placements.map((p) => p.trim.x)),
  right: Math.max(...sheet.placements.map((p) => p.trim.x + p.trim.w)),
  bottom: Math.min(...sheet.placements.map((p) => p.trim.y)),
  top: Math.max(...sheet.placements.map((p) => p.trim.y + p.trim.h)),
})

const distinctRounded = (values: readonly number[]) =>
  [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)

/** Координаты вертикальных линий реза, по которым стоят штрихи. */
const verticalXs = (marks: readonly ResolvedMark[]) =>
  distinctRounded(
    marks.flatMap((m) => (m.kind === 'line' && m.from.x === m.to.x ? [m.from.x] : [])),
  )

const horizontalYs = (marks: readonly ResolvedMark[]) =>
  distinctRounded(
    marks.flatMap((m) => (m.kind === 'line' && m.from.y === m.to.y ? [m.from.y] : [])),
  )

const foldLinesX = (marks: readonly ResolvedMark[]): readonly number[] =>
  [...new Set(marks.flatMap((m) => (m.kind === 'line' && m.dash !== null ? [m.from.x] : [])))].sort(
    (a, b) => a - b,
  )

describe('метки', () => {
  it('метки реза стоят по линиям реза, общая линия соседних полос даёт одну метку', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const marks = cropOf(sheet, grid, margin, false, sheetSize)
    // Три вертикальные линии (общая посередине одна) и две горизонтальные, по штриху с концов.
    expect(verticalXs(marks)).toHaveLength(3)
    expect(horizontalYs(marks)).toHaveLength(2)
    expect(marks).toHaveLength(10)
  })

  it('внутри блока полос меток реза нет', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const block = blockOf(sheet)
    // Штрих, лежащий на линии реза соседней полосы, тоже внутри: он напечатается на её краю.
    const e = 0.01
    const within = (p: { x: number; y: number }) =>
      p.x > block.left + e && p.x < block.right - e && p.y > block.bottom - e && p.y < block.top + e
    const inside = cropOf(sheet, grid, margin, false, sheetSize).some(
      (m) => m.kind === 'line' && (within(m.from) || within(m.to)),
    )
    expect(inside).toBe(false)
  })

  it('штрих начинается на отступе от края блока и уходит наружу на свою длину', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const block = blockOf(sheet)
    const above = cropOf(sheet, grid, margin, false, sheetSize).filter(
      (m) => m.kind === 'line' && m.from.x === m.to.x && m.from.y > block.top,
    )
    expect(above).toHaveLength(3)
    for (const m of above) {
      if (m.kind !== 'line') continue
      expect(Math.min(m.from.y, m.to.y)).toBeCloseTo(block.top + mm(3), 6)
      expect(Math.abs(m.to.y - m.from.y)).toBeCloseTo(mm(5), 6)
    }
  })

  it('на корешке сфальцованного разворота метки реза нет', () => {
    const { sheet, grid, margin, sheetSize } = spread()
    const marks = cropOf(sheet, grid, margin, true, sheetSize)
    const xs = verticalXs(marks)
    expect(xs).toHaveLength(2)
    expect(xs.some((x) => Math.abs(x - sheetSize.w / 2) < 1)).toBe(false)
    expect(marks).toHaveLength(8)
  })

  it('при зазоре у каждой полосы своя линия реза', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), mm(6))
    const marks = resolveMarks(sheet, sheetSize, grid, [CROP], margin, false)
    expect(verticalXs(marks)).toHaveLength(6)
  })

  it('линия, которая ограничивает только пустую ячейку, меток не получает', () => {
    const margin = mm(10)
    const grid = buildGrid(A4L, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [page(0), BLANK], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5, A5],
      A5,
      { bleed: mm(3), scaling: 'fit' },
      margin,
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    const marks = cropOf(sheet, grid, margin, false)
    // Левый и общий края занятой полосы есть, правого края пустой ячейки нет.
    expect(verticalXs(marks)).toHaveLength(2)
    // Горизонтальные линии занятой полосы доходят до края всего блока, пустая ячейка не в счёт.
    expect(horizontalYs(marks)).toHaveLength(2)
  })

  it('узкое поле обрезает штрихи по краю листа, а за край не выпускает', () => {
    const { sheet, grid, sheetSize } = spread(mm(5))
    const marks = cropOf(sheet, grid, mm(5), false, sheetSize)
    for (const m of marks) {
      if (m.kind !== 'line') continue
      for (const p of [m.from, m.to]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9)
        expect(p.y).toBeGreaterThanOrEqual(-1e-9)
        expect(p.x).toBeLessThanOrEqual(sheetSize.w + 1e-9)
        expect(p.y).toBeLessThanOrEqual(sheetSize.h + 1e-9)
      }
    }
    expect(marks.length).toBeGreaterThan(0)
  })

  it('поле не больше отступа не оставляет места ни одному штриху', () => {
    const { sheet, grid, sheetSize } = spread(mm(2))
    expect(cropOf(sheet, grid, mm(2), false, sheetSize)).toHaveLength(0)
  })

  it('в схеме без сгиба метки фальцовки не ставятся даже по просьбе', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(sheet, A4L, grid, [FOLD], margin, false)
    expect(marks).toHaveLength(0)
  })

  it('метка фальцовки рисуется пунктиром на сгибе разворота', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    const folds = marks.filter((m) => m.kind === 'line' && m.dash !== null)
    expect(folds).toHaveLength(2)
    for (const f of folds) {
      if (f.kind === 'line') expect(f.from.x).toBeCloseTo(A4L.w / 2, 6)
    }
  })

  it('при трёх колонках метки фальцовки идут по границам ячеек, а не по долям листа', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), pt(0))
    const marks = resolveMarks(
      sheet,
      sheetSize,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    // Доли листа дали бы 233.33 и 466.67 — мимо стыка полос почти на десять пунктов.
    const xs = foldLinesX(marks)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(242.7822, 3)
    expect(xs[1]).toBeCloseTo(457.2178, 3)
  })

  it('при зазоре метка фальцовки идёт по его середине', () => {
    const { sheet, grid, sheetSize, margin } = threeUp(mm(10), mm(6))
    const marks = resolveMarks(
      sheet,
      sheetSize,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
      true,
    )
    const xs = foldLinesX(marks)
    expect(xs[0]).toBeCloseTo(239.9475, 3)
    expect(xs[1]).toBeCloseTo(460.0525, 3)
  })

  it('вокруг пустого слота метки реза не рисуются', () => {
    const margin = mm(10)
    const grid = buildGrid(A4L, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [page(0), BLANK], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5, A5],
      A5,
      { bleed: mm(3), scaling: 'fit' },
      margin,
      pt(0),
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
      margin,
      false,
    )
    // Восемь линий на единственную занятую ячейку, вокруг пустой — ничего.
    expect(marks.filter((m) => m.kind === 'line')).toHaveLength(8)
  })

  it('метки приводки не ставятся при узком поле', () => {
    const { sheet, grid } = sheetWith(mm(4))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      mm(4),
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(0)
  })

  it('метки приводки не ставятся, если радиус не помещается в поле', () => {
    const { sheet, grid, margin } = sheetWith(mm(12))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(10), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(0)
  })

  it('поле ровно на пороге даёт метки приводки', () => {
    const { sheet, grid, margin } = sheetWith(mm(8))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(4)
  })

  it('метки приводки ставятся по четырём сторонам при достаточном поле', () => {
    const { sheet, grid, margin } = sheetWith(mm(12))
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'registration', radius: mm(3), pen: pt(0.2) }],
      margin,
      false,
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(4)
  })

  it('пустая полоса брошюры режется как настоящая: после фальцовки это страница тетради', () => {
    const margin = mm(10)
    const sheetSize = size(2 * A5.trim.w + 2 * margin, A5.trim.h + 2 * margin)
    const grid = buildGrid(sheetSize, 1, 2, margin, pt(0))
    const sheets = assemble(
      [{ slots: [BLANK, page(0)], side: 'front', folioSideIndex: 0 }],
      grid,
      [A5],
      A5,
      { bleed: pt(0), scaling: 'actual' },
      margin,
      pt(0),
      true,
    )
    const sheet = sheets[0]
    if (sheet === undefined) throw new Error('нет листа')
    const xs = verticalXs(resolveMarks(sheet, sheetSize, grid, [CROP], margin, true))
    // Оба внешних края разворота: и у пустой полосы, и у занятой.
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(margin, 2)
  })
})
