import * as mupdf from 'mupdf'
import type { DocumentHandle, ImposedWriterPort, WriteError } from '../../application/ports.js'
import type { Placement } from '../../domain/assemble.js'
import type { Plan } from '../../domain/plan.js'
import { err, ok, type Result } from '../../domain/result.js'
import { placementOps } from './content-stream.js'
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

const contentsOf = (pageObject: mupdf.PDFObject): Uint8Array => {
  const contents = pageObject.get('Contents')
  if (!contents.isArray()) return contents.readStream().asUint8Array()
  const parts: Uint8Array[] = []
  contents.forEach((stream) => {
    parts.push(stream.readStream().asUint8Array())
  })
  return concat(parts)
}

/** Исполняет план: переносит исходные полосы формами XObject на новые листы. */
export class MupdfWriter implements ImposedWriterPort {
  constructor(private readonly reader: MupdfReader) {}

  write(handle: DocumentHandle, plan: Plan): Result<Uint8Array, WriteError> {
    const source = this.reader.document(handle)
    if (source === undefined) return err({ kind: 'Failed', message: 'документ закрыт' })

    try {
      const target = new mupdf.PDFDocument()
      const graft = target.newGraftMap()
      const forms = new Map<number, mupdf.PDFObject>()

      const formFor = (pageIndex: number): mupdf.PDFObject => {
        const cached = forms.get(pageIndex)
        if (cached !== undefined) return cached
        const page = source.loadPage(pageIndex)
        const object = page.getObject()
        const bounds = page.getBounds('MediaBox')
        const dict = target.newDictionary()
        dict.put('Type', target.newName('XObject'))
        dict.put('Subtype', target.newName('Form'))
        const bbox = target.newArray()
        for (const value of bounds) bbox.push(value)
        dict.put('BBox', bbox)
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
        target.insertPage(-1, target.addPage(mediabox, 0, resources, ops.join('\n')))
      }

      // Коробки листа: обрезной и полезный формат совпадают с форматом листа,
      // иначе RIP и просмотрщики берут их из умолчаний по-разному.
      for (let i = 0; i < target.countPages(); i += 1) {
        const sheetPage = target.loadPage(i)
        sheetPage.setPageBox('CropBox', mediabox)
        sheetPage.setPageBox('TrimBox', mediabox)
      }

      const bytes = target.saveToBuffer('compress').asUint8Array()
      target.destroy()
      return ok(bytes)
    } catch (cause) {
      return err({
        kind: 'Failed',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }
}
