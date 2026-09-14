# Метки реза на листе с несколькими полосами

Дата: 2026-09-14
Статус: исследование, основание для правки раздела 6 `design.md`

Сейчас spusk рисует полный набор меток реза вокруг каждой полосы. На листе с несколькими
полосами метки попадают внутрь листа: между соседними полосами, на корешок разворота, в
зазоры. Ниже разобрано, как с этим обходятся программы спуска.

Обозначения. **[источник]**: сказано прямо в документации или коде программы, ссылка
рядом. **[вывод]**: следует из источников, но прямо в них не написано. Цитаты оставлены
на языке оригинала.

## Кратко: что делают все

- Меток реза внутри спуска нет, если между полосами для метки не хватает места. Каждая
  линия реза отмечается в поле листа: штрих лежит на продолжении линии наружу. Так
  работают «умные» метки Quite Imposing, метки Imposition Wizard и Montax и флажок «метки
  только снаружи спуска» в Kodak Preps.
- Метки в зазоре появляются, только если зазор вмещает метку с отступом от обеих полос. В
  Quite Imposing при размерах по умолчанию для этого нужно 40 pt (14,2 мм). В Montax и
  Preps это отдельная настройка.
- Одна общая линия реза даёт одну метку в поле с каждого конца. При ненулевом зазоре
  линий реза две, и меток тоже две.
- Корешок это сгиб, а не рез. Метку реза на нём не ставят. Сгиб отмечает отдельная метка
  фальцовки (в Fiery и Imposition Wizard это пунктир), и только в схемах, где лист
  фальцуют.
- Отступ метки считается от линии реза, а не от края вылета. Автоматически под вылет он не
  растёт ни в одной из проверенных программ. Adobe предлагает вручную ставить отступ больше
  вылета. В Quite Imposing вылет может заходить на метки.
- Если поле мало, программы либо сами подбирают поле под метки (Montax, InDesign), либо
  обрезают метки по краю листа и предупреждают об этом (Montax, InDesign, Preps).
- Содержимое исходной полосы обрезается по вылету (Montax по умолчанию) или по TrimBox
  (paperjam). Собственные метки исходника за вылетом на лист не попадают.

## Источники и доступ

| Программа | Что прочитано | Доступ |
|---|---|---|
| Quite Imposing Plus 6 | руководство: Smart crop marks, About bleeds, Create booklet, n-Up Pages, Manual Imposition | прочитано |
| Imposition Wizard 3.7 | уроки Crop Marks, Gap Crop Marks, Folding Marks, Bleeds, снимки экрана к ним | прочитано |
| Montax Imposer | палитры Marks, Details of Marks, Info, Imposition Appearance; FAQ; Several Useful Tips | прочитано |
| EFI Fiery Impose | справка «Set printer's marks», руководство Fiery JobMaster 4.6 (PDF) | прочитано; правил для зазоров в справке нет |
| Kodak Preps 11 | справка: Crop mark settings, Fold mark settings, Common settings for SmartMarks, Marks Preferences settings | прочитано |
| Kodak Prinergy | не проверялся отдельно, метки листа описаны в справке Preps | — |
| Adobe InDesign | InDesign CC 2013 Reference (PDF в архиве help.adobe.com), объектная модель `PrintPreference` и `PDFExportPreference` | текущая справка на helpx.adobe.com отвечает 403, использована архивная |
| Adobe FrameMaker | Marks and Bleeds | прочитано: про отступ та же формулировка, что у InDesign |
| Adobe Acrobat Pro, Add Printer Marks | — | helpx.adobe.com отвечает 403, не прочитано |
| paperjam 1.2.2 | `man paperjam`, исходники `cmds.cc` и `pdf-tools.cc` из архива на mj.ucw.cz | прочитано; github.com/gollux/paperjam отвечает 404 |

## 1. Метки снаружи спуска или вокруг каждой полосы

**Quite Imposing Plus, n-Up Pages и Step And Repeat.** [источник] Метки привязаны к
каждой полосе, но это «умные» метки: «We call them smart marks because they never overlap
a page, and convert to fold marks when then need to.» Плечо, которому некуда встать, не
рисуется. На схеме из руководства у соприкасающихся полос остаётся только штрих, уходящий
в поле. Горизонтальные плечи между близко стоящими рядами пропадают.
[Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)

В Manual Imposition «умные» метки включаются отдельным флажком Smart crop marks, «should
give the same effect as when using the N-up or Step & Repeat functions». [источник]
[Manual Imposition](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0050.html)

**Quite Imposing Plus, Create Booklet.** [источник] «Note that the crop marks are based on
the sheet size, less any space at the edge of the sheet, unlike n-up, where they are based
on the page size.» В брошюре метки стоят вокруг всего блока, а не вокруг полос.
[Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html)

**Imposition Wizard.** [источник] Метки стоят в углах каждой полосы. «Imposition Wizard
only displays crop marks if it have enough space for them. If there is no space for a mark
(say another page is too close), the mark is not displayed». На снимке к уроку пропадают
только плечи, которые упираются в соседнюю полосу. Плечи, уходящие в поле листа, остаются.
У пустых ячеек неполного листа меток нет.
[Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/)

**Montax Imposer.** [источник] «Trim marks – Show where the sheet is cut into separate
position. You can choose whether this marks will be used also inside imposition in the
spaces between rows and columns». Обычное место меток снаружи спуска, внутренние
включаются отдельно.
[Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)

**Kodak Preps.** [источник] Метки реза «are always anchored to pages». Для них есть флажок
«Place crop marks on outside of imposition: Select this check box to automatically prevent
placement of any crop marks that would be inside the imposition, such as in the gutters
between the pages.» Значение флажка по умолчанию на странице не указано. У всех SmartMarks
есть ещё общая настройка «Place mark outside page»: «marks will be hidden when they
intersect with a page's trim box area».
[Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings),
[Common settings for SmartMarks](https://workflowhelp.kodak.com/display/PREPS11/Common+settings+for+SmartMarks)

**Fiery Impose.** [источник] Рез отмечается сплошной линией (trim mark), сгиб пунктирной
(fold mark). «Layouts display only the relevant printer's marks. If the layout does not
require folding the sheet, fold marks are not displayed, even if you selected them.» Как
метки ведут себя рядом с зазорами, справка не описывает.
[Set printer's marks in Fiery Impose](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html)

**paperjam.** [источник: `cmds.cc`] В `nup` метки рисуются вокруг каждой плитки без
оглядки на соседей: `nup_page::render` вызывает `cmarks->pdf_stream` для каждой плитки
после её содержимого. По умолчанию у `nup` меток нет (`cmarks(c, "c", "none")`). У
отдельной команды `cropmarks` стиль по умолчанию `cross`: полный крест в каждом углу, в
том числе с плечами внутрь полосы. [источник: `man paperjam`] «cmark ... Draw cropmarks
around each tile.»

**InDesign** не делает раскладку на лист в этом смысле. Print Booklet печатает развороты, а
метки ставятся вокруг печатаемой страницы. Как метится корешок разворота, в прочитанной
справке не сказано.

[вывод] Внутри спуска меток реза нет, пока для них нет места. Метки снаружи блока есть
всегда. Внутренние метки либо включаются отдельной опцией (Montax, Preps), либо ставятся
сами, когда зазор достаточен (Quite Imposing, Imposition Wizard). Метки вокруг каждой
полосы без учёта соседей, как сейчас в spusk, из проверенных программ ставит только
paperjam.

## 2. Метки в зазорах

- **Quite Imposing** [источник]: «Marks start 10 points (0.14 inches, 3.5 mm) from the
  edge of a page, and are 20 points (0.28 inches, 7.1 mm) long. Marks will never be placed
  if any part of them would be less than 10 points from a page. This implies that if you
  want default-sized marks to appear between a row or column of pages the spacing must be
  at least 40 points (0.56 inches, 14.2 mm).» Отдельного выключателя нет, решает только
  геометрия. Встречные плечи двух полос в узком зазоре перекрываются, и руководство считает
  это нормой: «the marks overlap each other».
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [источник]: обычные метки в зазоре показываются, если помещаются.
  Отдельный тип Gap Crop Marks ставит метки «in the middle of the gaps between the pages»
  и тоже «get hidden if there is not enough space for them». Gap Crop Marks нужно добавить
  вручную, по умолчанию их нет.
  [Gap Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/gap-crop-marks/)
- **Montax** [источник]: внутренние метки ставятся по выбору пользователя, «but they will
  be shown here only if there is enough space between rows and columns, since the distance
  from trim of the position will be respected». Значение по умолчанию не указано.
  [Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)
- **Preps** [источник]: флажок «Place crop marks on outside of imposition» убирает метки
  из зазоров. Метки сгиба привязываются к зазорам (gutters) и имеют свой «gutter offset».
  [Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings),
  [Fold mark settings](https://workflowhelp.kodak.com/display/PREPS11/Fold+mark+settings)
- **Fiery**: не описано.
- **paperjam** [источник: `cmds.cc`]: условия нет, метки рисуются всегда.

[вывод] Общее условие: метка в зазоре допустима, если от неё до каждой из двух полос
остаётся отступ метки, то есть `зазор ≥ 2 × offset + length`. У Quite Imposing с его
значениями это 10 + 20 + 10 = 40 pt.

## 3. Нулевой зазор: одна общая линия реза

Прямо о слиянии меток не пишет ни один источник. Что есть:

- **Quite Imposing** [источник]: у соприкасающихся полос (точка b на схеме) горизонтальным
  плечам места нет. Остаётся одна вертикальная метка на общей линии, в поле листа: «only
  the vertical part appears, as a fold mark». На схеме это одна метка, а не две.
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [источник, снимок к уроку]: скрываются плечи, которым мешает
  соседняя полоса. Вертикальные плечи на общей линии остаются в поле.
  [Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/)
- При ненулевом зазоре линий реза две, и в поле стоят обе метки (точка c на схеме Quite
  Imposing). [источник]

[вывод] У всех программ, которые проверяют место, итог одинаковый: одна линия реза даёт
одну метку в поле с каждого конца. Лежат ли в PDF два совпадающих штриха или один, из
документации не видно. Для spusk слить метки по координате линии реза значит просто убрать
лишние дубли из файла: на печати разницы нет.

## 4. Брошюра: корешок

- **Quite Imposing** [источник]: в Create Booklet метки считаются от листа за вычетом поля,
  то есть стоят вокруг разворота целиком. В n-up метка у соприкасающихся полос «convert to
  fold marks»: от неё остаётся только штрих по линии стыка в поле.
  [Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html),
  [Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html)
- **Imposition Wizard** [источник]: Folding Marks это отдельный тип меток, «special folding
  marks in the middle of the booklet spread. It is displayed as a dashed line and is aligned
  with the center of the booklet spread», и «The folding marks are only shown if the
  booklet layout is used». На снимке к уроку пунктир стоит в поле над корешком и под ним,
  только на сгибе разворота. Параметры в примере: отступ 2 мм, длина 10 мм, толщина 0,5 мм.
  Умолчания ли это, в уроке не сказано.
  [Folding Marks](https://appsforlife.com/impositionwizard/tutorials/marks/folding-marks/)
- **Fiery Impose** [источник]: сгиб отмечается пунктиром, рез сплошной линией; метки сгиба
  показываются только в схемах со сгибом. Про шаблон 4-Up Head to Head: «Although this
  layout requires two folds, the template applies a fold mark on the spine fold only.»
  [Fiery JobMaster 4.6, с. 34](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)
- **Preps** [источник]: сгиб отмечается отдельным типом SmartMark со своей длиной, стилем
  (solid, dotted или dashed) и отступом.
  [Fold mark settings](https://workflowhelp.kodak.com/display/PREPS11/Fold+mark+settings)
- **Montax** [источник]: «Center marks – Can be placed ... in the middle of gaps between rows
  or columns, which is useful for folding etc.»; «Lines in the center between positions –
  Are mainly used to control sheet folding.»
  [Details of Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks-detail)
- **InDesign Print Booklet** [источник]: у 2-up Saddle Stitch параметра Space Between Pages
  нет, полосы разворота стоят вплотную. Как метится корешок, в прочитанной справке не
  сказано.
  [InDesign CC 2013 Reference, «Spacing, bleed, and margin options for booklet printing»](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf)
- **paperjam** [источник: `man paperjam`, `cmds.cc`]: `book` только переставляет полосы.
  Меток сгиба в paperjam нет, а `nup` ставит метки реза и на корешке.

[вывод] На корешке метку реза не ставят. Если корешок нужно отметить, это делает метка
фальцовки: пунктир в поле по линии сгиба, и только в схемах, где лист фальцуют.

## 5. Отступ, вылет, длина, толщина

| Программа | Отступ от линии реза | Длина | Толщина | Отношение к вылету |
|---|---|---|---|---|
| Quite Imposing | 10 pt (3,5 мм) | 20 pt (7,1 мм) | не указана | вылет может заходить на метки |
| InDesign | 6 pt по умолчанию | не указана | список `MarkLineWeight`: 0,125, 0,25, 0,5 pt; 0,05–0,30 мм | отступ от края страницы, «not the bleed» |
| Fiery Impose | от −72 до +72 pt | 1–216 pt | 1/4–3 pt | японские метки при ненулевом вылете двойные |
| Kodak Preps | «Offset from page», может быть отрицательным | настраивается | Line Width в настройках | по выбору печатаются дополнительные метки по вылету |
| Imposition Wizard | Margin, в примере 0,079 in (2 мм) | в примере 0,3–0,5 in | в примере 0,02 in | Offset сдвигает TrimBox, от которого считаются метки |
| Montax | «Distance from trim», при отрицательном значении метки внутри | настраивается | настраивается | метки вылета отдельным типом |
| paperjam | 0 | 5 мм | 0,2 pt | не учитывается |

Источники таблицы:
[Quite Imposing, Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html);
[InDesign CC 2013 Reference, «Marks and Bleed options»](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf);
[InDesign, PrintPreference](https://developer.adobe.com/indesign/dom/api/p/PrintPreference/)
и [полный список значений MarkLineWeight](https://www.indesignjs.de/extendscriptAPI/indesign-latest/PrintPreference.html);
[Fiery, Set printer's marks](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html);
[Preps, Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings)
и [Marks Preferences settings](https://workflowhelp.kodak.com/display/PREPS11/Marks+Preferences+settings);
[Imposition Wizard, Crop Marks](https://appsforlife.com/impositionwizard/tutorials/marks/crop-marks/);
[Montax, FAQ](https://www.montax-imposer.com/faq); paperjam: `cmds.cc`, `man paperjam`.

**InDesign не поднимает отступ до вылета.** [источник] «Specifies how far from the edge of
the page (not the bleed) InDesign will draw printer's marks. By default, InDesign draws
printer's marks 6 points from the edge of the page. To avoid drawing printer's marks on a
bleed, be sure to enter an Offset value greater than the Bleed value.»
[InDesign CC 2013 Reference](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf).
FrameMaker пишет то же самое.
[FrameMaker, Marks and Bleeds](https://help.adobe.com/en_US/framemaker/using/using-framemaker/user-guide/frm_generating_output-pdf_marks-and-bleeds.html)
В объектной модели `markOffset` описан как «The distance to offset the page marks from the
edge of the page» и с вылетом не связан.
[PrintPreference](https://developer.adobe.com/indesign/dom/api/p/PrintPreference/).
Предположение, что InDesign сам держит отступ не меньше вылета, источниками не
подтверждается. Косвенно это видно и по запросу пользователей 2021 года «Make Crop Marks
always outside the Bleed» на форуме пожеланий Adobe. Официального ответа там нет, поэтому
источник вторичный.
[indesign.uservoice.com](https://indesign.uservoice.com/forums/601180-adobe-indesign-bugs/suggestions/42646738-make-crop-marks-always-outside-the-bleed)

**Quite Imposing позволяет вылету заходить на метки.** [источник] «The bleed area of a page
is allowed to overlap crop marks. The exclusion only applies to the area within the bleed
(bleed interior).»
[Smart crop marks](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0012.html).
[вывод] Отступ по умолчанию, 3,5 мм, больше обычного вылета в 3 мм, поэтому на типовом
файле метки на вылет не заходят.

**Fiery** [источник]: для японских меток «If the bleed value is 0, the Japanese marks are one
line, similar to the standard style. If a bleed value is set, two corner marks are
displayed, to indicate the trim and the bleed.» В режиме Crop Box «the Bleeds option moves
the trim marks into the image by the amount you specify».
[Set printer's marks](https://help.fiery.com/jobmaster/5.0/en-us/GUID-AE853CCB-4F49-47C1-A7EF-2CA1CE909C48.html),
[Fiery JobMaster 4.6](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)

**Preps** [источник]: в настройках можно «print additional crop marks for the bleed margins»
и сдвигать метки реза вместе с выползанием («shift the crop marks with page shingling»).
[Crop mark settings](https://workflowhelp.kodak.com/display/PREPS11/Crop+mark+settings)

## 6. Поле под метки

- **Montax** [источник]: «If margins are calculated automatically (option "Auto margins" on
  Info Palette) they are calculated so that the marks fit in. If the margins are reduced
  manually, the marks will be placed according to their settings, but their visibility will
  be limited by the margin (they will be cropped). In such case a yellow triangle signaling
  a warning is displayed». На палитре Info: «Auto margins enables automatic computation of
  minimal margin so that all marks and bleed fit in it.»
  [Marks Palette](https://www.montax-imposer.com/description/palettes/palette-marks),
  [Info Palette](https://www.montax-imposer.com/description/palettes/palette-info)
- **InDesign Print Booklet** [источник]: «Automatically Adjust To Fit Marks And Bleeds: Lets
  InDesign calculate the margins to accommodate the bleeds and the other printer mark
  options currently set.» При ручных полях: «Decreasing the values may result in clipping
  the marks and bleeds.» В обычной печати «Selecting any page-mark option expands the page
  boundaries to accommodate printer's marks». Превью в диалоге печати «indicates whether you
  have enough space to include all printer's marks», а что обрежется при нехватке места,
  задаётся через Page Position.
  [InDesign CC 2013 Reference](https://help.adobe.com/archive/en/indesign/cc/2013/indesign_reference.pdf)
- **Preps** [источник]: есть настройка «Ignore marks output error messages: Select this
  option to ignore warnings about marks not fully on media when printing». Значит, по
  умолчанию Preps о таких метках предупреждает.
  [Marks Preferences settings](https://workflowhelp.kodak.com/display/PREPS11/Marks+Preferences+settings)
- **Quite Imposing** [источник]: в Create Booklet поле «Space at edge of sheet ... is
  essential if using the next option» (Add crop marks). В Manual Imposition: «Allow about 1
  inch/25 mm clearance around each page for the marks.» Для n-up правил про поле под метки
  нет. Лист увеличивается с предупреждением, только если сами полосы в него не влезают.
  [Create booklet](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0028.html),
  [Manual Imposition](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0050.html),
  [n-Up Pages](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0029.html)
- **Fiery** [источник]: поле зависит от принтера, «You cannot set custom margins».
  [Fiery JobMaster 4.6](https://help.fiery.com/jobmaster/4.6/en-us/Fiery_JobMaster.pdf)
- **paperjam** [источник: `man paperjam`]: поле `margin` по умолчанию 0, метки при расчёте
  поля не учитываются.

[вывод] Размер поля задают отступ и длина метки. У Quite Imposing при умолчаниях это
10 + 20 = 30 pt, около 10,6 мм. Обычные реакции на нехватку места: подобрать поле
автоматически, обрезать метки по краю листа, предупредить.

## 7. Собственные метки исходной полосы

- **Montax** [источник]: опция «Crop large pages to positions size» включена по умолчанию:
  «the input PDF is limited to the PDF bleed box and also to the position bleed. This avoids
  that a page in one position overlaps an adjacent position. That's why the original marks
  (if they are outside the bleed) are not shown».
  [Imposition Appearance Palette](https://www.montax-imposer.com/description/palettes/palette-imposition-appearance)
- **paperjam** [источник: `pdf-tools.cc`]: полоса вставляется формой XObject, у которой
  `/BBox` берётся из TrimBox, при его отсутствии из CropBox, затем из MediaBox. Всё, что
  лежит за TrimBox, отсекается, вместе с вылетом и метками исходника.
- **Quite Imposing** [источник]: раскладка считается по TrimBox, на лист выходит «bleed
  exterior», ограниченный BleedBox. У близко стоящих полос программа «tries to avoid
  overlapping bleeds». Про метки исходника прямо не сказано. [вывод] Содержимое за
  BleedBox на лист не выходит.
  [About bleeds](https://www.quite.com/docs/qi6/en/qi6_manual/b6_0013.html)
- **Imposition Wizard** [источник]: всё за CropBox невидимо, размер вылета задаёт BleedBox.
  Про метки исходника не сказано.
  [Bleeds](https://appsforlife.com/impositionwizard/tutorials/parameters/bleeds/)
- **Preps, Fiery**: не найдено.

[вывод] Обычная практика: обрезать исходник по вылету и рисовать метки листа заново. spusk
уже так и делает: по разделу 6 `design.md` содержимое обрезается по `trim`, расширенному на
эффективный вылет.

## Что это значит для spusk

Предлагаемые правила для меток реза. Числа взяты из нынешнего `application/settings.ts`:
длина 5 мм, отступ `max(3 мм, вылет)`, толщина 0,25 pt.

1. **Метки ставятся по линиям реза, а не по полосам.** Каждая занятая ячейка даёт
   вертикальные линии реза по левому и правому краю `trim` и горизонтальные по верхнему и
   нижнему. Совпадающие координаты сливаются в одну линию (допуск порядка 0,01 pt). При
   нулевом зазоре у соседей одна общая линия, при ненулевом две. Верх и низ разворота
   брошюры тоже дают по одной линии на обе полосы. Вопросы 1 и 3.
2. **Метки только в поле листа.** Вертикальная линия реза получает два штриха, над блоком
   и под блоком. Горизонтальная получает два штриха, слева и справа от блока. Блок это
   прямоугольник, охватывающий `trim` всех ячеек сетки. Штрих начинается на `offset` от
   края блока и имеет длину `length`. Внутри блока меток реза нет. Вопросы 1 и 3. [вывод]
   Рамка по всей сетке, а не только по занятым ячейкам, держит метки на одних и тех же
   местах на всех листах серии, а рез гильотиной и так идёт через весь лист.
3. **Пустые ячейки.** Линия, которая ограничивает только пустые ячейки, меток не получает
   (как в Imposition Wizard). Линия, которая ограничивает хотя бы одну занятую ячейку,
   получает штрихи на обоих концах, даже если на пути лежат пустые ячейки. Это закрывает
   пункт `known-gaps.md` про внешнюю линию реза неполного листа.
4. **Корешок не режут.** В `booklet` и в тетрадях границы между левой и правой полосой
   разворота исключаются из линий реза при любом зазоре. Это касается обоих внутренних
   краёв, если зазор ненулевой. Внешние края разворота режутся как обычно. Если фальцовка
   включена, на линии сгиба ставится пунктирный штрих в поле: сверху и снизу, а при
   `binding = 'top'` слева и справа. Вопрос 4.
5. **Фальцовка только на сгибе.** Сейчас `foldMarksFor` ставит пунктир на каждой границе
   ячеек в любой схеме. В `nup`, `stepRepeat` и `cutStack` эти границы режут, а не
   фальцуют. Там метки фальцовки не нужны даже при включённом флажке. Так делают Fiery
   («fold marks are not displayed, even if you selected them») и Imposition Wizard («only
   shown if the booklet layout is used»). Вопрос 4.
6. **Метки в зазорах не нужны в v1.** Их можно добавить позже как опцию, выключенную по
   умолчанию, по примеру Montax и Preps. Условие: `зазор ≥ 2 × offset + length`, при
   нынешних числах и вылете до 3 мм это 11 мм. Если места не хватает, метка не
   рисуется совсем, а не укорачивается. Встречные плечи в одном зазоре сливаются. Quite
   Imposing ставит такие метки сам, без опции. Здесь spusk сознательно от него отходит:
   пользователю метки в центре листа мешают. Вопрос 2.
7. **Отступ оставить как есть.** `offset = max(3 мм, вылет)` это рекомендация Adobe,
   только применённая автоматически. Ни одна из проверенных программ так не делает, но и
   вреда от этого нет: метка никогда не ложится на вылет. Вопрос 5.
8. **Поле.** В режиме `auto` поле равно `max(вылет, offset + length)`, как сейчас. Если
   ручное поле меньше, штрихи обрезаются по краю листа и интерфейс предупреждает, как в
   Montax, InDesign и Preps. Если поле не больше `offset`, штрих не рисуется совсем.
   Сейчас при нулевом поле метки уходят за край листа (`known-gaps.md`), их тоже нужно
   обрезать по листу. Вопрос 6.
9. **Метки исходника не переносятся.** Обрезка по `trim` плюс эффективный вылет остаётся
   без изменений. Вопрос 7.

Раздел 6 `design.md` («Метки реза рисуются в углах `trim`...») после принятия этих правил
нужно переписать. Пункт `known-gaps.md` про плечо вдоль линии реза соседней полосы
закрывается правилами 1 и 2.
