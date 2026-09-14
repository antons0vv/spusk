import * as mupdf from 'mupdf'
import type {
  DocumentHandle,
  DocumentReaderPort,
  OpenError,
  OpenedDocument,
} from '../../application/ports.js'
import { type Rect, rect, size } from '../../domain/geometry.js'
import type { DocumentInfo, SourcePage } from '../../domain/job.js'
import { err, ok, type Result } from '../../domain/result.js'

/**
 * Движок отдаёт коробки полосы в своём пространстве: начало в левом верхнем углу
 * приведённой полосы, ось Y вниз. Домен и писатель считают в пространстве PDF:
 * начало внизу слева, ось Y вверх. Переворот делается здесь, на границе адаптера,
 * иначе полоса со смещённым TrimBox уехала бы по вертикали на разницу отступов.
 */
const rectFrom = (box: mupdf.Rect, pageHeight: number): Rect =>
  rect(box[0], pageHeight - box[3], box[2] - box[0], box[3] - box[1])

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Сотая доля пункта: разные генераторы PDF округляют размеры по-своему. */
const SAME = 0.01

const infoFrom = (doc: mupdf.PDFDocument): DocumentInfo => {
  const pages: SourcePage[] = []
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    const hasTrimBox = !page.getObject().get('TrimBox').isNull()
    // Приведённая полоса: движок строит её по CropBox, пересечённому с MediaBox,
    // и от неё же отсчитывает остальные коробки.
    const height = page.getBounds()[3]
    pages.push({
      trim: rectFrom(page.getBounds(hasTrimBox ? 'TrimBox' : 'CropBox'), height),
      media: rectFrom(page.getBounds('MediaBox'), height),
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

/**
 * Каждому читателю своё происхождение: по нему дескриптор узнаёт своего хозяина.
 * Случайное, а не счётчик: пересозданный поток начинает счёт заново и принял бы
 * дескриптор от прежнего потока, молча отдав вместо документа другой.
 */
const nextOrigin = (): string => `mupdf-reader-${crypto.randomUUID()}`

/** Читает PDF через mupdf. Документ остаётся открытым до вызова close. */
export class MupdfReader implements DocumentReaderPort {
  private readonly origin = nextOrigin()
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
      // Описание защищённого документа до расшифровки не построить, но дескриптор
      // нужен уже сейчас: без него пароль было бы некуда прислать.
      return err({ kind: 'PasswordRequired', handle: this.keep(doc) })
    }
    let info: DocumentInfo
    try {
      // Описание считается до записи в хранилище: если обход полос упадёт,
      // в хранилище не останется документа, который некому закрыть.
      info = infoFrom(doc)
    } catch (cause) {
      // Документ распарсился, но дерево полос оказалось повреждено.
      doc.destroy()
      return err({ kind: 'Unreadable', message: describe(cause) })
    }
    return ok({ handle: this.keep(doc), info })
  }

  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError> {
    const doc = this.held(handle)
    if (doc === undefined) return err({ kind: 'Unreadable', message: 'документ уже закрыт' })
    if (doc.authenticatePassword(password) === 0) return err({ kind: 'WrongPassword', handle })
    try {
      return ok({ handle, info: infoFrom(doc) })
    } catch (cause) {
      return err({ kind: 'Unreadable', message: describe(cause) })
    }
  }

  close(handle: DocumentHandle): void {
    const doc = this.held(handle)
    if (doc === undefined) return
    doc.destroy()
    this.open_.delete(handle.id)
  }

  /** Внутренний доступ для писателя: тот же документ, без повторного разбора. */
  document(handle: DocumentHandle): mupdf.PDFDocument | undefined {
    return this.held(handle)
  }

  /** Кладёт документ в хранилище и выдаёт помеченный дескриптор. */
  private keep(doc: mupdf.PDFDocument): DocumentHandle {
    const id = this.nextId
    this.nextId += 1
    this.open_.set(id, doc)
    return { origin: this.origin, id }
  }

  private held(handle: DocumentHandle): mupdf.PDFDocument | undefined {
    // Дескриптор чужого читателя не открывает чужой документ: номера у читателей
    // независимы и наверняка пересекаются.
    if (handle.origin !== this.origin) return undefined
    return this.open_.get(handle.id)
  }
}
