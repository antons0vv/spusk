import { useState } from 'react'
import type { Notice, Screen } from './store.js'

const NOTICE: Record<Notice, string> = {
  none: 'click or drop a pdf here',
  notPdf: 'not a pdf, try another',
  unreadable: 'can’t read this file, try another',
  crashed: 'too heavy for this browser, try a smaller file',
}

const Centre = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center text-center">{children}</div>
)

export const DropScreen = ({
  screen,
  dragging,
  onPick,
  onUnlock,
}: {
  screen: Exclude<Screen, { kind: 'ready' }>
  dragging: boolean
  onPick: () => void
  onUnlock: (password: string) => void
}) => {
  const [password, setPassword] = useState('')

  if (screen.kind === 'opening') {
    return (
      <Centre>
        <span className="text-mute">opening {screen.name}</span>
      </Centre>
    )
  }

  if (screen.kind === 'locked') {
    return (
      <Centre>
        <span>{screen.wrong ? 'wrong password' : `${screen.file.name} is locked`}</span>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onUnlock(password)
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: пароль — единственное, что можно сделать на этом экране
            autoFocus
            type="password"
            aria-label="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            className="text-center placeholder:text-mute"
          />
        </form>
      </Centre>
    )
  }

  return (
    <Centre>
      <button type="button" onClick={onPick} className="flex flex-col items-center">
        <span>+</span>
        <span>{dragging ? 'drop it' : NOTICE[screen.notice]}</span>
      </button>
    </Centre>
  )
}
