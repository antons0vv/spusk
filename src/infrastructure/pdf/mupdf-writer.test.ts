import * as mupdf from 'mupdf'
import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { cellOf, type Label, readBack } from '../../../test/fixtures/read-back.js'
import { type Size, size } from '../../domain/geometry.js'
import type { Job } from '../../domain/job.js'
import { plan } from '../../domain/plan.js'
import { isErr, isOk } from '../../domain/result.js'
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

const imposedFrom = (source: Uint8Array, job: Job): Uint8Array => {
  const opened = reader.open(source)
  if (!isOk(opened)) throw new Error('документ не открылся')
  const built = plan(job, opened.value.info)
  if (!isOk(built)) throw new Error(`план не построен: ${JSON.stringify(built.error)}`)
  const written = writer.write(opened.value.handle, built.value)
  if (!isOk(written)) throw new Error(`файл не записан: ${JSON.stringify(written.error)}`)
  reader.close(opened.value.handle)
  return written.value
}

const imposed = (
  pageCount: number,
  job: Job,
  extra: { origin?: number; rotate?: number } = {},
): Uint8Array =>
  imposedFrom(makeNumberedPdf({ pageCount, width: 419.53, height: 595.28, ...extra }), job)

/** Одна полоса на лист в натуральную величину: положение метки читается напрямую. */
const oneToOne = (sheet: Size): Job => ({
  scheme: { kind: 'nup', rows: 1, cols: 1, fill: 'rows' },
  sheet: { size: sheet, margin: pt(0), gap: pt(0) },
  source: { bleed: pt(0), scaling: 'actual', normalizeSizes: false },
  marks: [],
})

const labelAt = (bytes: Uint8Array, text: string): Label => {
  const first = readBack(bytes)[0]
  if (first === undefined) throw new Error('нет листа')
  const found = first.labels.find((l) => l.text === text)
  if (found === undefined) throw new Error(`нет метки ${text}`)
  return found
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

  it('полоса с кропбоксом ложится по кропбоксу, а спрятанное им содержимое не печатается', () => {
    const crop = { left: 8, bottom: 10, right: 6, top: 4 }
    const plain = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }),
      oneToOne(size(300, 400)),
    )
    const cropped = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400, crop }),
      // Лист ровно по кропбоксу: полоса ложится в него один к одному.
      oneToOne(size(300 - crop.left - crop.right, 400 - crop.bottom - crop.top)),
    )
    const before = labelAt(plain, 'bottom-P1')
    const after = labelAt(cropped, 'bottom-P1')
    // Отсчёт идёт от начала кропбокса, поэтому метка смещается ровно на его отступы.
    expect(after.x).toBeCloseTo(before.x - crop.left, 2)
    expect(after.y).toBeCloseTo(before.y - crop.top, 2)
    const sheet = readBack(cropped)[0]
    expect(sheet?.labels.some((l) => l.text.startsWith('outside-'))).toBe(false)
  })

  it('вылет внутри кропбокса не сдвигает полосу по вертикали', () => {
    // TrimBox сидит в кропбоксе несимметрично: снизу восемь пунктов, сверху два.
    // Полоса всё равно обязана лечь по линии реза, как будто коробок нет вовсе.
    const source = makeNumberedPdf({
      pageCount: 1,
      width: 300,
      height: 400,
      bleed: 10,
      crop: { left: 8, bottom: 2, right: 4, top: 8 },
    })
    const trimmed = imposedFrom(source, oneToOne(size(300, 400)))
    const plain = imposedFrom(
      makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }),
      oneToOne(size(300, 400)),
    )
    const before = labelAt(plain, 'bottom-P1')
    const after = labelAt(trimmed, 'bottom-P1')
    expect(after.x).toBeCloseTo(before.x, 2)
    expect(after.y).toBeCloseTo(before.y, 2)
  })

  it('полоса без потока содержимого не роняет экспорт', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      withoutContents: [1],
    })
    const sheets = readBack(imposedFrom(source, bookletJob()))
    expect(sheets).toHaveLength(2)
    const first = sheets[0]
    const second = sheets[1]
    if (first === undefined || second === undefined) throw new Error('нет листов')
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
    // Пустая полоса лежит слева и ничего не печатает, соседняя ложится как обычно.
    expect(cellOf(second, 1, 2, 'bottom-P3')).toEqual({ row: 0, col: 1 })
    expect(cellOf(second, 1, 2, 'bottom-P2')).toBeNull()
  })

  it('содержимое из двух потоков склеивается целиком', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      splitContents: true,
    })
    const job: Job = {
      ...bookletJob(),
      sheet: { size: size(841.89, 595.28), margin: mm(10), gap: pt(0) },
      source: { bleed: pt(0), scaling: 'fit', normalizeSizes: false },
      marks: [{ kind: 'crop', length: mm(5), offset: mm(3), pen: pt(0.2) }],
    }
    const sheets = readBack(imposedFrom(source, job))
    expect(sheets).toHaveLength(2)
    const first = sheets[0]
    if (first === undefined) throw new Error('нет листа')
    // Крупная метка лежит в первом потоке, угловые — во втором.
    expect(first.labels.some((l) => l.text === 'P4')).toBe(true)
    expect(cellOf(first, 1, 2, 'bottom-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'top-P4')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  })

  it('группа прозрачности переносится в форму', () => {
    const source = makeNumberedPdf({
      pageCount: 4,
      width: 419.53,
      height: 595.28,
      transparencyGroup: true,
    })
    const out = imposedFrom(source, bookletJob())
    const opened = mupdf.Document.openDocument(out, 'application/pdf').asPDF()
    if (opened === null) throw new Error('результат не PDF')
    // Сужение до PDF, иначе тип полосы остаётся общим и словаря у неё нет.
    const doc: mupdf.PDFDocument = opened
    const forms = doc.loadPage(0).getObject().get('Resources').get('XObject')
    const kinds: string[] = []
    forms.forEach((form) => {
      const kind = form.resolve().get('Group').resolve().get('S')
      kinds.push(kind.isName() ? kind.asName() : 'нет группы')
    })
    doc.destroy()
    expect(kinds).toHaveLength(2)
    expect(new Set(kinds)).toEqual(new Set(['Transparency']))
  })

  it('дескриптор чужого читателя не даёт собрать файл', () => {
    const other = new MupdfReader()
    const opened = other.open(makeNumberedPdf({ pageCount: 4, width: 300, height: 400 }))
    if (!isOk(opened)) throw new Error('документ не открылся')
    const built = plan(oneToOne(size(300, 400)), opened.value.info)
    if (!isOk(built)) throw new Error('план не построен')
    // Писатель связан с другим читателем: чужой номер документа он брать не должен.
    const written = writer.write(opened.value.handle, built.value)
    expect(isErr(written)).toBe(true)
    other.close(opened.value.handle)
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
