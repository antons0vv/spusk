/** Offset of the marks from the window edge. */
const EDGE = 10
/** Length of a mark arm. */
const ARM = 16
/** Gap between the end of a mark and the trim line, as on real marks. */
const OFFSET = 8
/** The window's trim line: all screen content is measured from it as well. */
export const TRIM = EDGE + ARM + OFFSET
/** Thickness of every line in the interface; the same value is in styles.css. */
export const PEN = 1.5

const corners = [
  { x: 'left', y: 'top' },
  { x: 'right', y: 'top' },
  { x: 'left', y: 'bottom' },
  { x: 'right', y: 'bottom' },
] as const

/** The window is a sheet: crop marks in the corners, as on a printed sheet. */
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
 * Crop mark inside the window: the boundary between the columns is marked with strokes in the top
 * and bottom margins, like the trim line between two pages on a sheet.
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
