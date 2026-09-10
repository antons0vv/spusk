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
  write(handle: DocumentHandle, plan: Plan): Result<Uint8Array, WriteError>
}
