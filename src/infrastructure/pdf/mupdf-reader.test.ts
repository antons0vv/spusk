import * as mupdf from 'mupdf'
import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { isErr, isOk } from '../../domain/result.js'
import { MupdfReader } from './mupdf-reader.js'

const reader = new MupdfReader()

/** Пересобирает фикстуру зашифрованной: своего шифровальщика в проекте нет. */
const underPassword = (bytes: Uint8Array, password: string): Uint8Array => {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  if (doc === null) throw new Error('фикстура не PDF')
  const buffer = doc.saveToBuffer(
    `encrypt=aes-256,user-password=${password},owner-password=${password}`,
  )
  const copy = new Uint8Array(buffer.asUint8Array())
  buffer.destroy()
  doc.destroy()
  return copy
}

describe('чтение документа', () => {
  it('читает число полос и размеры', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 5, width: 300, height: 400 }))
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value.info.pageCount).toBe(5)
    expect(r.value.info.uniformSize?.w).toBeCloseTo(300, 3)
    reader.close(r.value.handle)
  })

  it('видит TrimBox, когда он есть', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200, bleed: 10 }))
    if (!isOk(r)) throw new Error('не открылось')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(true)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    expect(r.value.info.pages[0]?.media.w).toBeCloseTo(220, 3)
    reader.close(r.value.handle)
  })

  it('BleedBox читается как прямоугольник вылета вокруг линии реза', () => {
    const r = reader.open(
      makeNumberedPdf({ pageCount: 1, width: 200, height: 300, bleed: 20, bleedBox: 8.5 }),
    )
    if (!isOk(r)) throw new Error('не открылось')
    const page = r.value.info.pages[0]
    if (page?.bleed === null || page?.bleed === undefined) throw new Error('нет вылета')
    expect(page.trim.x - page.bleed.x).toBeCloseTo(8.5, 3)
    expect(page.bleed.w).toBeCloseTo(217, 3)
    reader.close(r.value.handle)
  })

  it('без BleedBox вылета из файла нет, даже если за линией реза есть место', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 300, bleed: 20 }))
    if (!isOk(r)) throw new Error('не открылось')
    expect(r.value.info.pages[0]?.bleed).toBeNull()
    reader.close(r.value.handle)
  })

  it('без TrimBox обрезным считается CropBox', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200 }))
    if (!isOk(r)) throw new Error('не открылось')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(false)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    reader.close(r.value.handle)
  })

  it('чужой файл отвергается как не PDF', () => {
    const r = reader.open(new TextEncoder().encode('это не pdf'))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('NotAPdf')
  })

  it('защищённый документ отдаёт дескриптор вместе с требованием пароля', () => {
    const bytes = underPassword(makeNumberedPdf({ pageCount: 3, width: 300, height: 400 }), 'слово')
    const r = reader.open(bytes)
    expect(isErr(r)).toBe(true)
    if (!isErr(r) || r.error.kind !== 'PasswordRequired') throw new Error('ждали PasswordRequired')

    // Неверный пароль — отдельное состояние: поле ввода показывается повторно.
    const wrong = reader.authenticate(r.error.handle, 'не то')
    expect(isErr(wrong)).toBe(true)
    if (isErr(wrong)) expect(wrong.error.kind).toBe('WrongPassword')

    const right = reader.authenticate(r.error.handle, 'слово')
    if (!isOk(right)) throw new Error('пароль не подошёл')
    expect(right.value.info.pageCount).toBe(3)
    expect(right.value.info.uniformSize?.w).toBeCloseTo(300, 3)
    reader.close(right.value.handle)
  })

  it('закрытый документ больше не расшифровать', () => {
    const bytes = underPassword(makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }), 'ключ')
    const r = reader.open(bytes)
    if (!isErr(r) || r.error.kind !== 'PasswordRequired') throw new Error('ждали PasswordRequired')
    reader.close(r.error.handle)
    const after = reader.authenticate(r.error.handle, 'ключ')
    expect(isErr(after)).toBe(true)
    if (isErr(after)) expect(after.error.kind).toBe('Unreadable')
  })

  it('дескриптор помечен своим читателем и чужому не отвечает', () => {
    const one = new MupdfReader()
    const other = new MupdfReader()
    const mine = one.open(makeNumberedPdf({ pageCount: 2, width: 300, height: 400 }))
    const theirs = other.open(makeNumberedPdf({ pageCount: 5, width: 300, height: 400 }))
    if (!isOk(mine) || !isOk(theirs)) throw new Error('документ не открылся')
    // Номера у двух читателей совпадают, различает их только происхождение.
    expect(theirs.value.handle.id).toBe(mine.value.handle.id)
    expect(theirs.value.handle.origin).not.toBe(mine.value.handle.origin)
    expect(other.document(mine.value.handle)).toBeUndefined()
    // Закрытие чужим читателем не трогает документ: свой читатель им ещё пользуется.
    other.close(mine.value.handle)
    expect(one.document(mine.value.handle)).toBeDefined()
    one.close(mine.value.handle)
    other.close(theirs.value.handle)
  })

  it('обрезанный файл всё равно открывается', () => {
    const full = makeNumberedPdf({ pageCount: 8, width: 200, height: 200 })
    const cut = full.slice(0, Math.floor(full.length * 0.8))
    const r = reader.open(cut)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) reader.close(r.value.handle)
  })
})
