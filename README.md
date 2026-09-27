# spusk

A browser-based imposition tool. Everything is computed on the client: the file never goes to a server, and there is no telemetry or analytics on top of user data.

Live at https://tools.volnenko.com.

## Why

Preparing zine and book files for print is often a headache due to the lack of free, user-friendly imposition software. Quite Imposing Plus costs around $1,000 alongside an Acrobat Pro subscription. Free command-line options like ⁠paperjam⁠ and ⁠pdfcpu⁠ handle geometry well, but offer no visual preview and require manual setup for creep and cut-and-stack.

## What's ready

The imposition core and an interface for it: drop a PDF into the window, pick a scheme, look through the sheets, download the finished imposition.

- Four schemes: saddle-stitch booklet with signatures and creep, n-up, step and repeat, cut and stack.
- Margins, gaps and bleed. Effective bleed is computed for each edge of a page separately:
  next to a neighboring cell the limit is half the gap, at the sheet edge it is the sheet margin.
- Crop, fold and registration marks.
- Scale “as is” or “fit to cell”, alignment of pages of different sizes.
- Reading the source with CropBox, TrimBox and page rotation taken into account; writing sheets by carrying pages over as form XObjects through a shared graft map.

The layout plan is data: the preview and the writer receive the same structure, so the screen and the file cannot diverge. Failures are returned as values, not exceptions.

## Structure

- `src/domain/` — layout. Knows nothing about PDF, the DOM or workers.
- `src/application/` — use cases and ports.
- `src/infrastructure/` — PDF engine adapters and the worker the engine runs in.
- `src/presentation/` — React interface.
- `test/fixtures/` — test PDF generator and read-back of the finished imposition.

Details of the decisions are in `docs/design.md`.

## Tests

```
bun install
bun run dev         # interface on localhost
bun run test        # tests
bun run e2e         # end-to-end checks in Google Chrome
bun run typecheck   # type check
bun run check       # lint and format
bun run deploy      # build and deploy to tools.volnenko.com
```

Tests don't touch the network: source PDFs are built in code, and the result is read back by the engine and checked against the physical coordinates of pages and marks.

## License

AGPL-3.0-or-later. The license is inherited from the mupdf engine and was chosen deliberately:
closing the source later is not possible without replacing the engine.
