import { createStore } from 'zustand/vanilla'
import type {
  DocumentHandle,
  EngineFailure,
  EnginePort,
  OpenedDocument,
} from '../application/ports.js'
import { DEFAULT_SETTINGS, resolve, type Settings } from '../application/settings.js'
import type { DocumentInfo } from '../domain/job.js'
import { Thumbnails } from './preview/thumbnails.js'

export type LoadedDocument = {
  readonly file: File
  readonly handle: DocumentHandle
  readonly info: DocumentInfo
  /** Kept to reopen the document after a cancel or a worker crash without asking again. */
  readonly password: string | null
  readonly thumbnails: Thumbnails
}

export type Notice = 'none' | 'notPdf' | 'unreadable' | 'crashed'

export type Screen =
  | { readonly kind: 'empty'; readonly notice: Notice }
  | { readonly kind: 'opening'; readonly name: string }
  | {
      readonly kind: 'locked'
      readonly file: File
      readonly handle: DocumentHandle
      readonly wrong: boolean
    }
  | { readonly kind: 'ready'; readonly doc: LoadedDocument }

export type Exporting =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly done: number; readonly total: number }
  | { readonly kind: 'failed' }

export type AppState = {
  readonly screen: Screen
  readonly settings: Settings
  /** Physical sheet, zero-based. */
  readonly sheet: number
  readonly back: boolean
  readonly exporting: Exporting
}

export const imposedName = (fileName: string): string =>
  `${fileName.replace(/\.pdf$/i, '')}-imposed.pdf`

const download = (bytes: Uint8Array<ArrayBuffer>, name: string) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Can't revoke right away: Safari starts the download only after click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const createAppStore = (engine: EnginePort) => {
  const store = createStore<AppState>()(() => ({
    screen: { kind: 'empty', notice: 'none' },
    settings: DEFAULT_SETTINGS,
    sheet: 0,
    back: false,
    exporting: { kind: 'idle' },
  }))
  const { getState: get, setState: set } = store

  /** Number of the latest open: an engine reply for a stale file is thrown away. */
  let opening = 0
  let exportToken = 0
  let recovering: Promise<void> | null = null

  const readyHandle = (): DocumentHandle | null => {
    const screen = get().screen
    return screen.kind === 'ready' ? screen.doc.handle : null
  }

  const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer())

  const letGo = (screen: Screen) => {
    if (screen.kind === 'ready') {
      screen.doc.thumbnails.dispose()
      void engine.close(screen.doc.handle)
    }
    if (screen.kind === 'locked') void engine.close(screen.handle)
  }

  const becomeReady = (file: File, opened: OpenedDocument, password: string | null) => {
    const thumbnails = new Thumbnails(engine, readyHandle, (failure) => recover(failure))
    set((state) => ({
      screen: { kind: 'ready', doc: { file, ...opened, password, thumbnails } },
      sheet: 0,
      back: false,
      exporting: { kind: 'idle' },
      // The file drew crop marks itself: marks turn on and are drawn with its numbers. A file
      // without marks leaves the checkbox alone: it stays as it was, like the other settings.
      settings:
        opened.info.cropMarks === null
          ? state.settings
          : { ...state.settings, marks: { ...state.settings.marks, crop: true } },
    }))
  }

  /**
   * The worker was recreated: the document is reopened from the same file; the thumbnails
   * stay, they come from the same file. A second call while the first is running waits for it.
   */
  const recover = (failure: EngineFailure): Promise<void> => {
    if (recovering !== null) return recovering
    recovering = (async () => {
      const screen = get().screen
      if (screen.kind !== 'ready') return
      const { doc } = screen
      let reopened = await engine.open(await bytesOf(doc.file))
      if (!reopened.ok && reopened.error.kind === 'PasswordRequired' && doc.password !== null) {
        reopened = await engine.authenticate(reopened.error.handle, doc.password)
      }
      if (get().screen !== screen) {
        if (reopened.ok) void engine.close(reopened.value.handle)
        return
      }
      if (!reopened.ok) {
        doc.thumbnails.dispose()
        set({
          screen: { kind: 'empty', notice: failure.kind === 'Crashed' ? 'crashed' : 'unreadable' },
        })
        return
      }
      set({ screen: { kind: 'ready', doc: { ...doc, handle: reopened.value.handle } } })
    })().finally(() => {
      recovering = null
    })
    return recovering
  }

  const actions = {
    async open(file: File) {
      opening += 1
      const mine = opening
      if (get().exporting.kind === 'running') engine.reset()
      letGo(get().screen)
      set({ screen: { kind: 'opening', name: file.name }, exporting: { kind: 'idle' } })
      const result = await engine.open(await bytesOf(file))
      if (mine !== opening) {
        if (result.ok) void engine.close(result.value.handle)
        else if (result.error.kind === 'PasswordRequired') void engine.close(result.error.handle)
        return
      }
      if (result.ok) {
        becomeReady(file, result.value, null)
        return
      }
      switch (result.error.kind) {
        case 'PasswordRequired':
        case 'WrongPassword':
          set({ screen: { kind: 'locked', file, handle: result.error.handle, wrong: false } })
          return
        case 'NotAPdf':
          set({ screen: { kind: 'empty', notice: 'notPdf' } })
          return
        case 'Crashed':
          set({ screen: { kind: 'empty', notice: 'crashed' } })
          return
        case 'Unreadable':
        case 'Aborted':
          set({ screen: { kind: 'empty', notice: 'unreadable' } })
      }
    },

    async unlock(password: string) {
      const screen = get().screen
      if (screen.kind !== 'locked') return
      const result = await engine.authenticate(screen.handle, password)
      if (get().screen !== screen) return
      if (result.ok) {
        becomeReady(screen.file, result.value, password)
        return
      }
      if (result.error.kind === 'WrongPassword') {
        set({ screen: { ...screen, wrong: true } })
        return
      }
      set({
        screen: {
          kind: 'empty',
          notice: result.error.kind === 'Crashed' ? 'crashed' : 'unreadable',
        },
      })
    },

    update(patch: Partial<Settings>) {
      set((state) => ({ settings: { ...state.settings, ...patch } }))
    },

    show(sheet: number, back: boolean) {
      set({ sheet, back })
    },

    async exportPdf() {
      const screen = get().screen
      if (screen.kind !== 'ready' || get().exporting.kind === 'running') return
      const built = resolve(get().settings, screen.doc.info).plan
      if (!built.ok) return
      exportToken += 1
      const mine = exportToken
      const running = () => mine === exportToken && get().exporting.kind === 'running'
      set({ exporting: { kind: 'running', done: 0, total: built.value.sheets.length } })
      const result = await engine.write(screen.doc.handle, built.value, (done, total) => {
        if (running()) set({ exporting: { kind: 'running', done, total } })
      })
      if (mine !== exportToken) return
      if (result.ok) {
        set({ exporting: { kind: 'idle' } })
        const { buffer, byteOffset, byteLength } = result.value
        // The buffer crossed the worker boundary by ownership transfer, no need to copy it.
        const bytes =
          buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer, byteOffset, byteLength)
            : new Uint8Array(result.value)
        download(bytes, imposedName(screen.doc.file.name))
        return
      }
      if (result.error.kind === 'Aborted') {
        set({ exporting: { kind: 'idle' } })
        return
      }
      set({ exporting: { kind: 'failed' } })
      if (result.error.kind === 'Crashed') void recover(result.error)
    },

    cancelExport() {
      if (get().exporting.kind !== 'running') return
      exportToken += 1
      set({ exporting: { kind: 'idle' } })
      engine.reset()
      void recover({ kind: 'Aborted' })
    },
  }

  return { store, actions }
}

export type AppStore = ReturnType<typeof createAppStore>
