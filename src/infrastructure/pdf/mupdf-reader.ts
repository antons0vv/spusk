import * as mupdf from 'mupdf'
import type {
  DocumentHandle,
  DocumentReaderPort,
  OpenError,
  OpenedDocument,
} from '../../application/ports.js'
import { type Point, type Rect, rect, size } from '../../domain/geometry.js'
import type { DocumentInfo, SourcePage } from '../../domain/job.js'
import type { CropGeometry } from '../../domain/marks.js'
import { err, ok, type Result } from '../../domain/result.js'
import { pt } from '../../domain/units.js'
import { cropMarksFrom, type Stroke } from './crop-marks.js'

/**
 * Движок отдаёт коробки полосы в своём пространстве: начало в левом верхнем углу
 * приведённой полосы, ось Y вниз. Домен и писатель считают в пространстве PDF:
 * начало внизу слева, ось Y вверх. Переворот делается здесь, на границе адаптера,
 * иначе полоса со смещённым TrimBox уехала бы по вертикали на разницу отступов.
 */
const rectFrom = (box: mupdf.Rect, pageHeight: number): Rect =>
  rect(box[0], pageHeight - box[3], box[2] - box[0], box[3] - box[1])

const intersect = (a: mupdf.Rect, b: mupdf.Rect): mupdf.Rect => {
  const x0 = Math.max(a[0], b[0])
  const y0 = Math.max(a[1], b[1])
  return [x0, y0, Math.max(x0, Math.min(a[2], b[2])), Math.max(y0, Math.min(a[3], b[3]))]
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Отрезки всех обводок полосы в том же пространстве, что и коробки: из них ищутся метки
 * реза, нарисованные самим файлом. Кривые меткой быть не могут и пропускаются.
 */
const strokesOf = (page: mupdf.Page, pageHeight: number): readonly Stroke[] => {
  const strokes: Stroke[] = []
  const device = new mupdf.Device({
    strokePath(path, stroke, ctm) {
      const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))
      const width = stroke.getLineWidth() * scale
      const at = (x: number, y: number): Point => ({
        x: pt(ctm[0] * x + ctm[2] * y + ctm[4]),
        y: pt(pageHeight - (ctm[1] * x + ctm[3] * y + ctm[5])),
      })
      let last: Point | null = null
      path.walk({
        moveTo(x, y) {
          last = at(x, y)
        },
        lineTo(x, y) {
          const next = at(x, y)
          if (last !== null) strokes.push({ from: last, to: next, width })
          last = next
        },
      })
    },
  })
  try {
    page.run(device, mupdf.Matrix.identity)
    device.close()
  } finally {
    device.destroy()
  }
  return strokes
}

/**
 * Метки реза первой полосы. Битое содержимое не мешает открыть документ: полоса без
 * разборчивых обводок просто считается полосой без меток.
 */
const cropMarksOf = (page: mupdf.Page, pageHeight: number, trim: Rect): CropGeometry | null => {
  try {
    return cropMarksFrom(strokesOf(page, pageHeight), trim)
  } catch {
    return null
  }
}

/** Сотая доля пункта: разные генераторы PDF округляют размеры по-своему. */
const SAME = 0.01

const infoFrom = (doc: mupdf.PDFDocument): DocumentInfo => {
  const pages: SourcePage[] = []
  let cropMarks: CropGeometry | null = null
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    const hasTrimBox = !page.getObject().get('TrimBox').isNull()
    const hasBleedBox = !page.getObject().get('BleedBox').isNull()
    // Приведённая полоса: движок строит её по CropBox, пересечённому с MediaBox,
    // и от неё же отсчитывает остальные коробки.
    const bounds = page.getBounds()
    const height = bounds[3]
    const trim = rectFrom(page.getBounds(hasTrimBox ? 'TrimBox' : 'CropBox'), height)
    if (i === 0) cropMarks = cropMarksOf(page, height, trim)
    pages.push({
      trim,
      media: rectFrom(page.getBounds('MediaBox'), height),
      hasTrimBox,
      // За краем приведённой полосы содержимого нет: форма писателя его отсекает,
      // поэтому объявленный вылет обрезается тем же краем.
      bleed: hasBleedBox ? rectFrom(intersect(page.getBounds('BleedBox'), bounds), height) : null,
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
    cropMarks,
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
