import type { Placement } from '../../domain/assemble.js'
import type { ResolvedMark } from '../../domain/marks.js'

/** Предел координат в PDF. За ним `toFixed` срывается в экспоненту и файл ломается. */
const MAX_COORDINATE = 14400

/** Числа в содержимом PDF пишутся без экспоненты и без хвостовых нулей. */
export const formatNumber = (value: number, digits = 4): string => {
  if (!Number.isFinite(value)) return '0'
  const clamped = Math.min(Math.max(value, -MAX_COORDINATE), MAX_COORDINATE)
  const fixed = clamped.toFixed(digits)
  if (!fixed.includes('.')) return fixed
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' || trimmed === '-' || trimmed === '-0' ? '0' : trimmed
}

const n = (value: number): string => formatNumber(value)

/** Множители матрицы пишем точнее координат: их ошибка растягивается на всю полосу. */
const m = (value: number): string => formatNumber(value, 6)

/** Операторы для одного размещения: клип по вылету, затем форма XObject. */
export const placementOps = (name: string, placement: Placement): string => {
  const { clip, matrix } = placement
  return [
    'q',
    `${n(clip.x)} ${n(clip.y)} ${n(clip.w)} ${n(clip.h)} re W n`,
    `${m(matrix[0])} ${m(matrix[1])} ${m(matrix[2])} ${m(matrix[3])} ${n(matrix[4])} ${n(matrix[5])} cm`,
    `/${name} Do`,
    'Q',
  ].join('\n')
}

/** Коэффициент аппроксимации четверти окружности кривой Безье. */
const KAPPA = 0.5522847498

const circleOps = (cx: number, cy: number, r: number): string => {
  const k = r * KAPPA
  return [
    `${n(cx + r)} ${n(cy)} m`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
  ].join('\n')
}

/**
 * Операторы отрисовки меток. Штрихи чистые чёрные. Белые подложки идут раньше всех штрихов:
 * так подложка одной метки не ляжет поверх другой.
 */
export const markOps = (marks: readonly ResolvedMark[]): string => {
  if (marks.length === 0) return ''
  const ops: string[] = []
  const halos = marks.flatMap((m) =>
    m.kind === 'line' && m.halo !== null ? [{ from: m.from, to: m.to, width: m.halo }] : [],
  )
  if (halos.length > 0) {
    ops.push('q', '1 1 1 RG', '[] 0 d')
    for (const halo of halos) {
      ops.push(`${n(halo.width)} w`)
      ops.push(`${n(halo.from.x)} ${n(halo.from.y)} m`)
      ops.push(`${n(halo.to.x)} ${n(halo.to.y)} l`)
      ops.push('S')
    }
    ops.push('Q')
  }
  ops.push('q', '0 0 0 RG')
  for (const mark of marks) {
    if (mark.kind === 'line') {
      ops.push('q')
      ops.push(`${n(mark.pen)} w`)
      ops.push(mark.dash === null ? '[] 0 d' : `[${mark.dash.map(n).join(' ')}] 0 d`)
      ops.push(`${n(mark.from.x)} ${n(mark.from.y)} m`)
      ops.push(`${n(mark.to.x)} ${n(mark.to.y)} l`)
      ops.push('S')
      ops.push('Q')
      continue
    }
    ops.push('q')
    ops.push(`${n(mark.pen)} w`)
    ops.push('[] 0 d')
    ops.push(circleOps(mark.center.x, mark.center.y, mark.radius))
    ops.push('S')
    ops.push(`${n(mark.center.x - mark.radius * 1.4)} ${n(mark.center.y)} m`)
    ops.push(`${n(mark.center.x + mark.radius * 1.4)} ${n(mark.center.y)} l`)
    ops.push(`${n(mark.center.x)} ${n(mark.center.y - mark.radius * 1.4)} m`)
    ops.push(`${n(mark.center.x)} ${n(mark.center.y + mark.radius * 1.4)} l`)
    ops.push('S')
    ops.push('Q')
  }
  ops.push('Q')
  return ops.join('\n')
}
