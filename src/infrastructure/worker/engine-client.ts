import * as Comlink from 'comlink'
import type {
  DocumentHandle,
  EngineFailure,
  EnginePort,
  Progress,
} from '../../application/ports.js'
import type { Plan } from '../../domain/plan.js'
import { err, type Result } from '../../domain/result.js'
import type { EngineApi } from './engine.worker.js'

type Live = { readonly worker: Worker; readonly api: Promise<Comlink.Remote<EngineApi>> }

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Holds the engine worker and survives its death. Every call still unanswered at the moment
 * of a cancel or crash gets a failure value rather than an endless wait: Comlink on its own
 * never learns that the worker is gone.
 */
export const createWorkerEngine = (spawn: () => Worker): EnginePort => {
  let live: Live | null = null
  const pending = new Set<(failure: EngineFailure) => void>()

  const failAll = (failure: EngineFailure) => {
    for (const fail of [...pending]) fail(failure)
    pending.clear()
  }

  const stop = (failure: EngineFailure) => {
    live?.worker.terminate()
    live = null
    failAll(failure)
  }

  const start = (): Live => {
    const worker = spawn()
    const api = new Promise<Comlink.Remote<EngineApi>>((resolve) => {
      const onReady = (event: MessageEvent) => {
        if (event.data !== 'ready') return
        worker.removeEventListener('message', onReady)
        resolve(Comlink.wrap<EngineApi>(worker))
      }
      worker.addEventListener('message', onReady)
    })
    worker.addEventListener('error', (event) => {
      if (live?.worker === worker) stop({ kind: 'Crashed', message: event.message })
    })
    return { worker, api }
  }

  const call = <T, E>(
    run: (api: Comlink.Remote<EngineApi>) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | EngineFailure>> => {
    if (live === null) live = start()
    const { api } = live
    return new Promise((resolve) => {
      const fail = (failure: EngineFailure) => resolve(err(failure))
      pending.add(fail)
      api
        .then(run)
        .then(resolve, (cause: unknown) => {
          // An exception from the worker means a broken invariant in an adapter or wasm
          // running out of memory. The engine state after that is not guaranteed.
          stop({ kind: 'Crashed', message: describe(cause) })
          resolve(err({ kind: 'Crashed', message: describe(cause) }))
        })
        .finally(() => pending.delete(fail))
    })
  }

  return {
    open: (bytes) => call((api) => api.open(Comlink.transfer(bytes, [bytes.buffer]))),
    authenticate: (handle, password) => call((api) => api.authenticate(handle, password)),
    close: async (handle: DocumentHandle) => {
      if (live === null) return
      await call(async (api) => {
        await api.close(handle)
        return { ok: true, value: undefined }
      })
    },
    render: (handle, pageIndex, maxPx) => call((api) => api.render(handle, pageIndex, maxPx)),
    write: (handle, plan: Plan, onProgress: Progress) =>
      call((api) => api.write(handle, plan, Comlink.proxy(onProgress))),
    reset: () => stop({ kind: 'Aborted' }),
  }
}
