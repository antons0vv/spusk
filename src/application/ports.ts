import type { Size } from '../domain/geometry.js'
import type { DocumentInfo } from '../domain/job.js'
import type { Plan } from '../domain/plan.js'
import type { Result } from '../domain/result.js'

/**
 * Дескриптор открытого документа. `origin` помечает читателя, который его выдал:
 * счётчики у разных читателей независимы, и без пометки чужой дескриптор молча
 * попал бы в чужой документ.
 */
export type DocumentHandle = { readonly origin: string; readonly id: number }
export type OpenedDocument = { readonly handle: DocumentHandle; readonly info: DocumentInfo }

export type OpenError =
  | { readonly kind: 'NotAPdf' }
  /** Документ под паролем, пароля ещё не спрашивали. Дескриптор уже выдан. */
  | { readonly kind: 'PasswordRequired'; readonly handle: DocumentHandle }
  /** Пароль не подошёл. Дескриптор прежний, попытку можно повторить. */
  | { readonly kind: 'WrongPassword'; readonly handle: DocumentHandle }
  | { readonly kind: 'Unreadable'; readonly message: string }

export type WriteError =
  | { readonly kind: 'Aborted' }
  | { readonly kind: 'Failed'; readonly message: string }

export type RenderError = { readonly kind: 'Failed'; readonly message: string }

/** Сколько листов уже собрано из скольких. */
export type Progress = (done: number, total: number) => void

/**
 * Растр приведённой полосы, построчно сверху вниз, по четыре байта на пиксель.
 * `page` — размер той же полосы в пунктах: по нему пиксели кладутся в координаты
 * домена, пиксельные размеры для этого не годятся, они округлены.
 */
export type PageImage = {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
  readonly page: Size
}

export interface DocumentReaderPort {
  /**
   * Открывает документ. Защищённый паролем документ тоже остаётся открытым:
   * отказ `PasswordRequired` несёт дескриптор, с которым идут в `authenticate`.
   * Закрывать такой документ всё равно через `close`.
   */
  open(bytes: Uint8Array): Result<OpenedDocument, OpenError>
  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError>
  close(handle: DocumentHandle): void
}

export interface ImposedWriterPort {
  write(handle: DocumentHandle, plan: Plan, onProgress?: Progress): Result<Uint8Array, WriteError>
}

export interface PageRendererPort {
  /** Рисует полосу так, чтобы длинная сторона растра была не больше `maxPx`. */
  render(handle: DocumentHandle, pageIndex: number, maxPx: number): Result<PageImage, RenderError>
}

/**
 * Поток с движком пропал: его пересоздали по отмене (`Aborted`) или он упал сам,
 * чаще всего от нехватки памяти (`Crashed`). Открытые документы пропадают вместе
 * с ним, дескрипторы от прежнего потока новый поток не примет.
 */
export type EngineFailure =
  | { readonly kind: 'Aborted' }
  | { readonly kind: 'Crashed'; readonly message: string }

/** Те же три порта за границей потока: через неё синхронных вызовов не бывает. */
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
  /** Обрывает всё, что идёт в потоке. Незавершённые вызовы получают `Aborted`. */
  reset(): void
}
