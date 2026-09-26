import type { DocumentHandle, EngineFailure, EnginePort } from '../../application/ports.js'
import type { Size } from '../../domain/geometry.js'

export type Thumbnail = {
  readonly bitmap: ImageBitmap
  readonly width: number
  readonly height: number
  readonly page: Size
}

export type Want = { readonly page: number; readonly px: number }

type Entry = Thumbnail & { readonly px: number; used: number }

const BUCKETS = [256, 512, 1024, 2048] as const

/** Rasters come in steps: otherwise every pixel of a window resize would re-render the book. */
export const bucketFor = (px: number): number =>
  BUCKETS.find((b) => b >= px) ?? BUCKETS[BUCKETS.length - 1] ?? 2048

/** About 200 MB of rasters; beyond that, the ones not shown for the longest are thrown out. */
const PIXEL_BUDGET = 50_000_000

/**
 * Thumbnail cache for one document. On every render the preview says which pages it
 * needs right now, and the cache pulls them from the engine one at a time, only from that
 * list: fast flipping doesn't pile up a queue in the worker.
 */
export class Thumbnails {
  private readonly entries = new Map<number, Entry>()
  private readonly failed = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private wanted: readonly Want[] = []
  private busy = false
  private clock = 0
  private disposed = false

  constructor(
    private readonly engine: EnginePort,
    private readonly handle: () => DocumentHandle | null,
    private readonly onFailure: (failure: EngineFailure) => void,
  ) {}

  best(page: number): Thumbnail | null {
    const entry = this.entries.get(page)
    if (entry === undefined) return null
    this.clock += 1
    entry.used = this.clock
    return entry
  }

  want(requests: readonly Want[]): void {
    this.wanted = requests
    void this.pump()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.disposed = true
    for (const entry of this.entries.values()) entry.bitmap.close()
    this.entries.clear()
    this.listeners.clear()
  }

  private next(): Want | undefined {
    return this.wanted.find(
      (w) => (this.entries.get(w.page)?.px ?? 0) < w.px && !this.failed.has(`${w.page}@${w.px}`),
    )
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      for (let want = this.next(); want !== undefined; want = this.next()) {
        const handle = this.handle()
        if (handle === null || this.disposed) return
        const result = await this.engine.render(handle, want.page, want.px)
        if (this.disposed) return
        if (!result.ok) {
          if (result.error.kind === 'Aborted' || result.error.kind === 'Crashed') {
            this.onFailure(result.error)
            return
          }
          this.failed.add(`${want.page}@${want.px}`)
          continue
        }
        const { width, height, pixels, page } = result.value
        const bitmap = await createImageBitmap(new ImageData(pixels, width, height))
        if (this.disposed) {
          bitmap.close()
          return
        }
        this.entries.get(want.page)?.bitmap.close()
        this.clock += 1
        this.entries.set(want.page, { bitmap, width, height, page, px: want.px, used: this.clock })
        this.evict()
        for (const listener of this.listeners) listener()
      }
    } finally {
      this.busy = false
    }
  }

  private evict(): void {
    let total = 0
    for (const entry of this.entries.values()) total += entry.width * entry.height
    const visible = new Set(this.wanted.map((w) => w.page))
    const oldest = [...this.entries.entries()]
      .filter(([page]) => !visible.has(page))
      .sort((a, b) => a[1].used - b[1].used)
    for (const [page, entry] of oldest) {
      if (total <= PIXEL_BUDGET) break
      total -= entry.width * entry.height
      entry.bitmap.close()
      this.entries.delete(page)
    }
  }
}
