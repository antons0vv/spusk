# Known gaps in the core

This list was compiled after a review of the imposition core. None of it stops the core from
working, but each item should be closed in the right place rather than forgotten.

## The interface departs from section 8 of the spec

- No presets, millimeters are the only unit, no preview zoom.
- Mark length, offset and stroke weight are not configurable.
- There is no scale switch: pages go at actual size, and if they don't fit, they are scaled to
  fit and the interface shows the percentage. With the `auto` sheet, pages are fitted to the
  largest format. The margin defaults to `auto`: exactly enough for the bleed and enabled marks.
- Size alignment appears as a row only for a document with pages of different sizes.
- There are no crop marks in gaps, even with a wide gap. The analysis in
  `docs/crop-marks-research.md` suggests adding them later as an option.
- The export downloads to the browser's downloads folder instead of being saved next to the
  source: the browser can't reach there.

## Not verified

- Safari is not checked automatically: the WebKit build in the Playwright cache doesn't match
  the package version and hangs on launch. Checks run in Chrome; Safari is checked by hand.
  The memory threshold measurement from section 10 of the spec hasn't been done, and there is
  no file size warning before export.
- Step and repeat is capped at a thousand copies: a plan for tens of thousands of sheets is
  recomputed on every keystroke and doesn't fit in memory on export. A run larger than one
  sheet is printed as copies from the print dialog.
- The path for a worker crash from running out of memory is tested only via cancellation:
  `Crashed` and `Aborted` go through the same document reopening, but a real wasm failure in
  the browser has never been triggered.

## Minor interface debt

- Alice has old-style figures: a zero in an input field looks like a lowercase “o”.

## Minor debt

- A page size missing entirely from the source yields a fallback size that differs from
  what the engine substitutes. This only happens with broken files; there is no crash,
  but there is an offset.
- A broken reference in a page's content yields a blank page instead of a failure. That is
  the price of the requirement not to fail the whole export because of one blank page in a book.
- The trim size's width and height are checked for being finite, but its origin is not.

## What gets lost in imposition, and that's fine

Annotations, links, form fields, layers and accessibility tagging are not carried over into the
finished imposition. For imposition this is expected, but it's worth saying out loud so nobody
takes it for a bug. The transparency group is carried over: without it, the color shifts.
