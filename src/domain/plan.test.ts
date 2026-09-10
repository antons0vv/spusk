import { describe, expect, it } from 'vitest'
import { rect, size } from './geometry.js'
import type { DocumentInfo, Job } from './job.js'
import { plan } from './plan.js'
import { isErr, isOk } from './result.js'
import { mm, pt } from './units.js'

const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const doc = (pageCount: number, hasTrim = true): DocumentInfo => ({
  pageCount,
  pages: Array.from({ length: pageCount }, () => ({ ...A5, hasTrimBox: hasTrim })),
  uniformSize: size(419.53, 595.28),
})

const bookletJob = (overrides: Partial<Job> = {}): Job => ({
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: mm(0.4) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
  ...overrides,
})

describe('планировщик', () => {
  it('брошюра из 16 полос даёт восемь сторон', () => {
    const r = plan(bookletJob(), doc(16))
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value.sheets).toHaveLength(8)
  })

  it('выползание нарастает от внешнего листа к внутреннему', () => {
    const r = plan(bookletJob(), doc(16))
    if (!isOk(r)) throw new Error('план не построен')
    const leftX = r.value.sheets.map((s) => s.placements[0]?.trim.x ?? 0)
    expect(leftX[0]).toBeCloseTo(leftX[1] ?? 0, 6)
    expect(leftX[2] ?? 0).toBeGreaterThan(leftX[0] ?? 0)
    expect(leftX[6] ?? 0).toBeGreaterThan(leftX[4] ?? 0)
  })

  it('добивка пустыми попадает в предупреждения', () => {
    const r = plan(bookletJob(), doc(13))
    if (!isOk(r)) throw new Error('план не построен')
    expect(r.value.padding).toBe(3)
    expect(r.value.warnings).toContainEqual({ kind: 'PaddedToFolio', added: 3 })
  })

  it('отсутствие TrimBox при заданном вылете предупреждает', () => {
    const job = bookletJob({ source: { bleed: mm(3), scaling: 'actual', normalizeSizes: false } })
    const r = plan(job, doc(4, false))
    if (!isOk(r)) throw new Error('план не построен')
    expect(r.value.warnings).toContainEqual({ kind: 'NoTrimBox', pages: 4 })
  })

  it('разные размеры полос предупреждают, если выравнивание выключено', () => {
    const mixed: DocumentInfo = { ...doc(4), uniformSize: null }
    const r = plan(bookletJob(), mixed)
    if (!isOk(r)) throw new Error('план не построен')
    expect(r.value.warnings).toContainEqual({ kind: 'MixedPageSizes' })
  })

  it('полоса, не влезающая в натуральную величину, это отказ', () => {
    const job = bookletJob({ sheet: { size: size(400, 400), margin: pt(0), gap: pt(0) } })
    const r = plan(job, doc(4))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('DoesNotFit')
  })

  it('нулевые строки или колонки это отказ по параметрам', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'nup', rows: 0, cols: 2, fill: 'rows' },
    }
    const r = plan(job, doc(4))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('BadParameters')
  })

  it('тетрадь не кратная четырём это отказ по параметрам', () => {
    for (const folio of [0, 3, 6, -8]) {
      const job = bookletJob({
        scheme: { kind: 'booklet', folio, binding: 'left', creepPerSheet: mm(0.4) },
      })
      const r = plan(job, doc(16))
      expect(isErr(r)).toBe(true)
      if (isErr(r)) expect(r.error.kind).toBe('BadParameters')
    }
  })

  it('инвариант: каждая полоса встречается ровно один раз', () => {
    for (const pageCount of [4, 7, 16, 33]) {
      const r = plan(bookletJob(), doc(pageCount))
      if (!isOk(r)) throw new Error('план не построен')
      const seen = r.value.sheets
        .flatMap((s) => s.placements)
        .flatMap((p) => (p.source.kind === 'page' ? [p.source.index] : []))
      expect(new Set(seen).size).toBe(pageCount)
      expect(seen).toHaveLength(pageCount)
    }
  })

  it('инвариант: число размещений равно числу листов на число ячеек', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'nup', rows: 2, cols: 2, fill: 'rows' },
      // Четыре полосы A5 на листе A4 в натуральную величину не помещаются,
      // поэтому инвариант проверяем в режиме «вписать».
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const r = plan(job, doc(7))
    if (!isOk(r)) throw new Error('план не построен')
    const total = r.value.sheets.reduce((acc, s) => acc + s.placements.length, 0)
    expect(total).toBe(r.value.sheets.length * 4)
  })
})
