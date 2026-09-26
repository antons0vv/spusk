import type { Size } from '../domain/geometry.js'
import type { DocumentInfo } from '../domain/job.js'
import type { Plan } from '../domain/plan.js'
import type { Result } from '../domain/result.js'

/**
 * Handle to an open document. `origin` marks the reader that issued it: each reader
 * counts independently, and without the mark a handle from another reader would
 * silently land in the wrong document.
 */
export type DocumentHandle = { readonly origin: string; readonly id: number }
export type OpenedDocument = { readonly handle: DocumentHandle; readonly info: DocumentInfo }

export type OpenError =
  | { readonly kind: 'NotAPdf' }
  /** Password-protected; the password hasn't been asked for yet. The handle is already issued. */
  | { readonly kind: 'PasswordRequired'; readonly handle: DocumentHandle }
  /** The password didn't match. The handle stays the same; the attempt can be repeated. */
  | { readonly kind: 'WrongPassword'; readonly handle: DocumentHandle }
  | { readonly kind: 'Unreadable'; readonly message: string }

export type WriteError =
  | { readonly kind: 'Aborted' }
  | { readonly kind: 'Failed'; readonly message: string }

export type RenderError = { readonly kind: 'Failed'; readonly message: string }

/** How many sheets are assembled so far, out of how many. */
export type Progress = (done: number, total: number) => void

/**
 * Raster of the normalized page, row by row from the top down, four bytes per pixel.
 * `page` is the size of the same page in points: it is what maps the pixels into domain
 * coordinates; the pixel dimensions won't do for that, they are rounded.
 */
export type PageImage = {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
  readonly page: Size
}

export interface DocumentReaderPort {
  /**
   * Opens a document. A password-protected document stays open too: the
   * `PasswordRequired` failure carries the handle to take to `authenticate`.
   * Such a document is still closed through `close`.
   */
  open(bytes: Uint8Array): Result<OpenedDocument, OpenError>
  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError>
  close(handle: DocumentHandle): void
}

export interface ImposedWriterPort {
  write(handle: DocumentHandle, plan: Plan, onProgress?: Progress): Result<Uint8Array, WriteError>
}

export interface PageRendererPort {
  /** Renders the page so that the long side of the raster is no more than `maxPx`. */
  render(handle: DocumentHandle, pageIndex: number, maxPx: number): Result<PageImage, RenderError>
}

/**
 * The engine worker is gone: it was recreated on cancel (`Aborted`) or it crashed on its
 * own, most often from running out of memory (`Crashed`). Open documents are lost with
 * it; the new worker won't accept handles from the old one.
 */
export type EngineFailure =
  | { readonly kind: 'Aborted' }
  | { readonly kind: 'Crashed'; readonly message: string }

/** The same three ports across the worker boundary: no call crosses it synchronously. */
export interface EnginePort {
  open(bytes: Uint8Array): Promise<Result<OpenedDocument, OpenError | EngineFailure>>
  authenticate(
    handle: DocumentHandle,
    password: string,
  ): Promise<Result<OpenedDocument, OpenError | EngineFailure>>
  close(handle: DocumentHandle): Promise<void>
  render(
    handle: DocumentHandle,
    pageIndex: number,
    maxPx: number,
  ): Promise<Result<PageImage, RenderError | EngineFailure>>
  write(
    handle: DocumentHandle,
    plan: Plan,
    onProgress: Progress,
  ): Promise<Result<Uint8Array, WriteError | EngineFailure>>
  /** Cuts off everything running in the worker. Pending calls get `Aborted`. */
  reset(): void
}
