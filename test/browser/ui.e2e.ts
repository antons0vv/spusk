import { readFile } from 'node:fs/promises'
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

beforeAll(async () => {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'silent' })
  await server.listen()
  // Браузер системный: скачанные Playwright сборки Chromium отстают от версии пакета.
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await browser.newPage({ acceptDownloads: true })
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('сервер не отдал адрес')
  // networkidle не наступит: сервер держит соединение горячей перезагрузки.
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}, 60_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe('интерфейс в браузере', () => {
  it('чужой файл остаётся на пустом экране с объяснением', async () => {
    await drop('notes.pdf', new TextEncoder().encode('не pdf'))
    await page.getByText('not a pdf, try another').waitFor()
  })

  it('брошюра по умолчанию: шестнадцать полос дают восемь листов в порядке сшивки', async () => {
    await drop('zine.pdf', makeNumberedPdf({ pageCount: 16, ...A5 }))
    await button('export').waitFor()
    expect(await page.getByText('1 / 4').count()).toBe(1)
    const sheets = readBack(await exported())
    expect(sheets).toHaveLength(8)
    const first = sheets[0]
    if (first === undefined) throw new Error('нет листа')
    expect(cellOf(first, 1, 2, 'bottom-P16')).toEqual({ row: 0, col: 0 })
    expect(cellOf(first, 1, 2, 'bottom-P1')).toEqual({ row: 0, col: 1 })
  }, 60_000)

  it('смена схемы на n-up меняет и превью, и файл', async () => {
    await button('n-up').click()
    await page.getByText('1 / 4').waitFor()
    const sheets = readBack(await exported())
    expect(sheets).toHaveLength(4)
    const second = sheets[1]
    if (second === undefined) throw new Error('нет листа')
    expect(cellOf(second, 2, 2, 'bottom-P5')).toEqual({ row: 0, col: 0 })
  }, 60_000)
})
