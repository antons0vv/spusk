import * as mupdf from 'mupdf'
import type { DocumentHandle, ImposedWriterPort, WriteError } from '../../application/ports.js'
import type { Placement } from '../../domain/assemble.js'
import type { Plan } from '../../domain/plan.js'
import { err, ok, type Result } from '../../domain/result.js'
import { markOps, placementOps } from './content-stream.js'
import type { MupdfReader } from './mupdf-reader.js'

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((acc, p) => acc + p.length + 1, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
    out[at] = 0x0a
    at += 1
  }
  return out
}

/**
 * Представление буфера указывает прямо в кучу движка и обесценивается при
 * следующей же аллокации, а сам буфер иначе никто не освободит. Поэтому
 * копируем немедленно.
 */
const copyOf = (buffer: mupdf.Buffer): Uint8Array => {
  const copy = new Uint8Array(buffer.asUint8Array())
  buffer.destroy()
  return copy
}

const contentsOf = (pageObject: mupdf.PDFObject): Uint8Array => {
  const contents = pageObject.get('Contents')
  if (!contents.isArray()) return copyOf(contents.readStream())
  const parts: Uint8Array[] = []
  contents.forEach((stream) => {
    parts.push(copyOf(stream.readStream()))
  })
  return concat(parts)
}

const composeRaw = (a: mupdf.Matrix, b: mupdf.Matrix): mupdf.Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]

type FormGeometry = { readonly bbox: mupdf.Rect; readonly matrix: mupdf.Matrix }

/**
 * Приводит форму к той системе координат, в которой думает домен.
 * Адаптер чтения отдаёт размеры полосы уже приведёнными: начало в нуле, поворот
 * применён. Содержимое же лежит в сыром пространстве полосы. Рамка формы
 * задаётся в сыром пространстве, а матрица формы переводит её в приведённое.
 */
const formGeometry = (page: mupdf.PDFPage): FormGeometry => {
  const box = page.getObject().getInheritable('MediaBox')
  const bounds: mupdf.Rect = box.isArray()
    ? [
        Math.min(box.get(0).asNumber(), box.get(2).asNumber()),
        Math.min(box.get(1).asNumber(), box.get(3).asNumber()),
        Math.max(box.get(0).asNumber(), box.get(2).asNumber()),
        Math.max(box.get(1).asNumber(), box.get(3).asNumber()),
      ]
    : page.getBounds('MediaBox')
  const w = bounds[2] - bounds[0]
  const h = bounds[3] - bounds[1]
  const shift: mupdf.Matrix = [1, 0, 0, 1, -bounds[0], -bounds[1]]
  const spun = page.getObject().getInheritable('Rotate')
  const rotate = spun.isNumber() ? ((spun.asNumber() % 360) + 360) % 360 : 0
  if (rotate === 90) return { bbox: bounds, matrix: composeRaw(shift, [0, -1, 1, 0, 0, w]) }
  if (rotate === 180) return { bbox: bounds, matrix: composeRaw(shift, [-1, 0, 0, -1, w, h]) }
  if (rotate === 270) return { bbox: bounds, matrix: composeRaw(shift, [0, 1, -1, 0, h, 0]) }
  return { bbox: bounds, matrix: shift }
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Исполняет план: переносит исходные полосы формами XObject на новые листы. */
export class MupdfWriter implements ImposedWriterPort {
  constructor(private readonly reader: MupdfReader) {}

  write(handle: DocumentHandle, plan: Plan): Result<Uint8Array, WriteError> {
    const source = this.reader.document(handle)
    if (source === undefined) return err({ kind: 'Failed', message: 'документ закрыт' })

    const target = new mupdf.PDFDocument()
    try {
      // Карта переноса одна на весь экспорт: иначе общие шрифты и изображения
      // продублируются на каждом листе и файл распухнет в разы.
      const graft = target.newGraftMap()
      const forms = new Map<number, mupdf.PDFObject>()

      const formFor = (pageIndex: number): mupdf.PDFObject => {
        const cached = forms.get(pageIndex)
        if (cached !== undefined) return cached
        const page = source.loadPage(pageIndex)
        const object = page.getObject()
        const geometry = formGeometry(page)
        const dict = target.newDictionary()
        dict.put('Type', target.newName('XObject'))
        dict.put('Subtype', target.newName('Form'))
        const bbox = target.newArray()
        for (const value of geometry.bbox) bbox.push(value)
        dict.put('BBox', bbox)
        const matrix = target.newArray()
        for (const value of geometry.matrix) matrix.push(value)
        dict.put('Matrix', matrix)
        dict.put('Resources', graft.graftObject(object.getInheritable('Resources')))
        const form = target.addStream(contentsOf(object), dict)
        forms.set(pageIndex, form)
        return form
      }

      const mediabox: mupdf.Rect = [0, 0, plan.sheetSize.w, plan.sheetSize.h]
      for (const sheet of plan.sheets) {
        const resources = target.newDictionary()
        const xobjects = target.newDictionary()
        const ops: string[] = []
        sheet.placements.forEach((placement: Placement, slot: number) => {
          if (placement.source.kind === 'blank') return
          const name = `X${slot}`
          xobjects.put(name, formFor(placement.source.index))
          ops.push(placementOps(name, placement))
        })
        resources.put('XObject', xobjects)
        const content = [ops.join('\n'), markOps(sheet.marks)].filter((s) => s !== '').join('\n')
        target.insertPage(-1, target.addPage(mediabox, 0, resources, content))
      }

      // Коробки листа: обрезной и полезный формат совпадают с форматом листа,
      // иначе RIP и просмотрщики берут их из умолчаний по-разному.
      for (let i = 0; i < target.countPages(); i += 1) {
        const sheetPage = target.loadPage(i)
        sheetPage.setPageBox('CropBox', mediabox)
        sheetPage.setPageBox('TrimBox', mediabox)
      }

      return ok(copyOf(target.saveToBuffer('compress')))
    } catch (cause) {
      return err({ kind: 'Failed', message: describe(cause) })
    } finally {
      // Освобождать надо и на отказе: иначе документ-цель вместе со всеми
      // перенесёнными ресурсами повиснет до недетерминированной уборки.
      target.destroy()
    }
  }
}
