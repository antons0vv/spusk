import { describe, expect, it } from 'vitest'
import { size } from '../src/domain/geometry.js'
import type { Job } from '../src/domain/job.js'
import { plan } from '../src/domain/plan.js'
import { isOk } from '../src/domain/result.js'
import { mm, pt } from '../src/domain/units.js'
import { MupdfReader } from '../src/infrastructure/pdf/mupdf-reader.js'
import { MupdfWriter } from '../src/infrastructure/pdf/mupdf-writer.js'
import { makeNumberedPdf } from './fixtures/make-pdf.js'
import { cellOf, readBack } from './fixtures/read-back.js'

const reader = new MupdfReader()
const writer = new MupdfWriter(reader)

const run = (source: Uint8Array, job: Job): Uint8Array => {
  const opened = reader.open(source)
  if (!isOk(opened)) throw new Error('document did not open')
  const built = plan(job, opened.value.info)
  if (!isOk(built)) throw new Error(`plan not built: ${JSON.stringify(built.error)}`)
  const written = writer.write(opened.value.handle, built.value)
  if (!isOk(written)) throw new Error('file not written')
  reader.close(opened.value.handle)
  return written.value
}

const A5_ON_A4: Job = {
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: mm(0.4) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
}

describe('end-to-end path', () => {
  it('sixteen pages turn into eight sheets in the right order', () => {
    const out = run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), A5_ON_A4)
    const sheets = readBack(out)
    expect(sheets).toHaveLength(8)
    const last = sheets[7]
    if (last === undefined) throw new Error('no sheet')
    expect(cellOf(last, 1, 2, 'bottom-P8')).toEqual({ row: 0, col: 0 })
    expect(cellOf(last, 1, 2, 'bottom-P9')).toEqual({ row: 0, col: 1 })
  })

  it('signatures of eight pages come out as separate signatures', () => {
    const job: Job = {
      ...A5_ON_A4,
      scheme: { kind: 'booklet', folio: 8, binding: 'left', creepPerSheet: pt(0) },
    }
    const sheets = readBack(
      run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), job),
    )
    const fifth = sheets[4]
    if (fifth === undefined) throw new Error('no sheet')
    expect(cellOf(fifth, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(fifth, 1, 2, 'bottom-P9')).toEqual({ row: 0, col: 1 })
  })

  it('creep really shifts the content of the inner sheets', () => {
    const out = run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), A5_ON_A4)
    const sheets = readBack(out)
    const outerLabel = sheets[0]?.labels.find((l) => l.text.includes('bottom-P16'))
    const innerLabel = sheets[6]?.labels.find((l) => l.text.includes('bottom-P10'))
    if (outerLabel === undefined || innerLabel === undefined) throw new Error('no labels')
    expect(innerLabel.x - outerLabel.x).toBeCloseTo(mm(1.2), 1)
  })

  it('the output does not bloat: shared resources are carried over once', () => {
    const source = makeNumberedPdf({ pageCount: 32, width: 419.53, height: 595.28 })
    const out = run(source, A5_ON_A4)
    expect(out.byteLength).toBeLessThan(source.byteLength * 2)
  })

  it('bleed is trimmed: a label beyond the trim line does not reach the sheet', () => {
    const source = makeNumberedPdf({ pageCount: 4, width: 200, height: 300, bleed: 10 })
    const job: Job = {
      ...A5_ON_A4,
      sheet: { size: size(420, 320), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
    }
    const first = readBack(run(source, job))[0]
    if (first === undefined) throw new Error('no sheet')
    // A label inside the trim line stays, a label beyond it is trimmed off.
    expect(first.labels.some((l) => l.text.startsWith('bottom-P'))).toBe(true)
    expect(first.labels.some((l) => l.text.startsWith('bleed-P'))).toBe(false)
  })

  it('a single page in many copies does not multiply its content', () => {
    const source = makeNumberedPdf({ pageCount: 1, width: 241, height: 155 })
    const job: Job = {
      ...A5_ON_A4,
      scheme: { kind: 'stepRepeat', rows: 5, cols: 2, copies: 40 },
      sheet: { size: size(595.28, 841.89), margin: mm(10), gap: mm(6) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [],
    }
    const out = run(source, job)
    // Forty copies on four sheets: the form is built once and reused,
    // so the output must stay of the same order as the source.
    expect(readBack(out)).toHaveLength(4)
    expect(out.byteLength).toBeLessThan(source.byteLength * 3)
  })

  it('step and repeat prints the requested number of copies', () => {
    const job: Job = {
      ...A5_ON_A4,
      scheme: { kind: 'stepRepeat', rows: 5, cols: 2, copies: 10 },
      sheet: { size: size(595.28, 841.89), margin: mm(10), gap: mm(6) },
      source: { bleed: mm(3), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(4), offset: mm(3), pen: pt(0.2), halo: null }],
    }
    const sheets = readBack(run(makeNumberedPdf({ pageCount: 1, width: 241, height: 155 }), job))
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.labels.filter((l) => l.text.includes('bottom-P1'))).toHaveLength(10)
  })
})
