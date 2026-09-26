import { readFile } from 'node:fs/promises'
import * as mupdf from 'mupdf'
import { type Browser, chromium, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../fixtures/make-pdf.js'
import { cellOf, readBack } from '../fixtures/read-back.js'

let server: ViteDevServer
let browser: Browser
let page: Page

const A5 = { width: 419.53, height: 595.28 }

const drop = (name: string, bytes: Uint8Array) =>
  page.setInputFiles('input[type=file]', {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  })

const button = (name: string) => page.getByRole('button', { name, exact: true })

const exported = async (): Promise<Uint8Array> => {
  const [download] = await Promise.all([page.waitForEvent('download'), button('export').click()])
  const path = await download.path()
  return new Uint8Array(await readFile(path))
}

/** Content operators of the first sheet: they show what the marks are drawn with. */
const contentsOf = (bytes: Uint8Array): string => {
  const opened = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  if (opened === null) throw new Error('export is not a PDF')
  // Narrowing to PDF, otherwise the page type stays generic and has no dictionary.
  const doc: mupdf.PDFDocument = opened
  const contents = doc.loadPage(0).getObject().get('Contents')
  const streams = contents.isArray()
    ? Array.from({ length: contents.length }, (_, i) => contents.get(i))
    : [contents]
  const text = streams
    .map((stream) => new TextDecoder().decode(stream.readStream().asUint8Array()))
    .join('\n')
  doc.destroy()
  return text
}

beforeAll(async () => {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'silent' })
  await server.listen()
  // The system browser: Chromium builds downloaded by Playwright lag behind the package version.
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await browser.newPage({ acceptDownloads: true })
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('server gave no address')
  // networkidle never comes: the server holds the hot-reload connection open.
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}, 60_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe('interface in the browser', () => {
  it('a foreign file stays on the empty screen with an explanation', async () => {
    await drop('notes.pdf', new TextEncoder().encode('not pdf'))
    await page.getByText('not a pdf, try another').waitFor()
  })

  it('default booklet: sixteen pages give eight sheets in stitching order', async () => {
    await drop('zine.pdf', makeNumberedPdf({ pageCount: 16, ...A5 }))
    await button('export').waitFor()
    // The counter goes by side: 16 booklet pages are 4 sheets of two sides, 8 sides.
    expect(await page.getByText('1 / 8').count()).toBe(1)
    await page.keyboard.press('ArrowRight')
    await page.getByText('2 / 8').waitFor()
    expect(await button('back').count()).toBe(1)
    await page.keyboard.press('ArrowLeft')
    await page.getByText('1 / 8').waitFor()
    const sheets = readBack(await exported())
    expect(sheets).toHaveLength(8)
    const first = sheets[0]
    if (first === undefined) throw new Error('no sheet')
    expect(cellOf(first, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  }, 60_000)

  it('switching the scheme to n-up changes both the preview and the file', async () => {
    await button('n-up').click()
    await page.getByText('1 / 4').waitFor()
    const sheets = readBack(await exported())
    expect(sheets).toHaveLength(4)
    const second = sheets[1]
    if (second === undefined) throw new Error('no sheet')
    expect(cellOf(second, 2, 2, 'bottom-P5')).toEqual({ row: 0, col: 0 })
  }, 60_000)

  it('a file with its own crop marks turns marks on and draws them with its numbers', async () => {
    // InDesign defaults: offset 6 pt, line 15 pt, stroke weight 0.25 pt, white underlay 1.25 pt.
    await drop(
      'indesign.pdf',
      makeNumberedPdf({
        pageCount: 4,
        ...A5,
        bleed: 21,
        bleedBox: 8.5,
        cropMarks: { offset: 6, length: 15, pen: 0.25, halo: 1.25 },
      }),
    )
    await page.getByText('from file: 2.1 mm gap, 5.3 mm long').waitFor()
    expect(await button('crop').getAttribute('aria-pressed')).toBe('true')
    expect(await page.getByLabel('margin', { exact: true }).inputValue()).toBe('7.41')
    const ops = contentsOf(await exported())
    expect(ops).toContain('1 1 1 RG')
    expect(ops).toContain('1.25 w')
  }, 60_000)

  it('a manual margin narrower than the file marks gives a warning', async () => {
    await page.getByLabel('margin', { exact: true }).fill('6')
    await page.getByText('marks don’t fit in the margin').waitFor()
  }, 60_000)
})
