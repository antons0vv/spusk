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
 * The engine returns page boxes in its own space: origin at the top-left corner of the
 * normalized page, Y axis down. The domain and the writer work in PDF space: origin at
 * bottom left, Y axis up. The flip happens here, at the adapter boundary; otherwise a page
 * with an offset TrimBox would shift vertically by the difference in offsets.
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
 * Segments of every stroked path on the page, in the same space as the boxes: crop marks
 * drawn by the file itself are searched for among them. Curves cannot be a mark and are skipped.
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
 * Crop marks of the first page. Broken content does not stop the document from opening: a page
 * without readable strokes simply counts as a page without marks.
 */
const cropMarksOf = (page: mupdf.Page, pageHeight: number, trim: Rect): CropGeometry | null => {
  try {
    return cropMarksFrom(strokesOf(page, pageHeight), trim)
  } catch {
    return null
  }
}

/** A hundredth of a point: PDF generators each round sizes their own way. */
const SAME = 0.01

const infoFrom = (doc: mupdf.PDFDocument): DocumentInfo => {
  const pages: SourcePage[] = []
  let cropMarks: CropGeometry | null = null
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    const hasTrimBox = !page.getObject().get('TrimBox').isNull()
    const hasBleedBox = !page.getObject().get('BleedBox').isNull()
    // The normalized page: the engine builds it from the CropBox intersected with the
    // MediaBox, and measures the other boxes from it too.
    const bounds = page.getBounds()
    const height = bounds[3]
    const trim = rectFrom(page.getBounds(hasTrimBox ? 'TrimBox' : 'CropBox'), height)
    if (i === 0) cropMarks = cropMarksOf(page, height, trim)
    pages.push({
      trim,
      media: rectFrom(page.getBounds('MediaBox'), height),
      hasTrimBox,
      // There is no content beyond the edge of the normalized page: the writer's form clips
      // it, so the declared bleed is cut at the same edge.
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
 * Each reader gets its own origin: by it a handle recognizes its owner.
 * Random rather than a counter: a recreated worker starts counting from scratch and would
 * accept a handle from the previous worker, silently returning a different document instead.
 */
const nextOrigin = (): string => `mupdf-reader-${crypto.randomUUID()}`

/** Reads PDFs through mupdf. A document stays open until close is called. */
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
    // The static open method is declared to return a generic document,
    // so narrow it the supported way rather than with a type cast.
    const doc = opened.asPDF()
    if (doc === null) {
      opened.destroy()
      return err({ kind: 'NotAPdf' })
    }
    if (doc.needsPassword()) {
      // A protected document cannot be described before decryption, but the handle is
      // needed right now: without it there would be nowhere to send the password.
      return err({ kind: 'PasswordRequired', handle: this.keep(doc) })
    }
    let info: DocumentInfo
    try {
      // The description is computed before the document goes into the store: if walking
      // the pages fails, the store is not left holding a document nobody would close.
      info = infoFrom(doc)
    } catch (cause) {
      // The document parsed, but the page tree turned out to be damaged.
      doc.destroy()
      return err({ kind: 'Unreadable', message: describe(cause) })
    }
    return ok({ handle: this.keep(doc), info })
  }

  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError> {
    const doc = this.held(handle)
    if (doc === undefined) return err({ kind: 'Unreadable', message: 'document is already closed' })
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

  /** Internal access for the writer: the same document, without parsing it again. */
  document(handle: DocumentHandle): mupdf.PDFDocument | undefined {
    return this.held(handle)
  }

  /** Puts the document in the store and issues a tagged handle. */
  private keep(doc: mupdf.PDFDocument): DocumentHandle {
    const id = this.nextId
    this.nextId += 1
    this.open_.set(id, doc)
    return { origin: this.origin, id }
  }

  private held(handle: DocumentHandle): mupdf.PDFDocument | undefined {
    // A handle from another reader does not open a document that is not its own: the
    // readers' numbers are independent and are bound to overlap.
    if (handle.origin !== this.origin) return undefined
    return this.open_.get(handle.id)
  }
}
