import { describe, expect, it } from 'vitest'
import { size } from '../domain/geometry.js'
import type { DocumentInfo } from '../domain/job.js'
import { mm, pt, toMm } from '../domain/units.js'
import { DEFAULT_SETTINGS, neededMarginMm, resolve, type Settings } from './settings.js'

const docOf = (wMm: number, hMm: number, pageCount = 16): DocumentInfo => ({
  pageCount,
  pages: Array.from({ length: pageCount }, () => ({
    trim: { x: pt(0), y: pt(0), w: mm(wMm), h: mm(hMm) },
    media: { x: pt(0), y: pt(0), w: mm(wMm), h: mm(hMm) },
    hasTrimBox: false,
    bleed: null,
  })),
  uniformSize: size(mm(wMm), mm(hMm)),
})

const a5 = docOf(148, 210)
const marks = (on: Partial<Settings['marks']>): Settings['marks'] => ({
  crop: false,
  fold: false,
  registration: false,
  ...on,
})

describe('задание из параметров', () => {
  it('по умолчанию брошюра из A5 сразу строится на альбомном A4 в натуральную величину', () => {
    const r = resolve(DEFAULT_SETTINGS, a5)
    expect(r.sheet).toMatchObject({ format: 'a4', orientation: 'landscape' })
    expect(r.plan.ok).toBe(true)
    expect(r.scale).toBe(1)
    expect(r.marginMm).toBe(0)
  })

  it('миллиметры переводятся в пункты', () => {
    const { job } = resolve({ ...DEFAULT_SETTINGS, marginMm: 10, gapMm: 4, bleedMm: 3 }, a5)
    expect(toMm(job.sheet.margin)).toBeCloseTo(10, 6)
    expect(toMm(job.sheet.gap)).toBeCloseTo(4, 6)
    expect(toMm(job.source.bleed)).toBeCloseTo(3, 6)
  })

  it('явный формат с ориентацией не подбирается', () => {
    const { sheet } = resolve({ ...DEFAULT_SETTINGS, format: 'sra3', orientation: 'portrait' }, a5)
    expect(sheet.format).toBe('sra3')
    expect(toMm(sheet.size.w)).toBeCloseTo(320, 6)
  })

  it('сетка переходит между схемами, метки собираются по флажкам', () => {
    const { job } = resolve(
      {
        ...DEFAULT_SETTINGS,
        scheme: 'cutStack',
        rows: 3,
        cols: 2,
        marks: marks({ crop: true, registration: true }),
      },
      a5,
    )
    expect(job.scheme).toEqual({ kind: 'cutStack', rows: 3, cols: 2 })
    expect(job.marks.map((m) => m.kind)).toEqual(['crop', 'registration'])
  })
})

describe('поле auto', () => {
  it('без меток и вылета поля нет, вылету поле нужно ровно под вылет', () => {
    expect(neededMarginMm(DEFAULT_SETTINGS)).toBe(0)
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, bleedMm: 3 })).toBe(3)
  })

  it('метки реза умещаются в пять миллиметров поля', () => {
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, marks: marks({ crop: true }) })).toBe(5)
  })

  it('при вылете до трёх миллиметров поле под метки остаётся пять: штрих укорачивается', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, bleedMm: 3, marks: marks({ crop: true }) }
    expect(neededMarginMm(s)).toBe(5)
    const crop = resolve(s, a5).job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('нет метки реза')
    expect(toMm(crop.offset)).toBeCloseTo(3, 6)
    expect(toMm(crop.length)).toBeCloseTo(2, 6)
  })

  it('отступ метки реза растёт вместе с вылетом, чтобы метка не легла на вылет', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, bleedMm: 5, marks: marks({ crop: true }) }
    // Короче двух миллиметров штрих не делается: резчик его не увидит.
    expect(neededMarginMm(s)).toBe(7)
    const crop = resolve(s, a5).job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('нет метки реза')
    expect(toMm(crop.offset)).toBeCloseTo(5, 6)
  })

  it('метки фальцовки просят поле только у брошюры: в других схемах их нет', () => {
    const fold = marks({ fold: true })
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, marks: fold })).toBe(5)
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, scheme: 'nup', marks: fold })).toBe(0)
  })

  it('метки приводки получают поле, в котором домен их действительно ставит', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ registration: true }) }
    const r = resolve(s, a5)
    if (!r.plan.ok) throw new Error('план не построен')
    const kinds = r.plan.value.sheets[0]?.marks.map((m) => m.kind)
    expect(kinds).toContain('registration')
  })

  it('поле из auto попадает в задание, заданное вручную — как есть', () => {
    const on = marks({ crop: true })
    expect(resolve({ ...DEFAULT_SETTINGS, marks: on }, a5).marginMm).toBe(5)
    expect(resolve({ ...DEFAULT_SETTINGS, marks: on, marginMm: 2 }, a5).marginMm).toBe(2)
  })
})

describe('масштаб', () => {
  it('брошюра из A4 альбомных не влезает никуда и вписывается в самый большой лист', () => {
    const r = resolve(DEFAULT_SETTINGS, docOf(297, 210, 32))
    expect(r.plan.ok).toBe(true)
    expect(r.sheet.format).toBe('sra3')
    expect(r.job.source.scaling).toBe('fit')
    expect(r.scale).toBeCloseTo(450 / 594, 3)
  })

  it('на явно выбранный маленький лист вписывается в него', () => {
    const r = resolve(
      { ...DEFAULT_SETTINGS, format: 'a4', orientation: 'landscape' },
      docOf(297, 210, 32),
    )
    expect(r.sheet.format).toBe('a4')
    expect(r.scale).toBeCloseTo(0.5, 3)
  })

  it('влезающие полосы не масштабируются', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'a3', orientation: 'landscape' }, a5)
    expect(r.job.source.scaling).toBe('actual')
    expect(r.scale).toBe(1)
  })
})

describe('свой формат листа', () => {
  it('лист ровно заданного размера, ориентация по сторонам', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'custom', customWMm: 296, customHMm: 226 }, a5)
    expect(r.sheet.format).toBe('custom')
    expect(r.sheet.orientation).toBe('landscape')
    expect(toMm(r.sheet.size.w)).toBeCloseTo(296, 6)
    expect(toMm(r.sheet.size.h)).toBeCloseTo(226, 6)
    expect(r.plan.ok).toBe(true)
  })

  it('на своём листе, где полосы не влезают, они вписываются, как на стандартном', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'custom', customWMm: 200, customHMm: 150 }, a5)
    expect(r.scale).toBeLessThan(1)
    expect(r.plan.ok).toBe(true)
  })
})

describe('вылет auto', () => {
  const withBleed = (bleedMm: number): DocumentInfo => {
    const base = docOf(145, 205, 4)
    return {
      ...base,
      pages: base.pages.map((p) => ({
        ...p,
        hasTrimBox: true,
        bleed: {
          x: pt(p.trim.x - mm(bleedMm)),
          y: pt(p.trim.y - mm(bleedMm)),
          w: pt(p.trim.w + 2 * mm(bleedMm)),
          h: pt(p.trim.h + 2 * mm(bleedMm)),
        },
      })),
    }
  }

  it('по умолчанию вылет берётся из BleedBox файла', () => {
    const r = resolve(DEFAULT_SETTINGS, withBleed(3))
    expect(r.bleedMm).toBe(3)
    expect(toMm(r.job.source.bleed)).toBeCloseTo(3, 6)
  })

  it('без BleedBox в файле вылет auto нулевой', () => {
    expect(resolve(DEFAULT_SETTINGS, a5).bleedMm).toBe(0)
  })

  it('заданный вручную вылет файл не перебивает', () => {
    expect(resolve({ ...DEFAULT_SETTINGS, bleedMm: 1 }, withBleed(3)).bleedMm).toBe(1)
  })

  it('поле auto и отступ меток считаются от вылета файла', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ crop: true }) }
    const r = resolve(s, withBleed(4))
    expect(r.marginMm).toBe(6)
    const crop = r.job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('нет метки реза')
    expect(toMm(crop.offset)).toBeCloseTo(4, 6)
  })
})
