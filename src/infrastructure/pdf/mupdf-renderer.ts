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
 * Рисует приведённую полосу — ту же коробку, от которой читатель отсчитывает
 * размеры, с поворотом. Аннотации не рисуются: в готовый спуск они не попадают,
 * и превью обязано показывать то, что будет в файле.
 */
export class MupdfRenderer implements PageRendererPort {
  constructor(private readonly reader: MupdfReader) {}

  render(handle: DocumentHandle, pageIndex: number, maxPx: number): Result<PageImage, RenderError> {
    const doc = this.reader.document(handle)
    if (doc === undefined) return err({ kind: 'Failed', message: 'документ закрыт' })
    try {
      const page = doc.loadPage(pageIndex)
      const [x0, y0, x1, y1] = page.getBounds()
      const w = x1 - x0
      const h = y1 - y0
      const scale = maxPx / Math.max(w, h)
      // Размеры растра округляются до целых пикселей, масштабы по осям подгоняются под них.
      // Иначе крайний столбец покрыт полосой частично, выходит светлее и в превью читается
      // как шов между соседними полосами. Искажение пропорций меньше полупикселя.
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
        return err({ kind: 'Failed', message: 'движок отдал растр не того размера' })
      }
      const n = pixmap.getNumberOfComponents()
      const stride = pixmap.getStride()
      // Представление смотрит в кучу движка: переписываем в свой буфер до любой
      // следующей аллокации, заодно добавляя непрозрачную альфу.
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
