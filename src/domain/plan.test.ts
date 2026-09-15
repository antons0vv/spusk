import { describe, expect, it } from 'vitest'
import { type Rect, rect, size } from './geometry.js'
import type { DocumentInfo, Job } from './job.js'
import { type BadParameter, plan } from './plan.js'
import { isErr, isOk } from './result.js'
import { mm, pt } from './units.js'

const A5 = { trim: rect(0, 0, 419.53, 595.28), media: rect(0, 0, 419.53, 595.28) }

const doc = (pageCount: number, hasTrim = true): DocumentInfo => ({
  pageCount,
  pages: Array.from({ length: pageCount }, () => ({ ...A5, hasTrimBox: hasTrim, bleed: null })),
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

  it('выползание нарастает монотонно от внешнего листа к внутреннему', () => {
    const r = plan(bookletJob(), doc(16))
    if (!isOk(r)) throw new Error('план не построен')
    const leftX = r.value.sheets.map((s) => s.placements[0]?.trim.x ?? 0)
    expect(leftX).toHaveLength(8)
    for (let i = 0; i < leftX.length; i += 2) {
      // Обе стороны одного листа сдвинуты одинаково.
      expect(leftX[i]).toBeCloseTo(leftX[i + 1] ?? 0, 9)
      // Каждый следующий лист внутрь сдвинут сильнее предыдущего.
      if (i > 0) expect(leftX[i] ?? 0).toBeGreaterThan(leftX[i - 2] ?? 0)
    }
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

  it('превышение меньше сотой доли пункта непомещением не считается', () => {
    const barely: DocumentInfo = {
      pageCount: 2,
      pages: Array.from({ length: 2 }, () => ({
        // Ячейка на листе A4 альбомном ровно 420.945 шириной.
        trim: rect(0, 0, 420.9455, 595.28),
        media: rect(0, 0, 420.9455, 595.28),
        hasTrimBox: true,
        bleed: null,
      })),
      uniformSize: size(420.9455, 595.28),
    }
    expect(isOk(plan(bookletJob(), barely))).toBe(true)
  })

  it('превышение в две сотых пункта уже считается непомещением', () => {
    const tooBig: DocumentInfo = {
      pageCount: 2,
      pages: Array.from({ length: 2 }, () => ({
        // Ячейка ровно 420.945, превышение вдвое больше допуска.
        trim: rect(0, 0, 420.965, 595.28),
        media: rect(0, 0, 420.965, 595.28),
        hasTrimBox: true,
        bleed: null,
      })),
      uniformSize: size(420.965, 595.28),
    }
    expect(isErr(plan(bookletJob(), tooBig))).toBe(true)
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

  it('выравнивание приводит разные полосы к общему обрезному формату', () => {
    const mixed: DocumentInfo = {
      pageCount: 2,
      pages: [
        { trim: rect(0, 0, 400, 500), media: rect(0, 0, 400, 500), hasTrimBox: true, bleed: null },
        { trim: rect(0, 0, 300, 400), media: rect(0, 0, 300, 400), hasTrimBox: true, bleed: null },
      ],
      uniformSize: null,
    }
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
      source: { bleed: pt(0), scaling: 'actual', normalizeSizes: true },
    })
    const r = plan(job, mixed)
    if (!isOk(r)) throw new Error('план не построен')
    for (const sheet of r.value.sheets) {
      for (const placement of sheet.placements) {
        expect(placement.trim.w).toBeCloseTo(400, 6)
        expect(placement.trim.h).toBeCloseTo(500, 6)
      }
    }
    expect(r.value.warnings).not.toContainEqual({ kind: 'MixedPageSizes' })
  })

  it('отказ по размеру называет самую большую полосу, а не первую', () => {
    const mixed: DocumentInfo = {
      pageCount: 2,
      pages: [
        { trim: rect(0, 0, 100, 100), media: rect(0, 0, 100, 100), hasTrimBox: true, bleed: null },
        { trim: rect(0, 0, 900, 100), media: rect(0, 0, 900, 100), hasTrimBox: true, bleed: null },
      ],
      uniformSize: null,
    }
    const r = plan(bookletJob(), mixed)
    expect(isErr(r)).toBe(true)
    if (isErr(r) && r.error.kind === 'DoesNotFit') {
      expect(r.error.needed.w).toBeCloseTo(900, 6)
    }
  })

  it('переплёт справа зеркалит развороты', () => {
    const straight = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
    })
    const mirrored = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'right', creepPerSheet: pt(0) },
    })
    const left = plan(straight, doc(8))
    const right = plan(mirrored, doc(8))
    if (!isOk(left) || !isOk(right)) throw new Error('план не построен')
    const leftSources = left.value.sheets[0]?.placements.map((p) => p.source) ?? []
    const rightSources = right.value.sheets[0]?.placements.map((p) => p.source) ?? []
    expect(rightSources).toEqual([...leftSources].reverse())
  })

  it('переплёт сверху ставит полосы одна над другой', () => {
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 'all', binding: 'top', creepPerSheet: pt(0) },
      sheet: { size: size(595.28, 841.89), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    })
    const r = plan(job, doc(4))
    if (!isOk(r)) throw new Error('план не построен')
    const placements = r.value.sheets[0]?.placements ?? []
    expect(placements).toHaveLength(2)
    expect(placements[0]?.trim.y ?? 0).toBeGreaterThan(placements[1]?.trim.y ?? 0)
    expect(placements[0]?.trim.x).toBeCloseTo(placements[1]?.trim.x ?? 0, 6)
  })

  it('тетради по восемь сбрасывают выползание на границе тетради', () => {
    const job = bookletJob({
      scheme: { kind: 'booklet', folio: 8, binding: 'left', creepPerSheet: mm(0.5) },
    })
    const r = plan(job, doc(16))
    if (!isOk(r)) throw new Error('план не построен')
    const leftX = r.value.sheets.map((s) => s.placements[0]?.trim.x ?? 0)
    expect(leftX[0]).toBeCloseTo(leftX[4] ?? 0, 9)
    expect(leftX[6] ?? 0).toBeGreaterThan(leftX[4] ?? 0)
  })

  it('метки разворачиваются на каждый лист', () => {
    const job = bookletJob({
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
    })
    const r = plan(job, doc(8))
    if (!isOk(r)) throw new Error('план не построен')
    // Две внешние вертикали и две горизонтали разворота, по штриху с концов; корешок не режут.
    for (const sheet of r.value.sheets) {
      expect(sheet.marks.filter((m) => m.kind === 'line')).toHaveLength(8)
    }
  })

  it('step and repeat и cut and stack проходят через планировщик без добивки', () => {
    const fit = { bleed: pt(0), scaling: 'fit', normalizeSizes: false } as const
    const repeat = plan(
      bookletJob({ scheme: { kind: 'stepRepeat', rows: 2, cols: 2, copies: 6 }, source: fit }),
      doc(1),
    )
    if (!isOk(repeat)) throw new Error('план не построен')
    expect(repeat.value.sheets).toHaveLength(2)
    expect(repeat.value.padding).toBe(0)

    const stack = plan(
      bookletJob({ scheme: { kind: 'cutStack', rows: 2, cols: 2 }, source: fit }),
      doc(16),
    )
    if (!isOk(stack)) throw new Error('план не построен')
    expect(stack.value.sheets).toHaveLength(4)
    expect(stack.value.padding).toBe(0)
  })

  it('противоречивые параметры отвергаются и называют, что именно не так', () => {
    const cases: readonly (readonly [Job, BadParameter])[] = [
      [bookletJob({ scheme: { kind: 'nup', rows: 2.5, cols: 2, fill: 'rows' } }), 'grid'],
      [bookletJob({ scheme: { kind: 'stepRepeat', rows: 2, cols: 2, copies: 0 } }), 'copies'],
      [
        bookletJob({
          scheme: { kind: 'booklet', folio: 6, binding: 'left', creepPerSheet: pt(0) },
        }),
        'folio',
      ],
      [bookletJob({ sheet: { size: size(0, 595.28), margin: pt(0), gap: pt(0) } }), 'sheet'],
      [
        bookletJob({ sheet: { size: size(841.89, 595.28), margin: pt(500), gap: pt(0) } }),
        'margins',
      ],
      [bookletJob({ source: { bleed: pt(-1), scaling: 'fit', normalizeSizes: false } }), 'margins'],
    ]
    for (const [job, what] of cases) {
      const r = plan(job, doc(4))
      expect(isErr(r)).toBe(true)
      if (!isErr(r)) continue
      expect(r.error.kind).toBe('BadParameters')
      if (r.error.kind !== 'BadParameters') continue
      expect(r.error.what).toBe(what)
      expect(r.error.message.length).toBeGreaterThan(0)
    }
  })

  it('полоса с нулевым или нечисловым обрезным форматом отвергается', () => {
    const broken: readonly Rect[] = [
      rect(0, 0, 0, 595.28),
      rect(0, 0, 419.53, 0),
      rect(0, 0, Number.NaN, 595.28),
      rect(0, 0, 419.53, Number.POSITIVE_INFINITY),
      rect(0, 0, -419.53, 595.28),
    ]
    for (const trim of broken) {
      const damaged: DocumentInfo = {
        pageCount: 2,
        // Вторая полоса целая: отказ обязан прийти и из-за одной испорченной.
        pages: [
          { trim, media: rect(0, 0, 419.53, 595.28), hasTrimBox: true, bleed: null },
          { ...A5, hasTrimBox: true, bleed: null },
        ],
        uniformSize: null,
      }
      const r = plan(bookletJob(), damaged)
      expect(isErr(r)).toBe(true)
      if (!isErr(r)) continue
      expect(r.error.kind).toBe('BadParameters')
      if (r.error.kind !== 'BadParameters') continue
      expect(r.error.what).toBe('pages')
    }
  })

  it('пустой документ и противоречивое описание отвергаются', () => {
    const empty = plan(bookletJob(), doc(0))
    expect(isErr(empty)).toBe(true)

    const inconsistent: DocumentInfo = { ...doc(4), pageCount: 5 }
    const r = plan(bookletJob(), inconsistent)
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
