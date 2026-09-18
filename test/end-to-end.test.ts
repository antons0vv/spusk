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
  if (!isOk(opened)) throw new Error('документ не открылся')
  const built = plan(job, opened.value.info)
  if (!isOk(built)) throw new Error(`план не построен: ${JSON.stringify(built.error)}`)
  const written = writer.write(opened.value.handle, built.value)
  if (!isOk(written)) throw new Error('файл не записан')
  reader.close(opened.value.handle)
  return written.value
}

const A5_ON_A4: Job = {
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: mm(0.4) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
}

describe('сквозной путь', () => {
  it('шестнадцать полос превращаются в восемь листов с правильным порядком', () => {
    const out = run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), A5_ON_A4)
    const sheets = readBack(out)
    expect(sheets).toHaveLength(8)
    const last = sheets[7]
    if (last === undefined) throw new Error('нет листа')
    expect(cellOf(last, 1, 2, 'bottom-P8')).toEqual({ row: 0, col: 0 })
    expect(cellOf(last, 1, 2, 'bottom-P9')).toEqual({ row: 0, col: 1 })
  })

  it('тетради по восемь полос дают отдельные тетради', () => {
    const job: Job = {
      ...A5_ON_A4,
      scheme: { kind: 'booklet', folio: 8, binding: 'left', creepPerSheet: pt(0) },
    }
    const sheets = readBack(
      run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), job),
    )
    const fifth = sheets[4]
    if (fifth === undefined) throw new Error('нет листа')
    expect(cellOf(fifth, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(fifth, 1, 2, 'bottom-P9')).toEqual({ row: 0, col: 1 })
  })

  it('выползание реально сдвигает содержимое внутренних листов', () => {
    const out = run(makeNumberedPdf({ pageCount: 16, width: 419.53, height: 595.28 }), A5_ON_A4)
    const sheets = readBack(out)
    const outerLabel = sheets[0]?.labels.find((l) => l.text.includes('bottom-P16'))
    const innerLabel = sheets[6]?.labels.find((l) => l.text.includes('bottom-P10'))
    if (outerLabel === undefined || innerLabel === undefined) throw new Error('нет меток')
    expect(innerLabel.x - outerLabel.x).toBeCloseTo(mm(1.2), 1)
  })

  it('результат не раздувается: общие ресурсы переносятся один раз', () => {
    const source = makeNumberedPdf({ pageCount: 32, width: 419.53, height: 595.28 })
    const out = run(source, A5_ON_A4)
    expect(out.byteLength).toBeLessThan(source.byteLength * 2)
  })

  it('вылет обрезается: метка за линией реза на лист не попадает', () => {
    const source = makeNumberedPdf({ pageCount: 4, width: 200, height: 300, bleed: 10 })
    const job: Job = {
      ...A5_ON_A4,
      sheet: { size: size(420, 320), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
    }
    const first = readBack(run(source, job))[0]
    if (first === undefined) throw new Error('нет листа')
    // Метка внутри линии реза остаётся, метка за ней обрезается.
    expect(first.labels.some((l) => l.text.startsWith('bottom-P'))).toBe(true)
    expect(first.labels.some((l) => l.text.startsWith('bleed-P'))).toBe(false)
  })

  it('одна полоса во множестве копий не размножает своё содержимое', () => {
    const source = makeNumberedPdf({ pageCount: 1, width: 241, height: 155 })
    const job: Job = {
      ...A5_ON_A4,
      scheme: { kind: 'stepRepeat', rows: 5, cols: 2, copies: 40 },
      sheet: { size: size(595.28, 841.89), margin: mm(10), gap: mm(6) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [],
    }
    const out = run(source, job)
    // Сорок копий на четырёх листах: форма строится один раз и переиспользуется,
    // поэтому результат обязан остаться того же порядка, что и исходник.
    expect(readBack(out)).toHaveLength(4)
    expect(out.byteLength).toBeLessThan(source.byteLength * 3)
  })

  it('step and repeat печатает нужное число копий', () => {
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
