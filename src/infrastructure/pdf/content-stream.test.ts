import { describe, expect, it } from 'vitest'
import type { ResolvedMark } from '../../domain/marks.js'
import { pt } from '../../domain/units.js'
import { formatNumber, markOps } from './content-stream.js'

const haloLine = (y: number): Extract<ResolvedMark, { kind: 'line' }> => ({
  kind: 'line',
  from: { x: pt(10), y: pt(y) },
  to: { x: pt(30), y: pt(y) },
  pen: pt(0.25),
  dash: null,
  halo: pt(1.25),
})

describe('content operators', () => {
  it('numbers are written without trailing zeros', () => {
    expect(formatNumber(0.00001)).toBe('0')
    expect(formatNumber(12.5)).toBe('12.5')
    expect(formatNumber(100)).toBe('100')
    expect(formatNumber(-0.5)).toBe('-0.5')
  })

  it('a non-number never reaches the content', () => {
    expect(formatNumber(Number.NaN)).toBe('0')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0')
  })

  it('a solid line gives move, line and stroke', () => {
    const marks: ResolvedMark[] = [
      {
        kind: 'line',
        from: { x: pt(10), y: pt(20) },
        to: { x: pt(30), y: pt(20) },
        pen: pt(0.2),
        dash: null,
        halo: null,
      },
    ]
    const ops = markOps(marks)
    expect(ops).toContain('10 20 m')
    expect(ops).toContain('30 20 l')
    expect(ops).toContain('S')
    expect(ops).toContain('0.2 w')
  })

  it('a dash pattern sets the dash array', () => {
    const marks: ResolvedMark[] = [
      {
        kind: 'line',
        from: { x: pt(0), y: pt(0) },
        to: { x: pt(0), y: pt(10) },
        pen: pt(0.2),
        dash: [3, 3],
        halo: null,
      },
    ]
    expect(markOps(marks)).toContain('[3 3] 0 d')
  })

  it('the underlay is drawn as a white line of its own width before the stroke itself', () => {
    const ops = markOps([haloLine(20)])
    expect(ops.indexOf('1 1 1 RG')).toBeGreaterThan(-1)
    expect(ops.indexOf('1 1 1 RG')).toBeLessThan(ops.indexOf('1.25 w'))
    expect(ops.indexOf('1.25 w')).toBeLessThan(ops.indexOf('0.25 w'))
    // The same segment is stroked twice: by the underlay and by the stroke.
    expect(ops.split('10 20 m')).toHaveLength(3)
  })

  it('all underlays precede all strokes: another mark’s underlay cannot cover a mark', () => {
    const ops = markOps([haloLine(20), haloLine(40)])
    expect(ops.split('1.25 w')).toHaveLength(3)
    expect(ops.lastIndexOf('1.25 w')).toBeLessThan(ops.indexOf('0.25 w'))
  })

  it('a stroke without an underlay draws no white', () => {
    expect(markOps([{ ...haloLine(20), halo: null }])).not.toContain('1 1 1 RG')
  })

  it('a registration mark draws a circle and a cross', () => {
    const marks: ResolvedMark[] = [
      { kind: 'registration', center: { x: pt(50), y: pt(50) }, radius: pt(5), pen: pt(0.2) },
    ]
    const ops = markOps(marks)
    expect(ops).toContain('c')
    expect(ops.match(/S/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('an empty mark list gives an empty string', () => {
    expect(markOps([])).toBe('')
  })
})
