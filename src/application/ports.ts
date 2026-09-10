import type { DocumentInfo } from '../domain/job.js'
import type { Plan } from '../domain/plan.js'
import type { Result } from '../domain/result.js'

export type DocumentHandle = { readonly id: number }
export type OpenedDocument = { readonly handle: DocumentHandle; readonly info: DocumentInfo }

export type OpenError =
  | { readonly kind: 'NotAPdf' }
  | { readonly kind: 'Encrypted' }
  | { readonly kind: 'Unreadable'; readonly message: string }

export type WriteError =
  | { readonly kind: 'Aborted' }
  | { readonly kind: 'Failed'; readonly message: string }

export interface DocumentReaderPort {
  open(bytes: Uint8Array): Result<OpenedDocument, OpenError>
  authenticate(handle: DocumentHandle, password: string): Result<OpenedDocument, OpenError>
  close(handle: DocumentHandle): void
}

export interface ImposedWriterPort {
  write(handle: DocumentHandle, plan: Plan): Result<Uint8Array, WriteError>
}
