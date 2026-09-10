import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.js'
import { rect, size } from './geometry.js'
import { buildGrid } from './grid.js'
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

const foldLinesX = (marks: readonly ResolvedMark[]): readonly number[] =>
  [...new Set(marks.flatMap((m) => (m.kind === 'line' && m.dash !== null ? [m.from.x] : [])))].sort(
    (a, b) => a - b,
  )

describe('метки', () => {
  it('на каждую полосу приходится восемь линий реза', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
      margin,
    )
    expect(marks.filter((m) => m.kind === 'line')).toHaveLength(16)
  })

  it('метки реза не заходят на полезную площадь полосы', () => {
    const { sheet, grid, margin } = sheetWith()
    const first = sheet.placements[0]
    if (first === undefined) throw new Error('нет размещения')
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
      margin,
    )
    const insideTrim = marks.some(
      (m) =>
        m.kind === 'line' &&
        m.from.x > first.trim.x &&
        m.from.x < first.trim.x + first.trim.w &&
        m.from.y > first.trim.y &&
        m.from.y < first.trim.y + first.trim.h,
    )
    expect(insideTrim).toBe(false)
  })

  it('метка фальцовки рисуется пунктиром на границе колонок', () => {
    const { sheet, grid, margin } = sheetWith()
    const marks = resolveMarks(
      sheet,
      A4L,
      grid,
      [{ kind: 'fold', length: mm(5), pen: pt(0.2) }],
      margin,
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
    )
    expect(marks.filter((m) => m.kind === 'registration')).toHaveLength(4)
  })
})
