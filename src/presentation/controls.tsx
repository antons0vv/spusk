import { type ReactNode, useState } from 'react'

/**
 * A mouse click doesn't take focus: otherwise the space bar, which flips to the back, would
 * press the last button touched. From the keyboard, focus reaches buttons as usual.
 */
const keepFocus = (e: React.MouseEvent) => {
  e.preventDefault()
  // But an unfinished number is let go, or the arrows would keep turning it instead of the sheets.
  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
}

const option = (active: boolean) =>
  active ? 'text-ink' : 'text-mute hover:text-ink transition-colors duration-100'

/** Text that behaves like a button. */
export const Act = ({
  children,
  onClick,
  active = true,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) => (
  <button
    type="button"
    onMouseDown={keepFocus}
    onClick={onClick}
    disabled={disabled}
    className={disabled ? 'cursor-default text-mute' : option(active)}
  >
    {children}
  </button>
)

/** One of several: the selected one black, the rest gray. */
export const Choice = <T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) => (
  <span className="inline-flex flex-wrap gap-x-[0.6em]">
    {options.map(([key, label]) => (
      <button
        key={String(key)}
        type="button"
        aria-pressed={key === value}
        onMouseDown={keepFocus}
        onClick={() => onChange(key)}
        className={option(key === value)}
      >
        {label}
      </button>
    ))}
  </span>
)

/** Any subset: the enabled ones black. */
export const Toggles = <K extends string>({
  value,
  options,
  onChange,
}: {
  value: Readonly<Record<K, boolean>>
  options: readonly (readonly [K, string])[]
  onChange: (key: K, on: boolean) => void
}) => (
  <span className="inline-flex flex-wrap gap-x-[0.6em]">
    {options.map(([key, label]) => (
      <button
        key={key}
        type="button"
        aria-pressed={value[key]}
        onMouseDown={keepFocus}
        onClick={() => onChange(key, !value[key])}
        className={option(value[key])}
      >
        {label}
      </button>
    ))}
  </span>
)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const shown = (value: number) => String(Math.round(value * 100) / 100)

/**
 * A number edited in place. A comma is accepted on a par with a dot, the up and down
 * arrows step, tenfold with shift. An unfinished value lives in the field; only a parsed
 * one goes into the job.
 */
export const Num = ({
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  integer = false,
  muted = false,
  lazy = false,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  integer?: boolean
  /** The value is computed, not set: gray until touched. */
  muted?: boolean
  /**
   * Apply only on Enter, on leaving the field and on arrows. For values whose intermediate
   * digits make no sense: a sheet "3" wide on the way to "300" would flash a failure.
   */
  lazy?: boolean
  label: string
}) => {
  // The draft lives only while the field has focus. Out of focus the value itself is shown, with
  // no copy: a copy that catches up with the value through an effect lags a frame behind and wipes
  // the selection, and a typed digit gets appended to the old number instead of replacing it.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? shown(value)

  const commit = (next: number) => {
    const rounded = integer ? Math.round(next) : next
    onChange(clamp(rounded, min, max))
  }

  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      onFocus={(e) => {
        setDraft(shown(value))
        e.currentTarget.select()
      }}
      onBlur={() => {
        const parsed = Number((draft ?? '').replace(',', '.'))
        if (lazy && draft !== null && draft.trim() !== '' && Number.isFinite(parsed)) commit(parsed)
        setDraft(null)
      }}
      onChange={(e) => {
        const text = e.currentTarget.value
        setDraft(text)
        const parsed = Number(text.replace(',', '.'))
        if (!lazy && text.trim() !== '' && Number.isFinite(parsed)) commit(parsed)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const delta = (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)
        const next = clamp(Math.round((value + delta) * 100) / 100, min, max)
        commit(next)
        setDraft(shown(next))
      }}
      // Width by character count: Safari doesn't know field-sizing yet and stretches the field.
      style={{ width: `${Math.max(1, text.length) + 0.2}ch` }}
      className={muted ? 'text-mute hover:text-ink focus:text-ink' : 'text-ink'}
    />
  )
}

/** A setting row: the label in gray on the left, the values on the right. */
export const Row = ({ label, children }: { label?: string; children: ReactNode }) => (
  <>
    <span className="text-mute">{label ?? ''}</span>
    <span>{children}</span>
  </>
)

export const Gap = () => <span className="col-span-2 h-[1lh]" />
