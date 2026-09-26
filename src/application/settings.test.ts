import { describe, expect, it } from 'vitest'
import { size } from '../domain/geometry.js'
import type { DocumentInfo } from '../domain/job.js'
import type { CropGeometry } from '../domain/marks.js'
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
  cropMarks: null,
})

const a5 = docOf(148, 210)
/** Crop marks as InDesign places them by default. */
const INDESIGN: CropGeometry = {
  offset: mm(2.117),
  length: mm(5.29),
  pen: pt(0.25),
  halo: pt(1.25),
}
const withFileMarks: DocumentInfo = { ...a5, cropMarks: INDESIGN }
const marks = (on: Partial<Settings['marks']>): Settings['marks'] => ({
  crop: false,
  fold: false,
  registration: false,
  ...on,
})

describe('job from settings', () => {
  it('by default an A5 booklet builds right away on landscape A4 at actual size', () => {
    const r = resolve(DEFAULT_SETTINGS, a5)
    expect(r.sheet).toMatchObject({ format: 'a4', orientation: 'landscape' })
    expect(r.plan.ok).toBe(true)
    expect(r.scale).toBe(1)
    expect(r.marginMm).toBe(0)
  })

  it('millimeters are converted to points', () => {
    const { job } = resolve({ ...DEFAULT_SETTINGS, marginMm: 10, gapMm: 4, bleedMm: 3 }, a5)
    expect(toMm(job.sheet.margin)).toBeCloseTo(10, 6)
    expect(toMm(job.sheet.gap)).toBeCloseTo(4, 6)
    expect(toMm(job.source.bleed)).toBeCloseTo(3, 6)
  })

  it('an explicit format with an orientation is not auto-picked', () => {
    const { sheet } = resolve({ ...DEFAULT_SETTINGS, format: 'sra3', orientation: 'portrait' }, a5)
    expect(sheet.format).toBe('sra3')
    expect(toMm(sheet.size.w)).toBeCloseTo(320, 6)
  })

  it('the grid carries over between schemes, marks are collected from the checkboxes', () => {
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

describe('auto margin', () => {
  it('no marks and no bleed means no margin, bleed needs a margin exactly its width', () => {
    expect(neededMarginMm(DEFAULT_SETTINGS)).toBe(0)
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, bleedMm: 3 })).toBe(3)
  })

  it('crop marks fit into five millimeters of margin', () => {
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, marks: marks({ crop: true }) })).toBe(5)
  })

  it('with bleed up to 3 mm the margin for marks stays 5 mm: the line gets shorter', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, bleedMm: 3, marks: marks({ crop: true }) }
    expect(neededMarginMm(s)).toBe(5)
    const crop = resolve(s, a5).job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('no crop mark')
    expect(toMm(crop.offset)).toBeCloseTo(3, 6)
    expect(toMm(crop.length)).toBeCloseTo(2, 6)
  })

  it('the crop mark offset grows with the bleed so the mark stays off the bleed', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, bleedMm: 5, marks: marks({ crop: true }) }
    // The line is never made shorter than two millimeters: the cutter wouldn't see it.
    expect(neededMarginMm(s)).toBe(7)
    const crop = resolve(s, a5).job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('no crop mark')
    expect(toMm(crop.offset)).toBeCloseTo(5, 6)
  })

  it('fold marks ask for a margin only in a booklet: other schemes have none', () => {
    const fold = marks({ fold: true })
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, marks: fold })).toBe(5)
    expect(neededMarginMm({ ...DEFAULT_SETTINGS, scheme: 'nup', marks: fold })).toBe(0)
  })

  it('registration marks get a margin in which the domain actually places them', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ registration: true }) }
    const r = resolve(s, a5)
    if (!r.plan.ok) throw new Error('plan not built')
    const kinds = r.plan.value.sheets[0]?.marks.map((m) => m.kind)
    expect(kinds).toContain('registration')
  })

  it('a margin from auto goes into the job, a manually set one goes in as is', () => {
    const on = marks({ crop: true })
    expect(resolve({ ...DEFAULT_SETTINGS, marks: on }, a5).marginMm).toBe(5)
    expect(resolve({ ...DEFAULT_SETTINGS, marks: on, marginMm: 2 }, a5).marginMm).toBe(2)
  })
})

describe('scale', () => {
  it('a booklet of landscape A4 pages fits nowhere and is scaled to fit the largest sheet', () => {
    const r = resolve(DEFAULT_SETTINGS, docOf(297, 210, 32))
    expect(r.plan.ok).toBe(true)
    expect(r.sheet.format).toBe('sra3')
    expect(r.job.source.scaling).toBe('fit')
    expect(r.scale).toBeCloseTo(450 / 594, 3)
  })

  it('on an explicitly chosen small sheet it is scaled to fit that sheet', () => {
    const r = resolve(
      { ...DEFAULT_SETTINGS, format: 'a4', orientation: 'landscape' },
      docOf(297, 210, 32),
    )
    expect(r.sheet.format).toBe('a4')
    expect(r.scale).toBeCloseTo(0.5, 3)
  })

  it('pages that fit are not scaled', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'a3', orientation: 'landscape' }, a5)
    expect(r.job.source.scaling).toBe('actual')
    expect(r.scale).toBe(1)
  })
})

describe('custom sheet format', () => {
  it('the sheet is exactly the given size, orientation follows its sides', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'custom', customWMm: 296, customHMm: 226 }, a5)
    expect(r.sheet.format).toBe('custom')
    expect(r.sheet.orientation).toBe('landscape')
    expect(toMm(r.sheet.size.w)).toBeCloseTo(296, 6)
    expect(toMm(r.sheet.size.h)).toBeCloseTo(226, 6)
    expect(r.plan.ok).toBe(true)
  })

  it('pages that do not fit a custom sheet are scaled to fit it, as on a standard one', () => {
    const r = resolve({ ...DEFAULT_SETTINGS, format: 'custom', customWMm: 200, customHMm: 150 }, a5)
    expect(r.scale).toBeLessThan(1)
    expect(r.plan.ok).toBe(true)
  })
})

describe('auto bleed', () => {
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

  it('by default the bleed is taken from the BleedBox of the file', () => {
    const r = resolve(DEFAULT_SETTINGS, withBleed(3))
    expect(r.bleedMm).toBe(3)
    expect(toMm(r.job.source.bleed)).toBeCloseTo(3, 6)
  })

  it('with no BleedBox in the file, auto bleed is zero', () => {
    expect(resolve(DEFAULT_SETTINGS, a5).bleedMm).toBe(0)
  })

  it('the file does not override a manually set bleed', () => {
    expect(resolve({ ...DEFAULT_SETTINGS, bleedMm: 1 }, withBleed(3)).bleedMm).toBe(1)
  })

  it('the auto margin and the mark offset are computed from the file bleed', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ crop: true }) }
    const r = resolve(s, withBleed(4))
    expect(r.marginMm).toBe(6)
    const crop = r.job.marks[0]
    if (crop?.kind !== 'crop') throw new Error('no crop mark')
    expect(toMm(crop.offset)).toBeCloseTo(4, 6)
  })

  it('crop marks from the file keep its numbers, even when the offset is under the bleed', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ crop: true }) }
    expect(resolve(s, withFileMarks).job.marks).toEqual([{ kind: 'crop', ...INDESIGN }])
    // The InDesign mark reaches into the bleed, the white underlay sets it off the background:
    // the numbers stay untouched.
    expect(resolve({ ...s, bleedMm: 3 }, withFileMarks).job.marks).toEqual([
      { kind: 'crop', ...INDESIGN },
    ])
  })

  it('the auto margin fits the file marks whole: offset plus length', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, marks: marks({ crop: true }) }
    expect(resolve(s, withFileMarks).marginMm).toBeCloseTo(7.41, 2)
    expect(neededMarginMm(s, 0, INDESIGN)).toBeCloseTo(7.41, 2)
  })

  it('disabled crop marks take neither numbers nor margin from the file', () => {
    const r = resolve(DEFAULT_SETTINGS, withFileMarks)
    expect(r.job.marks).toEqual([])
    expect(r.marginMm).toBe(0)
  })
})
