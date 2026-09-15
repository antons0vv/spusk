/** Отступ меток от края окна. */
const EDGE = 10
/** Длина плеча метки. */
const ARM = 16
/** Зазор между концом метки и линией реза, как у настоящих меток. */
const OFFSET = 8
/** Линия реза окна: от неё же отсчитывается всё содержимое экрана. */
export const TRIM = EDGE + ARM + OFFSET
/** Толщина всех линий интерфейса; та же величина в styles.css. */
export const PEN = 1.5

const corners = [
  { x: 'left', y: 'top' },
  { x: 'right', y: 'top' },
  { x: 'left', y: 'bottom' },
  { x: 'right', y: 'bottom' },
] as const

/** Окно — это лист: в углах метки реза, как на оттиске. */
export const CropMarks = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0">
    {corners.map(({ x, y }) => (
      <div key={`${x}-${y}`}>
        <span
          className="absolute bg-ink"
          style={{ [x]: EDGE, [y]: TRIM - PEN / 2, width: ARM, height: PEN }}
        />
        <span
          className="absolute bg-ink"
          style={{ [x]: TRIM - PEN / 2, [y]: EDGE, width: PEN, height: ARM }}
        />
      </div>
    ))}
  </div>
)

/**
 * Метка реза внутри окна: граница колонок отмечается штрихами в верхнем и нижнем поле,
 * как линия реза между двумя полосами на листе.
 */
export const CutMarks = ({ x }: { x: number }) => (
  <div aria-hidden className="pointer-events-none fixed inset-0">
    {(['top', 'bottom'] as const).map((y) => (
      <span
        key={y}
        className="absolute bg-ink"
        style={{ left: x - PEN / 2, [y]: EDGE, width: PEN, height: ARM }}
      />
    ))}
  </div>
)
