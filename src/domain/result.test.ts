import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, ok } from './result.js'

describe('Result', () => {
  it('ok carries a value', () => {
    const r = ok(42)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value).toBe(42)
  })

  it('err carries an error', () => {
    const r = err({ kind: 'Broken' } as const)
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('Broken')
  })

  it('narrowing on isOk gives access only to its own branch', () => {
    const r: ReturnType<typeof ok<number>> | ReturnType<typeof err<string>> = ok(1)
    expect(isOk(r) ? r.value : 0).toBe(1)
  })
})
