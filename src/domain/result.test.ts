import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, ok } from './result.js'

describe('Result', () => {
  it('ok несёт значение', () => {
    const r = ok(42)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value).toBe(42)
  })

  it('err несёт ошибку', () => {
    const r = err({ kind: 'Broken' } as const)
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.kind).toBe('Broken')
  })

  it('сужение по isOk даёт доступ только к своей ветке', () => {
    const r: ReturnType<typeof ok<number>> | ReturnType<typeof err<string>> = ok(1)
    expect(isOk(r) ? r.value : 0).toBe(1)
  })
})
