import * as mupdf from 'mupdf'
import { describe, expect, it } from 'vitest'
import { makeNumberedPdf } from '../../../test/fixtures/make-pdf.js'
import { isErr, isOk } from '../../domain/result.js'
import { MupdfReader } from './mupdf-reader.js'

const reader = new MupdfReader()

/** Re-saves the fixture encrypted: the project has no encryptor of its own. */
const underPassword = (bytes: Uint8Array, password: string): Uint8Array => {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  if (doc === null) throw new Error('fixture is not a PDF')
  const buffer = doc.saveToBuffer(
    `encrypt=aes-256,user-password=${password},owner-password=${password}`,
  )
  const copy = new Uint8Array(buffer.asUint8Array())
  buffer.destroy()
  doc.destroy()
  return copy
}

describe('reading a document', () => {
  it('reads the page count and sizes', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 5, width: 300, height: 400 }))
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value.info.pageCount).toBe(5)
    expect(r.value.info.uniformSize?.w).toBeCloseTo(300, 3)
    reader.close(r.value.handle)
  })

  it('finds crop marks the file drew itself, along with their numbers', () => {
    const r = reader.open(
      makeNumberedPdf({
        pageCount: 2,
        width: 200,
        height: 300,
        bleed: 21,
        bleedBox: 8.5,
        cropMarks: { offset: 6, length: 15, pen: 0.25, halo: 1.25 },
      }),
    )
    if (!isOk(r)) throw new Error('did not open')
    const marks = r.value.info.cropMarks
    expect(marks?.offset).toBeCloseTo(6, 2)
    expect(marks?.length).toBeCloseTo(15, 2)
    expect(marks?.pen).toBeCloseTo(0.25, 2)
    expect(marks?.halo).toBeCloseTo(1.25, 2)
    reader.close(r.value.handle)
  })

  it('a margin without marks is not read as marks', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 300, bleed: 21 }))
    if (!isOk(r)) throw new Error('did not open')
    expect(r.value.info.cropMarks).toBeNull()
    reader.close(r.value.handle)
  })

  it('sees the TrimBox when there is one', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200, bleed: 10 }))
    if (!isOk(r)) throw new Error('did not open')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(true)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    expect(r.value.info.pages[0]?.media.w).toBeCloseTo(220, 3)
    reader.close(r.value.handle)
  })

  it('BleedBox is read as the bleed rectangle around the trim line', () => {
    const r = reader.open(
      makeNumberedPdf({ pageCount: 1, width: 200, height: 300, bleed: 20, bleedBox: 8.5 }),
    )
    if (!isOk(r)) throw new Error('did not open')
    const page = r.value.info.pages[0]
    if (page?.bleed === null || page?.bleed === undefined) throw new Error('no bleed')
    expect(page.trim.x - page.bleed.x).toBeCloseTo(8.5, 3)
    expect(page.bleed.w).toBeCloseTo(217, 3)
    reader.close(r.value.handle)
  })

  it('without a BleedBox the file gives no bleed, even with room past the trim line', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 300, bleed: 20 }))
    if (!isOk(r)) throw new Error('did not open')
    expect(r.value.info.pages[0]?.bleed).toBeNull()
    reader.close(r.value.handle)
  })

  it('without a TrimBox the CropBox counts as the trim', () => {
    const r = reader.open(makeNumberedPdf({ pageCount: 1, width: 200, height: 200 }))
    if (!isOk(r)) throw new Error('did not open')
    expect(r.value.info.pages[0]?.hasTrimBox).toBe(false)
    expect(r.value.info.pages[0]?.trim.w).toBeCloseTo(200, 3)
    reader.close(r.value.handle)
  })

  it('a file of another type is rejected as not a PDF', () => {
    const r = reader.open(new TextEncoder().encode('this is not a pdf'))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('NotAPdf')
  })

  it('a protected document returns a handle along with the password requirement', () => {
    const bytes = underPassword(makeNumberedPdf({ pageCount: 3, width: 300, height: 400 }), 'word')
    const r = reader.open(bytes)
    expect(isErr(r)).toBe(true)
    if (!isErr(r) || r.error.kind !== 'PasswordRequired')
      throw new Error('expected PasswordRequired')

    // A wrong password is a separate state: the input field is shown again.
    const wrong = reader.authenticate(r.error.handle, 'not it')
    expect(isErr(wrong)).toBe(true)
    if (isErr(wrong)) expect(wrong.error.kind).toBe('WrongPassword')

    const right = reader.authenticate(r.error.handle, 'word')
    if (!isOk(right)) throw new Error('password did not work')
    expect(right.value.info.pageCount).toBe(3)
    expect(right.value.info.uniformSize?.w).toBeCloseTo(300, 3)
    reader.close(right.value.handle)
  })

  it('a closed document can no longer be decrypted', () => {
    const bytes = underPassword(makeNumberedPdf({ pageCount: 1, width: 300, height: 400 }), 'key')
    const r = reader.open(bytes)
    if (!isErr(r) || r.error.kind !== 'PasswordRequired')
      throw new Error('expected PasswordRequired')
    reader.close(r.error.handle)
    const after = reader.authenticate(r.error.handle, 'key')
    expect(isErr(after)).toBe(true)
    if (isErr(after)) expect(after.error.kind).toBe('Unreadable')
  })

  it('a handle is tagged with its reader and does not answer to another', () => {
    const one = new MupdfReader()
    const other = new MupdfReader()
    const mine = one.open(makeNumberedPdf({ pageCount: 2, width: 300, height: 400 }))
    const theirs = other.open(makeNumberedPdf({ pageCount: 5, width: 300, height: 400 }))
    if (!isOk(mine) || !isOk(theirs)) throw new Error('document did not open')
    // The two readers' numbers match; only the origin tells them apart.
    expect(theirs.value.handle.id).toBe(mine.value.handle.id)
    expect(theirs.value.handle.origin).not.toBe(mine.value.handle.origin)
    expect(other.document(mine.value.handle)).toBeUndefined()
    // Closing through the other reader leaves the document alone: its own reader still uses it.
    other.close(mine.value.handle)
    expect(one.document(mine.value.handle)).toBeDefined()
    one.close(mine.value.handle)
    other.close(theirs.value.handle)
  })

  it('a truncated file still opens', () => {
    const full = makeNumberedPdf({ pageCount: 8, width: 200, height: 200 })
    const cut = full.slice(0, Math.floor(full.length * 0.8))
    const r = reader.open(cut)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) reader.close(r.value.handle)
  })
})
