type Options = {
  readonly pageCount: number
  readonly width: number
  readonly height: number
  /** Вылет со всех сторон. MediaBox станет больше TrimBox на эту величину. */
  readonly bleed?: number
  /** Сдвиг начала координат MediaBox (и содержимого вместе с ним) по x и y. */
  readonly origin?: number
  /** Поворот страницы (/Rotate), градусы по часовой стрелке: 90, 180 или 270. */
  readonly rotate?: number
}

const encoder = new TextEncoder()

const contentFor = (label: string, w: number, h: number, off: number): string =>
  [
    `q 0.85 0.85 0.85 rg ${off} ${off} ${w} ${h} re f Q`,
    `BT /F1 48 Tf 1 0 0 1 ${off + w / 2 - 40} ${off + h / 2 - 20} Tm 0 0 0 rg (${label}) Tj ET`,
    `BT /F1 14 Tf 1 0 0 1 ${off + 12} ${off + 12} Tm (bottom-${label}) Tj ET`,
    `BT /F1 14 Tf 1 0 0 1 ${off + 12} ${off + h - 24} Tm (top-${label}) Tj ET`,
  ].join('\n')

/** Собирает PDF вручную, без зависимостей: полосы пронумерованы P1, P2, ... */
export const makeNumberedPdf = (options: Options): Uint8Array => {
  const bleed = options.bleed ?? 0
  const origin = options.origin ?? 0
  const mediaW = options.width + bleed * 2
  const mediaH = options.height + bleed * 2
  const chunks: Uint8Array[] = []
  const offsets = new Map<number, number>()
  let length = 0

  const push = (text: string): void => {
    const bytes = encoder.encode(text)
    chunks.push(bytes)
    length += bytes.length
  }
  const emit = (num: number, body: string): void => {
    offsets.set(num, length)
    push(`${num} 0 obj\n${body}\nendobj\n`)
  }

  push('%PDF-1.7\n')

  const pageNums = Array.from({ length: options.pageCount }, (_, i) => 4 + i * 2)
  const contentNums = Array.from({ length: options.pageCount }, (_, i) => 5 + i * 2)

  emit(1, '<< /Type /Catalog /Pages 2 0 R >>')
  emit(
    2,
    `<< /Type /Pages /Count ${options.pageCount} /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] >>`,
  )
  emit(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  for (let i = 0; i < options.pageCount; i += 1) {
    const label = `P${i + 1}`
    const stream = contentFor(label, options.width, options.height, origin + bleed)
    const contentNum = contentNums[i]
    const pageNum = pageNums[i]
    if (contentNum === undefined || pageNum === undefined) continue
    emit(contentNum, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`)
    const trim =
      bleed > 0
        ? ` /TrimBox [${origin + bleed} ${origin + bleed} ${origin + bleed + options.width} ${origin + bleed + options.height}]`
        : ''
    const rotate = options.rotate !== undefined ? ` /Rotate ${options.rotate}` : ''
    emit(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [${origin} ${origin} ${origin + mediaW} ${origin + mediaH}]${trim}${rotate} ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
    )
  }

  const maxNum = Math.max(...offsets.keys())
  const startxref = length
  const rows = ['0000000000 65535 f ']
  for (let n = 1; n <= maxNum; n += 1) {
    rows.push(`${String(offsets.get(n) ?? 0).padStart(10, '0')} 00000 n `)
  }
  push(`xref\n0 ${maxNum + 1}\n${rows.join('\n')}\n`)
  push(`trailer\n<< /Size ${maxNum + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
