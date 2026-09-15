import type { DocumentInfo } from './job.js'
import { type Pt, pt } from './units.js'

/**
 * Вылет, который действительно есть в файле: наименьший запас от линии реза до BleedBox
 * по всем сторонам всех полос. Берётся самый бедный край, иначе на нём после резки
 * останется белая полоска. Полоса без BleedBox обнуляет вылет: пространство за линией
 * реза у таких файлов часто занято метками и полями, печатать его как вылет нельзя.
 */
export const fileBleed = (doc: DocumentInfo): Pt => {
  if (doc.pages.length === 0) return pt(0)
  let least = Number.POSITIVE_INFINITY
  for (const { trim, bleed } of doc.pages) {
    if (bleed === null) return pt(0)
    least = Math.min(
      least,
      trim.x - bleed.x,
      trim.y - bleed.y,
      bleed.x + bleed.w - (trim.x + trim.w),
      bleed.y + bleed.h - (trim.y + trim.h),
    )
  }
  return pt(Math.max(0, least))
}
