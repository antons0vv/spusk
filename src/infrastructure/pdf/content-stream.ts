import type { Placement } from '../../domain/assemble.js'

/** Числа в содержимом PDF пишутся с фиксированной точностью и без хвостовых нулей. */
export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  const fixed = value.toFixed(4)
  if (!fixed.includes('.')) return fixed
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' || trimmed === '-' ? '0' : trimmed
}

const n = formatNumber

/** Операторы для одного размещения: клип по вылету, затем форма XObject. */
export const placementOps = (name: string, placement: Placement): string => {
  const { clip, matrix } = placement
  return [
    'q',
    `${n(clip.x)} ${n(clip.y)} ${n(clip.w)} ${n(clip.h)} re W n`,
    `${n(matrix[0])} ${n(matrix[1])} ${n(matrix[2])} ${n(matrix[3])} ${n(matrix[4])} ${n(matrix[5])} cm`,
    `/${name} Do`,
    'Q',
  ].join('\n')
}
