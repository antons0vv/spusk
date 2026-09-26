# Crop marks on a sheet with several pages

Date: 2026-09-14
Status: research, basis for revising section 6 of `design.md`

Right now spusk draws a full set of crop marks around each page. On a sheet with several pages
the marks end up inside the sheet: between neighboring pages, on the spine of a spread, in the
gaps. Below is how imposition programs deal with this.

Notation. **[source]**: stated directly in the program's documentation or code, link next to
it. **[inference]**: follows from the sources but is not written in them directly. Quotes are
kept in the original language.

## In short: what everyone does

- There are no crop marks inside the imposition if there is not enough room for a mark between
  pages. Each trim line is marked in the sheet margin: the stroke lies on the trim line's
  outward extension. This is how Quite Imposing's “smart” marks, Imposition Wizard's and
  Montax's marks, and the “marks only outside the imposition” check box in Kodak Preps work.
- Marks in a gap appear only if the gap fits a mark with an offset from both pages. In Quite
  Imposing with default sizes this takes 40 pt (14.2 mm). In Montax and Preps it is a separate
  setting.
- One shared trim line gives one mark in the margin at each end. With a non-zero gap there are
  two trim lines, and two marks.
- The spine is a fold, not a cut. No crop mark goes on it. The fold is marked by a separate fold
  mark (a dashed line in Fiery and Imposition Wizard), and only in layouts where the sheet is
  folded.
- The mark offset is measured from the trim line, not from the bleed edge. None of the checked
  programs grows it to the bleed automatically. Adobe suggests setting an offset larger than the
  bleed by hand. In Quite Imposing the bleed may run over the marks.
- If the margin is too small, programs either fit the margin to the marks themselves (Montax,
  InDesign) or clip the marks at the sheet edge and warn about it (Montax, InDesign, Preps).
- The source page's content is clipped at the bleed (Montax by default) or at the TrimBox
  (paperjam). The source's own marks beyond the bleed do not reach the sheet.

## Sources and access

| Program | What was read | Access |
|---|---|---|
| Quite Imposing Plus 6 | manual: Smart crop marks, About bleeds, Create booklet, n-Up Pages, Manual Imposition | read |
| Imposition Wizard 3.7 | tutorials Crop Marks, Gap Crop Marks, Folding Marks, Bleeds, their screenshots | read |
| Montax Imposer | palettes Marks, Details of Marks, Info, Imposition Appearance; FAQ; Several Useful Tips | read |
| EFI Fiery Impose | help page “Set printer's marks”, Fiery JobMaster 4.6 manual (PDF) | read; the help has no rules for gaps |
| Kodak Preps 11 | help: Crop mark settings, Fold mark settings, Common settings for SmartMarks, Marks Preferences settings | read |
| Kodak Prinergy | not checked separately, sheet marks are described in the Preps help | — |
| Adobe InDesign | InDesign CC 2013 Reference (PDF in the help.adobe.com archive), object model `PrintPreference` and `PDFExportPreference` | current help on helpx.adobe.com returns 403, the archived one was used |
| Adobe FrameMaker | Marks and Bleeds | read: same wording on offset as InDesign |
| Adobe Acrobat Pro, Add Printer Marks | — | helpx.adobe.com returns 403, not read |
| paperjam 1.2.2 | `man paperjam`, sources `cmds.cc` and `pdf-tools.cc` from the archive on mj.ucw.cz | read; github.com/gollux/paperjam returns 404 |

## 1. Marks outside the imposition or around each page

**Quite Imposing Plus, n-Up Pages and Step And Repeat.** [source] Marks are tied to each page,
but they are “smart” marks: “We call them smart marks because they never overlap a page, and
convert to fold marks when then need to.” An arm with no room to stand is not drawn. In the
manual's diagram, touching pages keep only the stroke that goes out into the margin. Horizontal
arms between closely spaced rows disappear.
[Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)

In Manual Imposition the “smart” marks are turned on by a separate Smart crop marks check box,
which “should give the same effect as when using the N-up or Step & Repeat functions”. [source]
[Manual Imposition](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0050.html)

**Quite Imposing Plus, Create Booklet.** [source] “Note that the crop marks are based on the
sheet size, less any space at the edge of the sheet, unlike n-up, where they are based on the
page size.” In a booklet the marks stand around the whole block, not around the pages.
[Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html)

**Imposition Wizard.** [source] Marks stand at the corners of each page. “Imposition Wizard only
displays crop marks if it have enough space for them. If there is no space for a mark (say
another page is too close), the mark is not displayed”. In the tutorial's screenshot only the
arms that run into a neighboring page disappear. Arms that go out into the sheet margin stay.
Empty cells of an incomplete sheet have no marks.
[Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/)

**Montax Imposer.** [source] “Trim marks – Show where the sheet is cut into separate position.
You can choose whether this marks will be used also inside imposition in the spaces between
rows and columns”. The usual place for marks is outside the imposition; inner ones are turned
on separately.
[Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)

**Kodak Preps.** [source] Crop marks “are always anchored to pages”. They have a check box
“Place crop marks on outside of imposition: Select this check box to automatically prevent
placement of any crop marks that would be inside the imposition, such as in the gutters between
the pages.” The page does not state the check box's default value. All SmartMarks also share a
common setting “Place mark outside page”: “marks will be hidden when they intersect with a
page's trim box area”.
[Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings),
[Common settings for SmartMarks](https://workflowhelp.kodak.com/display/PREPS11/Common+settings+for+SmartMarks)

**Fiery Impose.** [source] A cut is marked with a solid line (trim mark), a fold with a dashed
one (fold mark). “Layouts display only the relevant printer's marks. If the layout does not
require folding the sheet, fold marks are not displayed, even if you selected them.” The help
does not describe how marks behave next to gaps.
[Set printer's marks in Fiery Impose](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html)

**paperjam.** [source: `cmds.cc`] In `nup` marks are drawn around each tile without regard to
neighbors: `nup_page::render` calls `cmarks->pdf_stream` for each tile after its content. By
default `nup` has no marks (`cmarks(c, "c", "none")`). The separate `cropmarks` command has the
default style `cross`: a full cross at each corner, including arms pointing into the page.
[source: `man paperjam`] “cmark ... Draw cropmarks around each tile.”

**InDesign** does not lay pages out on a sheet in this sense. Print Booklet prints spreads, and
marks go around the printed page. How the spine of a spread is marked is not stated in the help
that was read.

[inference] There are no crop marks inside the imposition until there is room for them. Marks
outside the block are always there. Inner marks are either turned on by a separate option
(Montax, Preps) or placed automatically when the gap is large enough (Quite Imposing, Imposition
Wizard). Of the checked programs, only paperjam places marks around each page without regard to
neighbors, as spusk does now.

## 2. Marks in gaps

- **Quite Imposing** [source]: “Marks start 10 points (0.14 inches, 3.5 mm) from the
  edge of a page, and are 20 points (0.28 inches, 7.1 mm) long. Marks will never be placed
  if any part of them would be less than 10 points from a page. This implies that if you
  want default-sized marks to appear between a row or column of pages the spacing must be
  at least 40 points (0.56 inches, 14.2 mm).” There is no separate switch; only geometry
  decides. Facing arms of two pages overlap in a narrow gap, and the manual considers this
  normal: “the marks overlap each other”.
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [source]: ordinary marks in a gap are shown if they fit. A separate
  type, Gap Crop Marks, places marks “in the middle of the gaps between the pages” and they also
  “get hidden if there is not enough space for them”. Gap Crop Marks have to be added by hand;
  they are off by default.
  [Gap Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/gap-crop-marks/)
- **Montax** [source]: inner marks are placed at the user's choice, “but they will
  be shown here only if there is enough space between rows and columns, since the distance
  from trim of the position will be respected”. The default value is not stated.
  [Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)
- **Preps** [source]: the check box “Place crop marks on outside of imposition” removes marks
  from gaps. Fold marks are anchored to gaps (gutters) and have their own “gutter offset”.
  [Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings),
  [Fold mark settings](https://workflowhelp.kodak.com/display/PREPS11/Fold+mark+settings)
- **Fiery**: not described.
- **paperjam** [source: `cmds.cc`]: no condition, marks are always drawn.

[inference] The common condition: a mark in a gap is allowed if the mark offset remains between
it and each of the two pages, that is `gap ≥ 2 × offset + length`. For Quite Imposing with its
values this is 10 + 20 + 10 = 40 pt.

## 3. Zero gap: one shared trim line

No source writes about merging marks directly. What there is:

- **Quite Imposing** [source]: for touching pages (point b in the diagram) there is no room for
  horizontal arms. One vertical mark remains on the shared line, in the sheet margin: “only
  the vertical part appears, as a fold mark”. In the diagram this is one mark, not two.
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [source, tutorial screenshot]: arms blocked by a neighboring page are
  hidden. Vertical arms on the shared line stay in the margin.
  [Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/)
- With a non-zero gap there are two trim lines, and both marks stand in the margin (point c in
  the Quite Imposing diagram). [source]

[inference] All programs that check for room end up the same: one trim line gives one mark in
the margin at each end. Whether the PDF holds two coinciding strokes or one is not visible from
the documentation. For spusk, merging marks by trim line coordinate simply means removing
redundant duplicates from the file: in print there is no difference.

## 4. Booklet: the spine

- **Quite Imposing** [source]: in Create Booklet marks are measured from the sheet minus the
  margin, that is, they stand around the whole spread. In n-up a mark at touching pages will
  “convert to fold marks”: only the stroke along the joint line in the margin remains.
  [Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html),
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [source]: Folding Marks is a separate mark type, “special folding
  marks in the middle of the booklet spread. It is displayed as a dashed line and is aligned
  with the center of the booklet spread”, and “The folding marks are only shown if the
  booklet layout is used”. In the tutorial's screenshot the dashed line stands in the margin
  above and below the spine, only on the spread's fold. Parameters in the example: offset 2 mm,
  length 10 mm, stroke weight 0.5 mm. The tutorial does not say whether these are the defaults.
  [Folding Marks](https://appsforlife.com/impositionwizard/tutorials/marks/folding-marks/)
- **Fiery Impose** [source]: a fold is marked with a dashed line, a cut with a solid one; fold
  marks are shown only in layouts with a fold. On the 4-Up Head to Head template: “Although this
  layout requires two folds, the template applies a fold mark on the spine fold only.”
  [Fiery JobMaster 4.6, p. 34](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)
- **Preps** [source]: a fold is marked with a separate SmartMark type with its own length, style
  (solid, dotted or dashed) and offset.
  [Fold mark settings](https://workflowhelp.kodak.com/display/PREPS11/Fold+mark+settings)
- **Montax** [source]: “Center marks – Can be placed ... in the middle of gaps between rows
  or columns, which is useful for folding etc.”; “Lines in the center between positions –
  Are mainly used to control sheet folding.”
  [Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)
- **InDesign Print Booklet** [source]: 2-up Saddle Stitch has no Space Between Pages parameter;
  the pages of a spread stand flush. How the spine is marked is not stated in the help that
  was read.
  [InDesign CC 2013 Reference, “Spacing, bleed, and margin options for booklet printing”](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf)
- **paperjam** [source: `man paperjam`, `cmds.cc`]: `book` only reorders pages. paperjam has
  no fold marks, and `nup` places crop marks on the spine too.

[inference] No crop mark goes on the spine. If the spine needs marking, a fold mark does it: a
dashed line in the margin along the fold line, and only in layouts where the sheet is folded.

## 5. Offset, bleed, length, stroke weight

| Program | Offset from trim line | Length | Stroke weight | Relation to bleed |
|---|---|---|---|---|
| Quite Imposing | 10 pt (3.5 mm) | 20 pt (7.1 mm) | not stated | bleed may run over the marks |
| InDesign | 6 pt by default | not stated | `MarkLineWeight` list: 0.125, 0.25, 0.5 pt; 0.05–0.30 mm | offset from the page edge, “not the bleed” |
| Fiery Impose | from −72 to +72 pt | 1–216 pt | 1/4–3 pt | Japanese marks are doubled when bleed is non-zero |
| Kodak Preps | “Offset from page”, may be negative | configurable | Line Width in settings | optionally prints extra marks at the bleed |
| Imposition Wizard | Margin, 0.079 in (2 mm) in the example | 0.3–0.5 in in the example | 0.02 in in the example | Offset shifts the TrimBox that marks are measured from |
| Montax | “Distance from trim”, marks go inside when negative | configurable | configurable | bleed marks are a separate type |
| paperjam | 0 | 5 mm | 0.2 pt | not taken into account |

Table sources:
[Quite Imposing, Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html);
[InDesign CC 2013 Reference, “Marks and Bleed options”](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf);
[InDesign, PrintPreference](https://developer.adobe.com/indesign/dom/api/p/PrintPreference/)
and [full list of MarkLineWeight values](https://www.indesignjs.de/extendscriptAPI/indesign-latest/PrintPreference.html);
[Fiery, Set printer's marks](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html);
[Preps, Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings)
and [Marks Preferences settings](https://workflowhelp.kodak.com/display/PREPS11/Marks+Preferences+settings);
[Imposition Wizard, Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/);
[Montax, FAQ](https://www.montax-imposer.com/faq); paperjam: `cmds.cc`, `man paperjam`.

**InDesign does not raise the offset to the bleed.** [source] “Specifies how far from the edge
of the page (not the bleed) InDesign will draw printer's marks. By default, InDesign draws
printer's marks 6 points from the edge of the page. To avoid drawing printer's marks on a
bleed, be sure to enter an Offset value greater than the Bleed value.”
[InDesign CC 2013 Reference](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf).
FrameMaker says the same.
[FrameMaker, Marks and Bleeds](https://help.adobe.com/en_US/framemaker/using/using-framemaker/user-guide/frm_generating_output-pdf_marks-and-bleeds.html)
In the object model `markOffset` is described as “The distance to offset the page marks from the
edge of the page” and is not tied to the bleed.
[PrintPreference](https://developer.adobe.com/indesign/dom/api/p/PrintPreference/).
The assumption that InDesign itself keeps the offset no smaller than the bleed is not confirmed
by the sources. It is also indirectly visible in a 2021 user request “Make Crop Marks always
outside the Bleed” on Adobe's feature request forum. There is no official answer there, so the
source is secondary.
[indesign.uservoice.com](https://indesign.uservoice.com/forums/601180-adobe-indesign-bugs/suggestions/42646738-make-crop-marks-always-outside-the-bleed)

**Quite Imposing lets the bleed run over the marks.** [source] “The bleed area of a page is
allowed to overlap crop marks. The exclusion only applies to the area within the bleed (bleed
interior).”
[Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html).
[inference] The default offset, 3.5 mm, is larger than the usual 3 mm bleed, so on a typical
file the marks do not run onto the bleed.

**Fiery** [source]: for Japanese marks “If the bleed value is 0, the Japanese marks are one
line, similar to the standard style. If a bleed value is set, two corner marks are
displayed, to indicate the trim and the bleed.” In Crop Box mode “the Bleeds option moves
the trim marks into the image by the amount you specify”.
[Set printer's marks](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html),
[Fiery JobMaster 4.6](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)

**Preps** [source]: the settings let you “print additional crop marks for the bleed margins”
and shift crop marks together with creep (“shift the crop marks with page shingling”).
[Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings)

## 6. Margin for the marks

- **Montax** [source]: “If margins are calculated automatically (option "Auto margins" on
  Info Palette) they are calculated so that the marks fit in. If the margins are reduced
  manually, the marks will be placed according to their settings, but their visibility will
  be limited by the margin (they will be cropped). In such case a yellow triangle signaling
  a warning is displayed”. On the Info palette: “Auto margins enables automatic computation of
  minimal margin so that all marks and bleed fit in it.”
  [Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks),
  [Info Palette](https://www.montax-imposer.com/description/palettes/palette-info)
- **InDesign Print Booklet** [source]: “Automatically Adjust To Fit Marks And Bleeds: Lets
  InDesign calculate the margins to accommodate the bleeds and the other printer mark
  options currently set.” With manual margins: “Decreasing the values may result in clipping
  the marks and bleeds.” In regular printing “Selecting any page-mark option expands the page
  boundaries to accommodate printer's marks”. The preview in the print dialog “indicates whether
  you have enough space to include all printer's marks”, and what gets clipped when room runs
  short is set through Page Position.
  [InDesign CC 2013 Reference](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf)
- **Preps** [source]: there is a setting “Ignore marks output error messages: Select this
  option to ignore warnings about marks not fully on media when printing”. So by default
  Preps warns about such marks.
  [Marks Preferences settings](https://workflowhelp.kodak.com/display/PREPS11/Marks+Preferences+settings)
- **Quite Imposing** [source]: in Create Booklet the field “Space at edge of sheet ... is
  essential if using the next option” (Add crop marks). In Manual Imposition: “Allow about 1
  inch/25 mm clearance around each page for the marks.” For n-up there are no rules about a
  margin for marks. The sheet is enlarged with a warning only if the pages themselves do not fit.
  [Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html),
  [Manual Imposition](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0050.html),
  [n-Up Pages](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0029.html)
- **Fiery** [source]: the margin depends on the printer, “You cannot set custom margins”.
  [Fiery JobMaster 4.6](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)
- **paperjam** [source: `man paperjam`]: the `margin` defaults to 0, marks are not taken into
  account when computing the margin.

[inference] The margin size is set by the mark offset and mark length. For Quite Imposing with
defaults this is 10 + 20 = 30 pt, about 10.6 mm. The usual responses to a lack of room: fit the
margin automatically, clip the marks at the sheet edge, warn.

## 7. The source page's own marks

- **Montax** [source]: the option “Crop large pages to positions size” is on by default:
  “the input PDF is limited to the PDF bleed box and also to the position bleed. This avoids
  that a page in one position overlaps an adjacent position. That's why the original marks
  (if they are outside the bleed) are not shown”.
  [Imposition Appearance Palette](https://www.montax-imposer.com/description/palettes/palette-imposition-appearance)
- **paperjam** [source: `pdf-tools.cc`]: a page is placed as a form XObject whose `/BBox` is
  taken from the TrimBox, or if it is missing from the CropBox, then from the MediaBox.
  Everything beyond the TrimBox is cut off, including the source's bleed and marks.
- **Quite Imposing** [source]: the layout is computed from the TrimBox; the sheet receives the
  “bleed exterior”, bounded by the BleedBox. For closely spaced pages the program “tries to
  avoid overlapping bleeds”. Nothing is said directly about the source's marks. [inference]
  Content beyond the BleedBox does not reach the sheet.
  [About bleeds](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0013.html)
- **Imposition Wizard** [source]: everything beyond the CropBox is invisible; the bleed size is
  set by the BleedBox. Nothing is said about the source's marks.
  [Bleeds](https://appsforlife.com/impositionwizard/tutorials/parameters/bleeds/)
- **Preps, Fiery**: not found.

[inference] Common practice: clip the source at the bleed and draw the sheet marks anew. spusk
already does this: per section 6 of `design.md`, content is clipped at `trim` expanded by the
effective bleed.

## What this means for spusk

Proposed rules for crop marks. The numbers are taken from the current `application/settings.ts`:
length 5 mm, offset `max(3 mm, bleed)`, stroke weight 0.25 pt.

1. **Marks are placed by trim lines, not by pages.** Each occupied cell gives vertical trim
   lines at the left and right edges of `trim` and horizontal ones at the top and bottom.
   Coinciding coordinates merge into one line (tolerance about 0.01 pt). With a zero gap
   neighbors share one line; with a non-zero gap there are two. The top and bottom of a
   booklet spread also give one line each for both pages. Questions 1 and 3.
2. **Marks only in the sheet margin.** A vertical trim line gets two strokes, above the block
   and below it. A horizontal one gets two strokes, left and right of the block. The block is
   the rectangle enclosing the `trim` of all grid cells. A stroke starts at `offset` from the
   block edge and has length `length`. There are no crop marks inside the block. Questions 1
   and 3. [inference] A frame around the whole grid, not just the occupied cells, keeps the
   marks in the same places on every sheet of a run, and a guillotine cut runs across the whole
   sheet anyway.
3. **Empty cells.** A line that bounds only empty cells gets no marks (as in Imposition
   Wizard). A line that bounds at least one occupied cell gets strokes at both ends, even if
   empty cells lie along the way. This closes the `known-gaps.md` item about the outer trim
   line of an incomplete sheet.
4. **The spine is not cut.** In `booklet` and in signatures, the boundaries between the left
   and right page of a spread are excluded from trim lines at any gap. This covers both inner
   edges if the gap is non-zero. The outer edges of the spread are cut as usual. If folding is
   on, a dashed stroke goes in the margin on the fold line: top and bottom, and with
   `binding = 'top'` left and right. Question 4.
5. **Fold marks only on a fold.** Right now `foldMarksFor` puts a dashed line on every cell
   boundary in every layout. In `nup`, `stepRepeat` and `cutStack` these boundaries are cut,
   not folded. There fold marks are not needed even with the check box on. Fiery does this
   (“fold marks are not displayed, even if you selected them”) and so does Imposition Wizard
   (“only shown if the booklet layout is used”). Question 4.
6. **Marks in gaps are not needed in v1.** They can be added later as an option, off by
   default, following Montax and Preps. Condition: `gap ≥ 2 × offset + length`; with the
   current numbers and bleed up to 3 mm this is 11 mm. If there is not enough room, the mark is
   not drawn at all rather than shortened. Facing arms in one gap merge. Quite Imposing places
   such marks by itself, with no option. Here spusk deliberately departs from it: marks in the
   middle of the sheet get in the user's way. Question 2.
7. **Keep the offset as is.** `offset = max(3 mm, bleed)` is Adobe's recommendation, just
   applied automatically. None of the checked programs does this, but it does no harm either:
   a mark never lands on the bleed. Question 5.
8. **Margin.** In `auto` mode the margin is `max(bleed, offset + length)`, as now. If a manual
   margin is smaller, the strokes are clipped at the sheet edge and the interface warns, as in
   Montax, InDesign and Preps. If the margin is no larger than `offset`, the stroke is not drawn
   at all. Right now with a zero margin the marks go past the sheet edge (`known-gaps.md`);
   they also need to be clipped to the sheet. Question 6.
9. **Source marks are not carried over.** Clipping at `trim` plus the effective bleed stays
   unchanged. Question 7.

Section 6 of `design.md` (“Crop marks are drawn at the corners of `trim`...”) needs to be
rewritten once these rules are accepted. The `known-gaps.md` item about an arm along a
neighboring page's trim line is closed by rules 1 and 2.
