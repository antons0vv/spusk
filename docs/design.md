# Imposition in the browser: core (v1)

Date: 2026-09-10
Status: agreed, ready for an implementation plan

## 1. Concept

A browser-based imposition tool that runs entirely on the client. The file never leaves the
user's machine: no upload to a server, no telemetry, no analytics on top of user data.
Static hosting, open source.

The tool covers the core of imposition: four layout schemes plus marks, bleeds and creep
compensation. This is a subset of Quite Imposing Plus, chosen deliberately: imposition proper
versus the prepress extras around it. The extras are deferred to later phases
(section 13).

### Why build this at all

There is no free imposition tool with a user interface on macOS. Quite Imposing Plus costs
949 USD and requires Acrobat Pro on top. Existing browser services cannot handle files of
tens of megabytes. Command-line utilities (`paperjam`, `pdfcpu`) cover the geometry fully and
for free, but have no preview and require manual calculation for creep and
cut-and-stack.

### Invariants

1. **The plan is data.** The layout is computed by a pure function as a data structure.
   The preview and the PDF writer consume the same plan. A mismatch between screen and file
   is impossible by construction.
2. **The document never leaves the worker.** Only the document description and raster
   thumbnails reach the main thread.
3. **The domain knows nothing about PDF.** The `domain/` layer imports neither the engine
   nor the DOM.
4. **An error is a value.** Failures are returned through `Result`, not thrown.

## 2. Use cases

| Use case | Scheme | What the user gets |
|---|---|---|
| Zine or saddle-stitch booklet | `booklet`, folio = all pages | Sheets in stitching order, shifted for creep |
| Perfect-bound or sewn book | `booklet`, folio = 8/16/32 | Separate signatures |
| Business cards, stickers, flyers | `stepRepeat` | Grid of copies with bleeds and crop marks |
| Numbered tickets, coupons | `cutStack` | Order for cutting as a stack |
| Economical printing of a document | `nup` | Several pages per sheet, order preserved |

## 3. Architecture

```
src/
  domain/          units, geometry, page boxes, schemes, planners,
                   mark specification, domain errors, Result.
                   No dependencies at all.
  application/     use cases and ports. Orchestration, no layout arithmetic.
  infrastructure/  mupdf adapter in the worker, file access, preset storage.
  presentation/    React, preview canvas, parameter sidebar. No logic.
```

Import rule: `domain` imports nothing; `application` imports only `domain`;
`infrastructure` imports `domain` and `application`; `presentation` imports `application`
and `domain`, but never `infrastructure` directly. Dependencies are wired in a single
composition root, `src/composition-root.ts`. There is no DI container: there are four
dependencies, and a container would be ceremony for ceremony's sake.

### Ports

```ts
interface DocumentReaderPort {
  open(file: Blob, signal: AbortSignal): Promise<Result<OpenedDocument, OpenError>>
  authenticate(doc: DocumentRef, password: string): Promise<Result<OpenedDocument, OpenError>>
  close(doc: DocumentRef): Promise<void>
}

interface PreviewRendererPort {
  thumbnail(doc: DocumentRef, page: PageIndex, maxPx: number, signal: AbortSignal):
    Promise<Result<ImageBitmap, RenderError>>
}

interface ImposedWriterPort {
  write(doc: DocumentRef, plan: Plan, signal: AbortSignal, onProgress: (done: number, total: number) => void):
    Promise<Result<Blob, WriteError>>
}

interface FileSinkPort {
  save(blob: Blob, suggestedName: string): Promise<Result<void, SaveError>>
}
```

The first three are implemented by one adapter over mupdf that lives in a Web Worker and is
reached through Comlink. Engine types (`any` in its `.d.ts`) do not leak out: the adapter
returns only the project's own types.

### Data flow

```
File
 └─> worker: mupdf.open ──> OpenedDocument { pages, sizes, boxes }   (main thread)
                              │
     UI parameters ───────────┼──> domain.plan(job, doc) ──> Plan   (microseconds)
                              │                               │
     worker: thumbnails ──────┴───────────────────────────────┼──> preview canvas
                                                              │
     "export" button ─────────────────────────────────────────┴──> worker: writer ──> Blob
```

Recomputing the plan does not touch the engine. Dragging any slider costs one canvas
redraw.

## 4. Domain model

```ts
type Pt = number & { readonly __brand: 'Pt' }
type PageIndex = number & { readonly __brand: 'PageIndex' }   // 0-based

type Rect = { x: Pt; y: Pt; w: Pt; h: Pt }
type Size = { w: Pt; h: Pt }
type Matrix = readonly [number, number, number, number, Pt, Pt]  // a b c d e f

type PageBoxes = { media: Rect; crop: Rect; trim: Rect | null; bleed: Rect | null }

type DocumentInfo = {
  pageCount: number
  pages: readonly { size: Size; boxes: PageBoxes }[]
  uniformSize: Size | null      // null if the pages differ in size
}

type Scheme =
  | { kind: 'booklet'; folio: number | 'all'; binding: 'left' | 'right' | 'top'
      creepPerSheet: Pt }
  | { kind: 'nup'; rows: number; cols: number; fill: 'rows' | 'cols' }
  | { kind: 'stepRepeat'; rows: number; cols: number; copies: number }
  | { kind: 'cutStack'; rows: number; cols: number }   // number of stacks = rows × cols

type SheetSpec = {
  size: Size
  orientation: 'portrait' | 'landscape'
  margin: Pt
  gap: Pt
}

type SourceSpec = {
  bleed: Pt                       // declared bleed of the source
  scaling: 'actual' | 'fit'       // 100% or fit into the cell
  normalizeSizes: boolean         // normalize differing pages to the largest one
}

type MarkSpec =
  | { kind: 'crop'; length: Pt; offset: Pt; pen: Pt }
  | { kind: 'fold'; length: Pt; pen: Pt }
  | { kind: 'registration'; radius: Pt; pen: Pt }

type Job = { scheme: Scheme; sheet: SheetSpec; source: SourceSpec; marks: readonly MarkSpec[] }

type Placement = {
  source: { kind: 'page'; index: PageIndex } | { kind: 'blank' }
  matrix: Matrix        // how the source page lands on the sheet
  trim: Rect            // trim line on the sheet; marks are built from it
  clip: Rect            // trim expanded by the effective bleed
}

type Sheet = {
  placements: readonly Placement[]
  side: 'front' | 'back' | 'single'
  marks: readonly ResolvedMark[]   // already in this sheet's coordinates
}

type Plan = {
  sheetSize: Size
  sheets: readonly Sheet[]
  padding: number                  // how many blank pages were added
  warnings: readonly PlanWarning[]
}

plan(job: Job, doc: DocumentInfo): Result<Plan, PlanError>
```

The internal unit is always the point. By default the interface shows millimeters; the
switch to points and inches converts only at the presentation boundary.

## 5. Layout algorithms

All page indices are zero-based. `n` is the number of pages after padding with blanks.

### 5.1 Saddle-stitch booklet

`n` is rounded up to a multiple of four; the added pages are blank and go to the end of the
document. For side `i` in the range `[0, n/2)`:

```
i even → (left, right) = (n − 1 − i, i)
i odd  → (left, right) = (i, n − 1 − i)
```

Checked on 16 pages: `16|1`, `2|15`, `14|3`, `4|13`, `12|5`, `6|11`, `10|7`, `8|9`.

### 5.2 Signatures

With `folio = f` (a multiple of four) the document is cut into chunks of `f` pages; rule 5.1
is applied to each chunk with local indices, and the result is offset to the start of the
chunk. The last chunk is padded with blanks up to `f`.

### 5.3 Creep

For side `i` within a signature, the sheet number is `s = floor(i_local / 2)`, where `s = 0`
is the outer sheet. The shift is `d = creepPerSheet × s`. The left page of the spread shifts
by `+d` horizontally, the right one by `−d`, i.e. both toward the spine. The outer sheet does
not shift.

With `binding = 'right'` the order of spreads is mirrored; the shift still goes toward the
spine. With `binding = 'top'` the shift is vertical: the top page of the spread moves down,
the bottom one up.

A shifted page is clipped at the fold line: content pushed past the spine would otherwise
print on the neighboring page of the spread.

### 5.4 N-up

`cells = rows × cols`. Page `k` goes to sheet `floor(k / cells)`, into cell
`c = k mod cells`. The cell maps onto the grid like this:

```
fill = 'rows' → row = floor(c / cols), col = c mod cols
fill = 'cols' → col = floor(c / rows), row = c mod rows
```

Row zero is the top of the sheet.

### 5.5 Step and repeat

`cells = rows × cols`. Each source page is laid out over `ceil(copies / cells)` sheets; all
cells hold copies of the same page. The last sheet of a run may be partly filled; the
missing cells stay empty.

### 5.6 Cut and stack

The number of stacks equals the number of cells: `stacks = rows × cols`. Let
`per = ceil(n / stacks)`. Sheet `s` in the range `[0, per)` gets, in cell `j`, the page with
index `j × per + s`; if the index is past `n`, the cell is empty. Cells are filled row by
row.

Checked on 16 pages and four stacks: sheet 1 carries `1, 5, 9, 13`, sheet 2 carries
`2, 6, 10, 14`. After cutting, each stack is in consecutive order.

### 5.7 Page slot on the sheet

The grid divides the usable area of the sheet into equal cells, but pages are not centered
in their cells. A page's slot is the largest page of the document at that page's scale; the
slots stand together as one block exactly the given gap apart, and the block is centered on
the sheet. Spare sheet space goes to the margins, not into spaces between pages: a booklet
spread closes up at the spine, neighboring n-up pages share one trim line.

A page smaller than its slot sits at the slot's center. In booklets and signatures it is
pushed against the spine and centered across it; otherwise, after folding, it would not reach
the binding.

### 5.8 Duplex

Sheets are emitted in sequence in the order `front, back, front, back`. For the `nup`,
`stepRepeat` and `cutStack` schemes a back is generated only if the source document is
two-sided by the nature of the job; in v1 these three schemes are one-sided, `side = 'single'`.
Booklets and signatures are always two-sided.

The interface hints which flip to choose in the print dialog: on the long edge for a
landscape sheet, on the short edge for a portrait one.

## 6. Marks and bleeds

The effective bleed is computed **separately for each edge of the page**. On an edge that
borders another cell, the limit is half the gap; on an edge facing the sheet edge, the limit
is the sheet margin. Result: `bleed_edge = min(source.bleed, edge limit)`.
Content is clipped to `trim` expanded by these four values.

This matters for the booklet: with zero gap, the bleed at the spine is zero, while on the
outer edges of the spread it is kept in full. This is the correct behavior: the pages touch
at the spine and no bleed is needed there.

If a page has a `TrimBox`, the trim size is taken from it, and `source.bleed` is used only as
a limit. If there is no `TrimBox`, the `CropBox` counts as the trim size, and the bleed comes
from the field in the interface.

By default the interface takes the bleed from the file: the smallest distance from `TrimBox`
to `BleedBox` over all edges of all pages, clipped by the edge of the page itself. A page
without a `BleedBox` zeroes the document's bleed: in such files the space beyond the trim
line is often taken up by marks and margins, and it must not be printed as bleed. A number
entered by hand is not overridden by the file.

Crop marks are placed along trim lines, not around pages. The lines come from the edges of
occupied cells; lines that coincide at zero gap merge into one, and an empty cell gives no
lines. Each line gets a stroke in the sheet margin at both ends: `offset` outward from the edge
of the page block, `length` long, with stroke weight `pen`. There are no marks inside the
block. A stroke is clipped by the sheet edge, and if there is not room even for the offset
before the edge, it is not drawn. The interface keeps the offset no smaller than the bleed so
that a mark does not land on the bleed. An analysis of how imposition software does this is
in `docs/crop-marks-research.md`.

If the file has drawn crop marks around the first page itself, the reader finds them and
returns the numbers: offset from the trim line, length, stroke weight and white underlay.
Marks are straight strokes on the extension of the trim lines, lying entirely outside the
`TrimBox`, two at each of the four corners, with the same offset and length. A thicker stroke
in the same place is the underlay: this is how InDesign lays out marks (offset 2.12 mm,
length 5.29 mm, stroke weight 0.25 pt, underlay 1.25 pt). When such a file is opened, crop
marks turn on by themselves and are drawn with the file's numbers; the `auto` margin makes
room for the offset and length. An offset smaller than the bleed is kept here: the underlay
separates the mark from the bleed background, and it is drawn in white under all strokes on
the sheet. A file without marks leaves the checkbox alone.

In booklets and signatures the spine is folded, not cut: page edges facing the spine give no
trim lines. Fold marks are drawn as a dashed line on the fold line in the sheet margins, and
only in these schemes; in n-up, step and repeat and cut and stack the cell boundaries are
cut. Registration marks are placed at the middle of each sheet edge, and only if the sheet
margin is at least eight millimeters.

In v1 the mark color is pure black. Composite registration color moves to phase 2 together
with PDF/X.

## 7. Engine

`mupdf` (npm, WASM, AGPL-3.0-or-later), a single dependency for parsing, preview rendering
and writing. It runs in a Web Worker; communication goes through Comlink.

Imposition works by grafting the source page into a form XObject. The recipe was verified on
a real file before the spec was written:

1. Take the source page object and read its `Contents` (if it is an array of streams, join
   them with a newline).
2. Graft `Resources` into the target document via `graftObject`, always with a shared
   `PDFGraftMap` for the whole export. Without the graft map, shared fonts and images are
   duplicated on every sheet and the file bloats.
3. Build a `/Type /XObject /Subtype /Form` dictionary with `BBox` at the page bounds and the
   grafted `Resources`, and write the stream via `addStream`.
4. Create the sheet via `addPage(mediabox, 0, resources, contents)`, where the content stream
   is a sequence of `q <matrix> cm /Xn Do Q`, one per placement.
5. Marks are appended to the same sheet content stream with ordinary line operators.
6. Sheet boxes are set via `setPageBox`.

## 8. Interface

Two screens, zero modal windows.

**Empty screen.** The whole window is a drop zone. One line of text and a file picker
button.

**Work screen.** At the top: file name, page count and page size; on the right, presets and
the export button. The center holds a preview of one whole sheet. Below the preview is
navigation: arrows, sheet number, a “front” or “back” label; the side also toggles with the
space bar. The side label shows only for booklets and signatures; the other schemes are
one-sided in v1.
Zoom sits at the bottom left. On the right is the parameter column, four groups, always
expanded, in the order decisions are made:

| Group | Controls |
|---|---|
| Scheme | a choice of four, plus the chosen scheme's parameters: signature, binding side, creep; or rows and columns; or copies; or the stack grid |
| Sheet | format, orientation, margins, gap |
| Pages | bleed, scale, normalizing different sizes |
| Marks | crop mark type, length, offset, fold, registration |

Sixteen controls in total. Presets can only be saved and applied; there is no preset
manager. Export has no settings dialog: the file is saved next to the source with the suffix
`-imposed`.

## 9. Errors

All errors are values. The domain declares a discriminated union, and each variant has a
recovery action in the interface.

| Failure or warning | Cause | What the interface offers |
|---|---|---|
| `NotAPdf` | broken or foreign header | pick another file |
| `PasswordRequired` | password-protected document | a password input field |
| `WrongPassword` | the password did not match | the same field with an error message |
| `MixedPageSizes` | pages differ in size | normalize to the largest |
| `NoTrimBox` | nothing to determine the bleed from | highlight the bleed field |
| `PaddedToFolio` | page count is not a multiple of four | a message saying how many were added |
| `DoesNotFit` | pages do not fit at 100% scale | another sheet format or “fit” mode |
| `Aborted` | canceled by the user | return to the parameters |
| `OutOfMemory` | the worker could not handle the file | recreate the worker, suggest a smaller file |

`MixedPageSizes`, `NoTrimBox` and `PaddedToFolio` are plan warnings, not failures: the plan is
still built, but the interface shows them before export.

Every operation in the worker takes an `AbortSignal`. Cancellation and running out of memory
lead to recreating the worker; the interface state is preserved.

## 10. Performance and memory

A measurement taken before the spec was written, on an 88 MB file of 32 pages:

| Engine | Time | Peak memory |
|---|---|---|
| mupdf (WASM) | 0.25 s | 688 MB |
| pdf-lib (JS) | 0.23 s | 275 MB |

Rules that follow from the measurement:

- The document lives only in the worker. The description and thumbnails travel to the main
  thread.
- Thumbnails are rendered with a cap on the long side, stored as `ImageBitmap`, evicted by
  LRU. The sheet preview is drawn from thumbnails; the engine is not touched.
- Export uses a shared `PDFGraftMap`.
- Peak memory during export equals the input document plus the output buffer:
  `saveToBuffer` returns the whole buffer, and the engine offers no streaming write.
- The file-size warning threshold is determined by measuring on Chrome and Safari
  separately and is recorded in `docs/architecture.md`. Safari has a stricter WASM heap limit.

## 11. Tests

**Domain, full coverage.** Planners are checked against golden sets: a 16-page booklet must
give `16|1`, `2|15`, `14|3`, `4|13`, `12|5`, `6|11`, `10|7`, `8|9`; cut-and-stack on four
stacks must give `1, 5, 9, 13` on the first sheet.

**Property invariants.** Every source page appears in the plan exactly once. The number of
placements equals the number of sheets times the number of cells. Every cut-and-stack stack,
after cutting, gives a continuous increasing sequence. The creep shift grows monotonically
from the outer sheet to the inner one.

**Integration by read-back.** The writer executes the plan on a fixture, the result is
read back by the engine, and the test asserts the physical coordinates of every page and of
the marks. Fixtures are generated in code: a document of `N` numbered pages of a given size.

**Playwright end-to-end tests.** Drop a file, change the scheme, export, check that the file
is saved and contains the expected number of sheets.

**Edge cases.** Zero file size, corrupted header, encrypted document, pages of different
sizes, cancellation mid-export.

Everything runs with one command, without network access.

## 12. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime and packages | bun | installed, faster, also covers the test runner |
| Build | Vite 6 | native ESM, fast HMR |
| Language | TypeScript 5, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `isolatedModules` | required by a.md |
| UI | React 19 plus Radix headless primitives | accessibility out of the box |
| Styles | Tailwind v4 | zero runtime |
| Client state | Zustand, in slices | job parameters, file state, UI flags |
| Validation of external data | zod | presets and worker messages |
| Lint and format | Biome, zero tolerance for warnings | required by a.md |
| Tests | Vitest and Playwright | required by a.md |
| Worker | Comlink | typed bridge |
| PDF engine | mupdf | section 7 |

`any`, `as` casts and compiler suppressions are forbidden. External data is narrowed from
`unknown` through zod or user-defined type guards.

The project license is AGPL-3.0-or-later, inherited from mupdf. For open source code with
public hosting this is not a restriction, but it is recorded deliberately: closing the source
later without changing the engine will not be possible.

## 13. v1 boundaries

Not included; deferred to later phases:

**Phase 2, prepress extras.** Page numbering and Bates, text and page stamps, redaction of
areas, inserting blank pages and pages from other documents, reordering, color control strips,
composite registration color, PDF/X.

**Phase 3, automation.** Variable data, recorded scripts, manual imposition with the mouse,
imposition report, batch processing of a folder.

Also outside v1: images as input, assembling from several files, Dutch cut imposition,
preview in spreads, preset manager.

## 14. Risks

1. **Memory in Safari.** The most likely source of failure on large files. Mitigation:
   measure the threshold early, warn honestly before export starts, cancel without a crash.
2. **Duplicate resources when grafting.** A forgotten graft map bloats the output file
   several times over. Mitigation: a test on output file size relative to input.
3. **Documents with mixed page sizes.** Silently laying out such a document gives a visually
   broken result. Mitigation: a plan warning and a normalizing mode.
4. **AGPL.** The decision is irreversible within the chosen engine. Recorded in section 12.
