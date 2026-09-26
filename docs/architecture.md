# spusk

A browser-based imposition tool. Everything is computed on the client; files never leave it.

## Commands

- `bun run dev` — interface on a local server (Vite)
- `bun run build` — static build into `dist/`
- `bun run test` — tests (Vitest)
- `bun run e2e` — end-to-end checks in the browser; requires Google Chrome to be installed
- `bun run typecheck` — type check
- `bun run check` — lint and format (Biome)
- `bun run deploy` — build and deploy to tools.volnenko.com: a Cloudflare Worker serves `dist/`
  as static files, there is no server. Settings in `wrangler.jsonc`, caching of hashed files in `public/_headers`

## Architecture

- `src/domain/` — pure layout logic. No dependencies on PDF, the DOM or workers.
- `src/application/` — use cases and ports.
- `src/infrastructure/` — mupdf adapters and the engine worker.
- `src/presentation/` — React: file drop screen, work screen, sheet preview.
- `src/composition-root.tsx` — entry point: builds the engine in the worker and hands it to the interface.
- `test/fixtures/` — test PDF generator and read-back of the result. The generator can produce
  bleed and BleedBox, a shifted origin, rotation, a CropBox smaller than the MediaBox, content in
  two streams, a page with no content and a transparency group.

Import rule: `domain` imports nothing from the project, `application` only `domain`,
`infrastructure` — `domain` and `application`, `presentation` — `domain` and `application`, but
never `infrastructure`. They meet only in `composition-root.tsx`.

### Domain

`plan(job, doc)` is the single entry point into layout. It returns a `Plan`, which both the
preview and the PDF writer consume. Inside: `buildGrid` → `*Order` → `assemble` → `applyCreep` → `resolveMarks`.

### Reader

`MupdfReader` gives the domain a description of the document and a handle. The handle is tagged
with the reader's origin: a handle from one reader opens nothing in another. A protected document
also stays open — the `PasswordRequired` failure carries the handle, which is then passed to
`authenticate`; a wrong password is a separate failure, `WrongPassword`.

The reader looks for crop marks drawn by the file itself in the strokes of the first page: a mupdf
device collects line segments in box space, and the parsing (`crop-marks.ts`) is pure and does not
depend on mupdf. Broken content does not prevent opening the document; such a page is simply
treated as having no marks.

### Writer

`MupdfWriter` executes the `Plan`. Each source page is turned into a form XObject once and cached;
resources and the transparency group are carried over through a shared `PDFGraftMap`, otherwise
fonts and images get duplicated on every sheet, and blending is computed against a foreign backdrop.

### Normalized page

The reader and the writer must compute from the same box — `CropBox` intersected with `MediaBox`
(the engine builds the page transform from exactly this box; if the intersection is empty, it
substitutes Letter). The same box sets the form's bounding box and also hides content outside the
CropBox. The engine returns boxes in its own space — origin in the top left corner, Y axis pointing
down — so the reader flips the axis at the adapter boundary: the domain and the writer compute the
sheet in PDF space.

### Engine worker

All three adapters live in one Web Worker and are visible to the interface through `EnginePort`.
The client (`engine-client.ts`) survives the death of the worker: cancelling an export and a wasm
crash end all pending calls with an `Aborted` or `Crashed` value rather than an endless wait. After
that the interface reopens the document from the same file and remembers the password itself. The
handle is tagged with a random origin, so a new worker won't accept a handle from the old one.

The worker sends `ready` once the engine is up: mupdf loads with a top-level await, and messages
that arrive earlier are lost. In `vite.config.ts` mupdf is excluded from dependency pre-bundling,
otherwise the path to the wasm is lost.

### Preview

The preview draws the sheet from page rasters using the same placement matrix and the same bleed
clip as the writer. Rasters are fetched in steps of 256–2048 px, only for the visible sheet, one at
a time, and evicted oldest first. Raster edges are snapped to screen pixels, otherwise a seam shows
between neighboring pages.

### Interface

One typeface (Alice, stored in `src/presentation/fonts/` together with its OFL license) and one
type size. Hierarchy is carried by position, spacing and color: what is selected is black,
everything else is gray. The window is a sheet with crop marks in the corners. All screens sit in
one shell (`shell.tsx`): a fixed-width sidebar on the left, the workspace on the right, the
boundary between them marked with a crop mark. On the empty screen the sidebar holds “about”; on
the work screen it holds the file, the parameters, and actions at the bottom of the sidebar;
“about” replaces the parameters, the preview stays. Interface text is English and lowercase. The
tab icon (`public/favicon.svg`) is a single crop mark on a white sheet; the ico and the iOS icon
are rasterized from it; the image for link previews is the empty screen scaled up 2.2 times. Mark
geometry is not exposed in the interface; the values are hard-coded in `application/settings.ts`.

## Conventions

- The internal unit of length is the point (`Pt`). Millimeters only at the interface boundary.
- The cell grid is row-major; row zero is the top of the sheet. Mark geometry is taken from cell
  coordinates, not from fractions of the sheet: fractions match the cells only with two columns.
- A parameter failure carries a `what` tag (grid, copies, signature, sheet, margins, document,
  pages). The failure string is for reports and tests; the interface makes decisions by the tag.
- Expected failures are returned through `Result`. `throw` is only for an invariant violation in an adapter.
- The only allowed type cast is the `pt()` constructor in `src/domain/units.ts`. The linter doesn't check this; the rule is upheld by review.

## Measurements

The row below is filled in with the numbers printed by the measurement command from task 14.

| File | Sheets | Time | Peak RSS |
|---|---|---|---|
| vo-da.pdf, 88 MB, 32 pages | 16 | 75 ms | 748 MB |

The file size warning threshold in the interface is chosen from these numbers and refined in the
browser separately for Chrome and Safari.

## What's ready

The whole imposition core: the domain (`plan`), the reader, writer and raster adapters, the engine
worker and the interface: file drop, password, four schemes with parameters, `auto` sheet
selection, sheet preview, export with progress and cancel.

## Spec

`docs/design.md`

## License

AGPL-3.0-or-later, inherited from mupdf.
