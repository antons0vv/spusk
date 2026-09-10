import * as mupdf from 'mupdf'
import type {
  DocumentHandle,
  DocumentReaderPort,
  OpenError,
  OpenedDocument,
} from '../../application/ports.js'
import { rect, size } from '../../domain/geometry.js'
import type { DocumentInfo, SourcePage } from '../../domain/job.js'
import { err, ok, type Result } from '../../domain/result.js'

const rectFrom = (box: mupdf.Rect) => rect(box[0], box[1], box[2] - box[0], box[3] - box[1])

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Сотая доля пункта: разные генераторы PDF округляют размеры по-своему. */
const SAME = 0.01

const infoFrom = (doc: mupdf.PDFDocument): DocumentInfo => {
  const pages: SourcePage[] = []
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    const hasTrimBox = !page.getObject().get('TrimBox').isNull()
    pages.push({
      trim: rectFrom(page.getBounds(hasTrimBox ? 'TrimBox' : 'CropBox')),
      media: rectFrom(page.getBounds('MediaBox')),
      hasTrimBox,
    })
  }
  const first = pages[0]
  const uniform =
    first !== undefined &&
    pages.every(
      (p) => Math.abs(p.trim.w - first.trim.w) < SAME && Math.abs(p.trim.h - first.trim.h) < SAME,
    )
  return {
    pageCount: pages.length,
    pages,
    uniformSize: uniform && first !== undefined ? size(first.trim.w, first.trim.h) : null,
  }
}

/** Читает PDF через mupdf. Документ остаётся открытым до вызова close. */
export class MupdfReader implements DocumentReaderPort {
  private nextId = 1
  private readonly open_ = new Map<number, mupdf.PDFDocument>()

  open(bytes: Uint8Array): Result<OpenedDocument, OpenError> {
    let opened: mupdf.Document
    try {
      opened = mupdf.Document.openDocument(bytes, 'application/pdf')
    } catch {
      return err({ kind: 'NotAPdf' })
    }
    // Статический метод открытия объявлен возвращающим общий документ,
    // поэтому сужаем штатным способом, а не приведением типа.
    const doc = opened.asPDF()
    if (doc === null) {
      opened.destroy()
      return err({ kind: 'NotAPdf' })
    }
    if (doc.needsPassword()) {
      doc.destroy()
      return err({ kind: 'Encrypted' })
    }
    try {
      return ok(this.register(doc))
    } catch (cause) {
      // Документ распарсился, но дерево полос оказалось повреждено.
      doc.destroy()
      return err({ kind: 'Unreadable', message: describe(cause) })
    }
  }

  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError> {
    const doc = this.open_.get(handle.id)
    if (doc === undefined) return err({ kind: 'Unreadable', message: 'документ уже закрыт' })
    if (doc.authenticatePassword(password) === 0) return err({ kind: 'Encrypted' })
    try {
      return ok({ handle, info: infoFrom(doc) })
    } catch (cause) {
      return err({ kind: 'Unreadable', message: describe(cause) })
    }
  }

  close(handle: DocumentHandle): void {
    const doc = this.open_.get(handle.id)
    if (doc === undefined) return
    doc.destroy()
    this.open_.delete(handle.id)
  }

  /** Внутренний доступ для писателя: тот же документ, без повторного разбора. */
  document(handle: DocumentHandle): mupdf.PDFDocument | undefined {
    return this.open_.get(handle.id)
  }

  private register(doc: mupdf.PDFDocument): OpenedDocument {
    // Описание считается до записи в хранилище: если обход полос упадёт,
    // в хранилище не останется документа, который некому закрыть.
    const info = infoFrom(doc)
    const id = this.nextId
    this.nextId += 1
    this.open_.set(id, doc)
    return { handle: { id }, info }
  }
}
