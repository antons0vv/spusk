import * as mupdf from 'mupdf'

export type Label = { readonly text: string; readonly x: number; readonly y: number }
export type ReadSheet = {
  readonly width: number
  readonly height: number
  readonly labels: readonly Label[]
}

type StextLine = {
  readonly text?: string
  readonly bbox?: { x: number; y: number; w: number; h: number }
}
type StextBlock = { readonly lines?: readonly StextLine[] }
type StextPage = { readonly blocks?: readonly StextBlock[] }

const isStextPage = (value: unknown): value is StextPage =>
  typeof value === 'object' && value !== null && 'blocks' in value

/**
 * Читает готовый PDF и отдаёт по каждому листу его размер и текстовые метки с координатами.
 * Координаты структурного текста считаются от верхнего левого угла.
 */
export const readBack = (bytes: Uint8Array): readonly ReadSheet[] => {
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
  const sheets: ReadSheet[] = []
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    const bounds = page.getBounds()
    const parsed: unknown = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON())
    const labels: Label[] = []
    if (isStextPage(parsed)) {
      for (const block of parsed.blocks ?? []) {
        for (const line of block.lines ?? []) {
          if (line.text === undefined || line.bbox === undefined) continue
          labels.push({
            text: line.text,
            x: line.bbox.x + line.bbox.w / 2,
            y: line.bbox.y + line.bbox.h / 2,
          })
        }
      }
    }
    sheets.push({ width: bounds[2] - bounds[0], height: bounds[3] - bounds[1], labels })
  }
  return sheets
}

/** Определяет, в какой ячейке сетки лежит метка. Строка ноль — верх листа. */
export const cellOf = (
  sheet: ReadSheet,
  rows: number,
  cols: number,
  label: string,
): { readonly row: number; readonly col: number } | null => {
  const found = sheet.labels.find((l) => l.text.includes(label))
  if (found === undefined) return null
  const col = Math.min(Math.floor(found.x / (sheet.width / cols)), cols - 1)
  const row = Math.min(Math.floor(found.y / (sheet.height / rows)), rows - 1)
  return { row, col }
}
