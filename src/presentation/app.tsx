import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { About } from './about.js'
import { CropMarks } from './crop-marks.js'
import { DropScreen } from './drop-screen.js'
import { Shell } from './shell.js'
import type { AppStore } from './store.js'
import { WorkScreen } from './work-screen.js'

const isFileDrag = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

/** Всё окно принимает файл на любом экране: второй PDF заменяет первый. */
const useFileDrop = (onFile: (file: File) => void) => {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    // dragenter и dragleave приходят парами на каждый вложенный элемент.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      depth += 1
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file !== undefined) onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])
  return dragging
}

const aboutInUrl = () => window.location.hash === '#about'

/**
 * Страница «о проекте» открывается по #about, чтобы на неё можно было дать ссылку.
 * Кнопка «назад» в браузере её закрывает: pushState не шлёт hashchange, отсюда popstate.
 */
const useAbout = (): [boolean, (open: boolean) => void] => {
  const [open, setOpen] = useState(aboutInUrl)
  useEffect(() => {
    const sync = () => setOpen(aboutInUrl())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])
  const set = useCallback((next: boolean) => {
    // Без решётки в адресе: иначе закрытая страница оставляла бы «#» в строке браузера.
    const url = next ? '#about' : window.location.pathname + window.location.search
    window.history.pushState(null, '', url)
    setOpen(next)
  }, [])
  return [open, set]
}

export const App = ({ app }: { app: AppStore }) => {
  const state = useStore(app.store)
  const { actions } = app
  const picker = useRef<HTMLInputElement>(null)
  const [about, setAbout] = useAbout()
  const openFile = useCallback(
    (file: File) => {
      setAbout(false)
      void actions.open(file)
    },
    [actions, setAbout],
  )
  const dragging = useFileDrop(openFile)
  const pick = () => picker.current?.click()

  return (
    <>
      <CropMarks />
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file !== undefined) openFile(file)
        }}
      />
      {state.screen.kind === 'ready' ? (
        <WorkScreen
          state={state}
          doc={state.screen.doc}
          update={actions.update}
          show={actions.show}
          onExport={() => void actions.exportPdf()}
          onCancel={actions.cancelExport}
          about={about}
          onAbout={setAbout}
          dragging={dragging}
        />
      ) : (
        // На пустом экране «о проекте» стоит в колонке всегда: делать тут больше нечего.
        <Shell sidebar={<About />}>
          <DropScreen
            screen={state.screen}
            dragging={dragging}
            onPick={pick}
            onUnlock={(password) => void actions.unlock(password)}
          />
        </Shell>
      )}
    </>
  )
}
