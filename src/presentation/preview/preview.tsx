import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DocumentHandle } from '../../application/ports.js'
import type { Sheet } from '../../domain/assemble.js'
import { compose, type Matrix, type Rect, type Size } from '../../domain/geometry.js'
import { pt } from '../../domain/units.js'
import { bucketFor, type Thumbnails, type Want } from './thumbnails.js'
import {
  type Box,
  fitView,
  pointToCanvas,
  rasterToCanvas,
  rectToCanvas,
  snapToPixels,
  type View,
} from './transform.js'

const HAIR = '#dcdcdc'
const WASH = '#f3f3f3'

/**
 * Room for the navigation under the sheet: spacing and one line. The line height comes from
 * the layout, not a number: the type size is set in one place, in styles.css.
 */
const footerHeight = (): number =>
  2 * (Number.parseFloat(getComputedStyle(document.body).lineHeight) || 0)

const useBox = (ref: React.RefObject<HTMLElement | null>): Box => {
  const [box, setBox] = useState<Box>({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return box
}

/**
 * Clip to whole screen pixels. Neighboring pages share one trim line, and without
 * rounding the antialiasing of both clips leaves a light seam between them.
 */
const snappedClip = (r: Rect, size: Size, view: View, dpr: number) => {
  const c = rectToCanvas(r, size, view)
  const snap = (v: number) => Math.round(v * dpr) / dpr
  const x = snap(c.x)
  const y = snap(c.y)
  return { x, y, w: snap(c.x + c.w) - x, h: snap(c.y + c.h) - y }
}

const drawMarks = (
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  size: Size,
  view: View,
  dpr: number,
) => {
  ctx.strokeStyle = '#000'
  // At preview scale the mark's stroke weight is thinner than a pixel: draw a screen hairline.
  ctx.lineWidth = 1 / dpr
  for (const mark of sheet.marks) {
    ctx.beginPath()
    if (mark.kind === 'line') {
      ctx.setLineDash(mark.dash === null ? [] : mark.dash.map((d) => d * view.scale))
      const from = pointToCanvas(mark.from, size, view)
      const to = pointToCanvas(mark.to, size, view)
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    } else {
      ctx.setLineDash([])
      const c = pointToCanvas(mark.center, size, view)
      const r = mark.radius * view.scale
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.moveTo(c.x - r * 1.4, c.y)
      ctx.lineTo(c.x + r * 1.4, c.y)
      ctx.moveTo(c.x, c.y - r * 1.4)
      ctx.lineTo(c.x, c.y + r * 1.4)
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
}

/**
 * One whole sheet of the plan. Pages are drawn from thumbnails through the same placement
 * matrix and the same bleed clip as the writer's; a redraw doesn't touch the engine as long
 * as the needed thumbnail is already there. The sheet is pinned to the top of the column,
 * the navigation comes right under it.
 */
export const Preview = ({
  sheet,
  size,
  thumbnails,
  handle,
  children,
}: {
  sheet: Sheet
  size: Size
  thumbnails: Thumbnails
  handle: DocumentHandle
  children: ReactNode
}) => {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useBox(holder)
  const [loaded, setLoaded] = useState(0)

  const fitted = fitView(size, { w: box.w, h: Math.max(0, box.h - footerHeight()) })
  const cssW = Math.floor(size.w * fitted.scale)
  const cssH = Math.floor(size.h * fitted.scale)

  useEffect(() => thumbnails.subscribe(() => setLoaded((n) => n + 1)), [thumbnails])

  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded and handle redraw the sheet when a thumbnail arrives or the document is reopened
  useLayoutEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (element == null || ctx == null || cssW <= 0 || cssH <= 0) return
    const dpr = window.devicePixelRatio || 1
    element.width = Math.round(cssW * dpr)
    element.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.imageSmoothingQuality = 'high'

    const view: View = { scale: Math.min(cssW / size.w, cssH / size.h), x: 0, y: 0 }
    const wanted: Want[] = []
    for (const placement of sheet.placements) {
      const trim = rectToCanvas(placement.trim, size, view)
      if (placement.source.kind === 'blank') {
        ctx.strokeStyle = HAIR
        ctx.lineWidth = 1 / dpr
        ctx.strokeRect(trim.x, trim.y, trim.w, trim.h)
        continue
      }
      const page = placement.source.index
      wanted.push({ page, px: bucketFor(Math.max(trim.w, trim.h) * dpr) })
      const thumb = thumbnails.best(page)
      const clip = snappedClip(placement.clip, size, view, dpr)
      ctx.save()
      ctx.beginPath()
      ctx.rect(clip.x, clip.y, clip.w, clip.h)
      ctx.clip()
      if (thumb === null) {
        ctx.fillStyle = WASH
        ctx.fillRect(trim.x, trim.y, trim.w, trim.h)
      } else {
        const toDevice: Matrix = [dpr, 0, 0, dpr, pt(0), pt(0)]
        const m = snapToPixels(
          compose(rasterToCanvas(thumb, placement.matrix, size, view), toDevice),
          thumb.width,
          thumb.height,
        )
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
        ctx.drawImage(thumb.bitmap, 0, 0)
      }
      ctx.restore()
    }
    drawMarks(ctx, sheet, size, view, dpr)
    thumbnails.want(wanted)
  }, [sheet, size, cssW, cssH, thumbnails, loaded, handle])

  return (
    <div ref={holder} className="flex min-h-0 min-w-0 flex-col items-center">
      <canvas
        ref={canvas}
        style={{ width: cssW, height: cssH }}
        className="shrink-0 shadow-[0_0_0_var(--pen)_var(--color-hair)]"
      />
      <div className="mt-[1lh]">{children}</div>
    </div>
  )
}
