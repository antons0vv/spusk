import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { CutMarks, TRIM } from './crop-marks.js'

/**
 * Каркас всех экранов: боковая колонка слева, рабочее поле справа. Ширина колонки
 * постоянная, чтобы метка реза между ними не прыгала при смене экрана. Внизу колонки
 * действия, сверху её содержимое прокручивается само.
 */
export const Shell = ({
  sidebar,
  footer,
  children,
}: {
  sidebar: ReactNode
  footer?: ReactNode
  children: ReactNode
}) => {
  const aside = useRef<HTMLElement>(null)
  const main = useRef<HTMLElement>(null)
  const [cutX, setCutX] = useState<number | null>(null)

  useLayoutEffect(() => {
    const left = aside.current
    const right = main.current
    if (left === null || right === null) return
    const measure = () =>
      setCutX((left.getBoundingClientRect().right + right.getBoundingClientRect().left) / 2)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(left)
    observer.observe(right)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="fixed inset-0 grid grid-cols-[26em_minmax(0,1fr)] gap-x-[3em]"
      style={{ paddingInline: TRIM + 24, paddingBlock: TRIM + 16 }}
    >
      {cutX !== null && <CutMarks x={cutX} />}
      <aside ref={aside} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-y-[1lh]">
        <div className="min-h-0 overflow-y-auto pr-[0.5em]">{sidebar}</div>
        {footer !== undefined && (
          <div className="flex flex-wrap gap-x-[1.2em] whitespace-pre">{footer}</div>
        )}
      </aside>
      <main ref={main} className="grid min-h-0 min-w-0">
        {children}
      </main>
    </div>
  )
}
