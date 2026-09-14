import { type ReactNode, useState } from 'react'

/**
 * Щелчок мышью не забирает фокус: иначе пробел, которым листают оборот, нажимал бы
 * последнюю тронутую кнопку. С клавиатуры фокус на кнопки попадает как обычно.
 */
const keepFocus = (e: React.MouseEvent) => {
  e.preventDefault()
  // Но недописанное число отпускаем, иначе стрелки продолжили бы крутить его, а не листы.
  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
}

const option = (active: boolean) =>
  active ? 'text-ink' : 'text-mute hover:text-ink transition-colors duration-100'

/** Текст, который ведёт себя как кнопка. */
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

/** Одно из нескольких: выбранное чёрное, остальные серые. */
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

/** Любое подмножество: включённые чёрные. */
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
 * Число, которое правится на месте. Запятая принимается наравне с точкой,
 * стрелки вверх и вниз шагают, с шифтом — вдесятеро. Недописанное значение
 * живёт в поле, в задание уходит только разобранное.
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
  /** Значение посчитано, а не задано: серое, пока его не тронули. */
  muted?: boolean
  /**
   * Применять только по Enter, уходу из поля и стрелкам. Для величин, у которых
   * промежуточные цифры бессмысленны: лист шириной «3» по дороге к «300» мигнул бы отказом.
   */
  lazy?: boolean
  label: string
}) => {
  // Черновик живёт только пока поле в фокусе. Вне фокуса показывается само значение, без
  // копии: копия, догоняющая значение эффектом, на кадр отстаёт и затирает выделение, и
  // набранная цифра дописывается к старому числу вместо замены.
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
      // Ширина по числу знаков: field-sizing Safari пока не понимает и растягивает поле.
      style={{ width: `${Math.max(1, text.length) + 0.2}ch` }}
      className={muted ? 'text-mute hover:text-ink focus:text-ink' : 'text-ink'}
    />
  )
}

/** Строка параметра: подпись серым слева, значения справа. */
export const Row = ({ label, children }: { label?: string; children: ReactNode }) => (
  <>
    <span className="text-mute">{label ?? ''}</span>
    <span>{children}</span>
  </>
)

export const Gap = () => <span className="col-span-2 h-[1lh]" />
