import { describe, expect, it } from 'vitest'
import { assemble } from './assemble.js'
import { rect, size } from './geometry.js'
import { buildGrid } from './grid.js'
import { resolveMarks } from './marks.js'
import { page } from './slots.js'
import { mm, pt } from './units.js'

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
