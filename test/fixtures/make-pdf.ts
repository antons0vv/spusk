/** CropBox offsets inward from the MediaBox, for each edge separately. */
export type CropInsets = {
  readonly left: number
  readonly bottom: number
  readonly right: number
  readonly top: number
}

export type Options = {
  readonly pageCount: number
  readonly width: number
  readonly height: number
  /** Bleed on all sides. The MediaBox becomes larger than the TrimBox by this amount. */
  readonly bleed?: number
  /** Declare a BleedBox this far around the TrimBox. Works together with `bleed`. */
  readonly bleedBox?: number
  /** Shift of the MediaBox origin (and the content along with it) in x and y. */
  readonly origin?: number
  /** Page rotation (/Rotate), degrees clockwise: 90, 180 or 270. */
  readonly rotate?: number
  /**
   * CropBox narrower than the MediaBox by these offsets. A cropped page gets the label
   * `outside-P*` drawn: it must not reach the finished sheet.
   */
  readonly crop?: CropInsets
  /** Emit the content as an array of two streams instead of one. */
  readonly splitContents?: boolean
  /** Indices of pages (zero-based) that get no /Contents key at all. */
  readonly withoutContents?: readonly number[]
  /** Declare a transparency group on the pages. */
  readonly transparencyGroup?: boolean
  /**
   * Crop marks in the margin beyond the TrimBox, the way InDesign draws them: two strokes at each
   * corner continuing the trim lines, a white underlay under each. The margin comes from `bleed`.
   */
  readonly cropMarks?: {
    readonly offset: number
    readonly length: number
    readonly pen: number
    readonly halo?: number
  }
}

const encoder = new TextEncoder()

/** Main content of the page: a background and a large label in the center. */
const bodyOf = (label: string, w: number, h: number, off: number): readonly string[] => [
  `q 0.85 0.85 0.85 rg ${off} ${off} ${w} ${h} re f Q`,
  `BT /F1 48 Tf 1 0 0 1 ${off + w / 2 - 40} ${off + h / 2 - 20} Tm 0 0 0 rg (${label}) Tj ET`,
]

/** Corner labels: from them the read-back tells where the page's bottom and top are. */
const cornersOf = (
  label: string,
  h: number,
  off: number,
  bleed: number,
  crop: CropInsets | undefined,
  origin: number,
): readonly string[] => [
  `BT /F1 14 Tf 1 0 0 1 ${off + 12} ${off + 12} Tm (bottom-${label}) Tj ET`,
  `BT /F1 14 Tf 1 0 0 1 ${off + 12} ${off + h - 24} Tm (top-${label}) Tj ET`,
  // A label in the bleed area: it lies beyond the trim line (TrimBox) and must not reach the
  // finished sheet.
  bleed > 0 ? `BT /F1 8 Tf 1 0 0 1 ${off + 12} ${off - bleed / 2} Tm (bleed-${label}) Tj ET` : '',
  // A label beyond the CropBox: the CropBox itself hides it, it doesn't go onto the finished sheet.
  crop !== undefined
    ? `BT /F1 6 Tf 1 0 0 1 ${origin + 1} ${origin + 1} Tm (outside-${label}) Tj ET`
    : '',
]

/** Crop mark strokes around the page; a stroke is clipped by the MediaBox edge, as in InDesign. */
const cropMarksOf = (
  marks: NonNullable<Options['cropMarks']>,
  off: number,
  w: number,
  h: number,
  origin: number,
  mediaW: number,
  mediaH: number,
): readonly string[] => {
  const segments: [number, number, number, number][] = []
  for (const [x, out] of [
    [off, -1],
    [off + w, 1],
  ] as const) {
    for (const y of [off, off + h]) {
      const start = x + out * marks.offset
      const end = Math.min(
        origin + mediaW,
        Math.max(origin, x + out * (marks.offset + marks.length)),
      )
      segments.push([start, y, end, y])
    }
  }
  for (const [y, out] of [
    [off, -1],
    [off + h, 1],
  ] as const) {
    for (const x of [off, off + w]) {
      const start = y + out * marks.offset
      const end = Math.min(
        origin + mediaH,
        Math.max(origin, y + out * (marks.offset + marks.length)),
      )
      segments.push([x, start, x, end])
    }
  }
  const draw = (color: string, width: number) =>
    segments.map(([x0, y0, x1, y1]) => `q ${color} RG ${width} w ${x0} ${y0} m ${x1} ${y1} l S Q`)
  return [
    ...(marks.halo === undefined ? [] : draw('1 1 1', marks.halo)),
    ...draw('0 0 0', marks.pen),
  ]
}

/** Builds a PDF by hand, without dependencies: pages are numbered P1, P2, ... */
export const makeNumberedPdf = (options: Options): Uint8Array => {
  const bleed = options.bleed ?? 0
  const origin = options.origin ?? 0
  const withoutContents = options.withoutContents ?? []
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
  const emitStream = (num: number, text: string): void => {
    emit(num, `<< /Length ${encoder.encode(text).length} >>\nstream\n${text}\nendstream`)
  }

  // Object numbers are handed out in advance: the catalog and the page tree go first so that a
  // truncated file can still be repaired by the engine, and page references are known before
  // their bodies.
  let lastNum = 3
  const layout = Array.from({ length: options.pageCount }, (_, i) => {
    const streamCount = withoutContents.includes(i) ? 0 : options.splitContents ? 2 : 1
    const streams: number[] = []
    for (let s = 0; s < streamCount; s += 1) {
      lastNum += 1
      streams.push(lastNum)
    }
    lastNum += 1
    return { streams, num: lastNum }
  })

  push('%PDF-1.7\n')
  emit(1, '<< /Type /Catalog /Pages 2 0 R >>')
  emit(
    2,
    `<< /Type /Pages /Count ${options.pageCount} /Kids [${layout.map((p) => `${p.num} 0 R`).join(' ')}] >>`,
  )
  emit(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  for (let i = 0; i < options.pageCount; i += 1) {
    const spot = layout[i]
    if (spot === undefined) continue
    const label = `P${i + 1}`
    const off = origin + bleed
    const body = bodyOf(label, options.width, options.height, off)
    const corners = [
      ...cornersOf(label, options.height, off, bleed, options.crop, origin),
      ...(options.cropMarks === undefined
        ? []
        : cropMarksOf(
            options.cropMarks,
            off,
            options.width,
            options.height,
            origin,
            mediaW,
            mediaH,
          )),
    ]
    const texts = options.splitContents
      ? [body.join('\n'), corners.filter((s) => s !== '').join('\n')]
      : [[...body, ...corners].filter((s) => s !== '').join('\n')]
    spot.streams.forEach((num, at) => {
      emitStream(num, texts[at] ?? '')
    })

    const trim =
      bleed > 0
        ? ` /TrimBox [${origin + bleed} ${origin + bleed} ${origin + bleed + options.width} ${origin + bleed + options.height}]`
        : ''
    const bleedBox =
      options.bleedBox === undefined
        ? ''
        : ` /BleedBox [${origin + bleed - options.bleedBox} ${origin + bleed - options.bleedBox} ` +
          `${origin + bleed + options.width + options.bleedBox} ${origin + bleed + options.height + options.bleedBox}]`
    const crop =
      options.crop === undefined
        ? ''
        : ` /CropBox [${origin + options.crop.left} ${origin + options.crop.bottom} ` +
          `${origin + mediaW - options.crop.right} ${origin + mediaH - options.crop.top}]`
    const rotate = options.rotate !== undefined ? ` /Rotate ${options.rotate}` : ''
    const group = options.transparencyGroup
      ? ' /Group << /Type /Group /S /Transparency /CS /DeviceRGB /I true >>'
      : ''
    const stream =
      spot.streams.length === 0
        ? ''
        : spot.streams.length === 1
          ? ` /Contents ${spot.streams[0]} 0 R`
          : ` /Contents [${spot.streams.map((n) => `${n} 0 R`).join(' ')}]`
    // A page without content is left without resources too: that's how text editors emit it.
    const resources = spot.streams.length === 0 ? '' : ' /Resources << /Font << /F1 3 0 R >> >>'

    emit(
      spot.num,
      `<< /Type /Page /Parent 2 0 R /MediaBox [${origin} ${origin} ${origin + mediaW} ${origin + mediaH}]` +
        `${trim}${bleedBox}${crop}${rotate}${group}${resources}${stream} >>`,
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
