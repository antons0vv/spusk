import * as mupdf from 'mupdf'
import type {
  DocumentHandle,
  PageImage,
  PageRendererPort,
  RenderError,
} from '../../application/ports.js'
import { size } from '../../domain/geometry.js'
import { err, ok, type Result } from '../../domain/result.js'
import type { MupdfReader } from './mupdf-reader.js'

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Renders the normalized page — the same box the reader measures sizes from, with
 * rotation. Annotations are not rendered: they do not reach the finished imposition,
 * and the preview must show what will be in the file.
 */
export class MupdfRenderer implements PageRendererPort {
  constructor(private readonly reader: MupdfReader) {}

  render(handle: DocumentHandle, pageIndex: number, maxPx: number): Result<PageImage, RenderError> {
    const doc = this.reader.document(handle)
    if (doc === undefined) return err({ kind: 'Failed', message: 'document is closed' })
    try {
      const page = doc.loadPage(pageIndex)
      const [x0, y0, x1, y1] = page.getBounds()
      const w = x1 - x0
      const h = y1 - y0
      const scale = maxPx / Math.max(w, h)
      // Raster dimensions are rounded to whole pixels, and the per-axis scales are fitted to
      // them. Otherwise the edge column is only partly covered by the page, comes out lighter
      // and reads in the preview as a seam between adjacent pages. The aspect distortion is
      // under half a pixel.
      const width = Math.max(1, Math.round(w * scale))
      const height = Math.max(1, Math.round(h * scale))
      const sx = width / w
      const sy = height / h
      const pixmap = page.toPixmap(
        [sx, 0, 0, sy, -x0 * sx, -y0 * sy],
        mupdf.ColorSpace.DeviceRGB,
        false,
        false,
      )
      if (pixmap.getWidth() !== width || pixmap.getHeight() !== height) {
        pixmap.destroy()
        return err({ kind: 'Failed', message: 'engine returned a raster of the wrong size' })
      }
      const n = pixmap.getNumberOfComponents()
      const stride = pixmap.getStride()
      // The view points into the engine's heap: copy into our own buffer before any
      // further allocation, adding opaque alpha along the way.
      const source = pixmap.getPixels()
      const pixels = new Uint8ClampedArray(width * height * 4)
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const from = row * stride + col * n
          const to = (row * width + col) * 4
          pixels[to] = source[from] ?? 255
          pixels[to + 1] = source[from + 1] ?? 255
          pixels[to + 2] = source[from + 2] ?? 255
          pixels[to + 3] = 255
        }
      }
      pixmap.destroy()
      page.destroy()
      return ok({ width, height, pixels, page: size(w, h) })
    } catch (cause) {
      return err({ kind: 'Failed', message: describe(cause) })
    }
  }
}
