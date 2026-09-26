import * as Comlink from 'comlink'
import type { DocumentHandle, Progress } from '../../application/ports.js'
import type { Plan } from '../../domain/plan.js'
import { MupdfReader } from '../pdf/mupdf-reader.js'
import { MupdfRenderer } from '../pdf/mupdf-renderer.js'
import { MupdfWriter } from '../pdf/mupdf-writer.js'

const reader = new MupdfReader()
const writer = new MupdfWriter(reader)
const renderer = new MupdfRenderer(reader)

const api = {
  open: (bytes: Uint8Array) => reader.open(bytes),
  authenticate: (handle: DocumentHandle, password: string) => reader.authenticate(handle, password),
  close: (handle: DocumentHandle) => reader.close(handle),
  render: (handle: DocumentHandle, pageIndex: number, maxPx: number) => {
    const result = renderer.render(handle, pageIndex, maxPx)
    // The raster moves by ownership transfer, without a copy: the preview has many pages.
    return result.ok ? Comlink.transfer(result, [result.value.pixels.buffer]) : result
  },
  write: (handle: DocumentHandle, plan: Plan, onProgress: Progress) => {
    const result = writer.write(handle, plan, onProgress)
    return result.ok ? Comlink.transfer(result, [result.value.buffer]) : result
  },
}

export type EngineApi = typeof api

Comlink.expose(api)
// The engine starts up through a top-level await, and messages that arrive earlier can be
// lost. The client waits for this signal and only then starts calling.
self.postMessage('ready')
