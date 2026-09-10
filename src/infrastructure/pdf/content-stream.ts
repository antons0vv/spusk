import type { Placement } from '../../domain/assemble.js'

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
