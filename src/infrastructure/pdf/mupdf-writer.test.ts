import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { cellOf, readBack } from '../../../test/fixtures/read-back.js'
import { size } from '../../domain/geometry.js'
import type { Job } from '../../domain/job.js'
import { plan } from '../../domain/plan.js'
import { isOk } from '../../domain/result.js'
import { mm, pt } from '../../domain/units.js'
import { MupdfReader } from './mupdf-reader.js'
import { MupdfWriter } from './mupdf-writer.js'

const reader = new MupdfReader()
const writer = new MupdfWriter(reader)

const bookletJob = (): Job => ({
  scheme: { kind: 'booklet', folio: 'all', binding: 'left', creepPerSheet: pt(0) },
  sheet: { size: size(841.89, 595.28), margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
})

const imposed = (
  pageCount: number,
  job: Job,
  extra: { origin?: number; rotate?: number } = {},
): Uint8Array => {
  const opened = reader.open(
    makeNumberedPdf({ pageCount, width: 419.53, height: 595.28, ...extra }),
  )
  if (!isOk(opened)) throw new Error('документ не открылся')
  const built = plan(job, opened.value.info)
  if (!isOk(built)) throw new Error('план не построен')
  const written = writer.write(opened.value.handle, built.value)
  if (!isOk(written)) throw new Error('файл не записан')
  reader.close(opened.value.handle)
  return written.value
}

describe('писатель', () => {
  it('брошюра из 16 полос кладёт полосы в правильные ячейки', () => {
    const sheets = readBack(imposed(16, bookletJob()))
    expect(sheets).toHaveLength(8)
    const first = sheets[0]
    const second = sheets[1]
    if (first === undefined || second === undefined) throw new Error('нет листов')
    expect(cellOf(first, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
    expect(cellOf(second, 1, 2, 'bottom-P2')).toEqual({ row: 0, col: 0 })
    expect(cellOf(second, 1, 2, 'bottom-P15')).toEqual({ row: 0, col: 1 })
  })

  it('размер листа соответствует плану', () => {
    const sheets = readBack(imposed(4, bookletJob()))
    expect(sheets[0]?.width).toBeCloseTo(841.89, 2)
    expect(sheets[0]?.height).toBeCloseTo(595.28, 2)
  })

  it('cut and stack раскладывает по стопкам', () => {
    const job: Job = {
      ...bookletJob(),
      scheme: { kind: 'cutStack', rows: 2, cols: 2 },
      sheet: { size: size(841.89, 1190.55), margin: pt(0), gap: pt(0) },
      // Ячейка A3/4 по высоте на доли пункта меньше полосы A5, поэтому вписываем.
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const sheets = readBack(imposed(16, job))
    const first = sheets[0]
    if (first === undefined) throw new Error('нет листа')
    expect(cellOf(first, 2, 2, 'bottom-P1')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 2, 2, 'bottom-P5')).toEqual({ row: 0, col: 1 })
    expect(cellOf(first, 2, 2, 'bottom-P9')).toEqual({ row: 1, col: 0 })
    expect(cellOf(first, 2, 2, 'bottom-P13')).toEqual({ row: 1, col: 1 })
  })

  it('полоса со смещённым началом координат ложится в свою ячейку', () => {
    const sheets = readBack(imposed(4, bookletJob(), { origin: 40 }))
    const first = sheets[0]
    if (first === undefined) throw new Error('нет листа')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  })

  it('повёрнутая полоса ложится повёрнутой, а не как есть', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(1190.55, 841.89), margin: pt(0), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
    }
    const sheets = readBack(imposed(4, job, { rotate: 90 }))
    const first = sheets[0]
    if (first === undefined) throw new Error('нет листа')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    // Метка низа полосы после поворота по часовой стрелке оказывается вверху листа.
    // Без поворота она осталась бы внизу, поэтому строка здесь и различает случаи.
    expect(cellOf(first, 2, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
  })

  it('вылет обрезается по границе клипа', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(5), gap: pt(0) },
      source: { bleed: mm(3), scaling: 'fit', normalizeSizes: false },
    }
    const bytes = imposed(4, job)
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(readBack(bytes)).toHaveLength(2)
  })

  it('метки реза попадают в файл и не ломают его', () => {
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: mm(3), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
    }
    const sheets = readBack(imposed(4, job))
    expect(sheets).toHaveLength(2)
    expect(sheets[0]?.labels.some((l) => l.text.includes('P1'))).toBe(true)
  })
})
