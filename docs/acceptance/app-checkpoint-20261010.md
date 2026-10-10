# Current real-application checkpoint, 2026-10-10

Stage 1 is **open**. The required applications are Excel for the web and WPS
desktop. LibreOffice work is stopped. This live summary does not rewrite the
pending records or byte hashes in any frozen paired run.

Latest production source: `1b498934dc9a58922a08514db8fa29f64780f86b`, with the
direct-color rule introduced at `90279cfc654fd1dfad19abdc85afcbda06804913`.
The user selected target-app font default/reset behavior: ordinary direct RGB
`#20242c` resets to default/table inheritance, while other literal RGB and live
theme bindings stay explicit. XLSX Normal now matches that fixed Core default,
with Calibri 11 and the MDW 7 width baseline unchanged. See the
[revised contract](font-color-default-reset-20261010.md), including legacy-state
normalization and the narrow own-producer recovery boundary.

The direct-color source passed 2,591 Core tests in 175 files and 767 XLSX tests
in 69 files. The table-import checkpoint passed 780 XLSX tests in 70 files.
The latest iteration-cache fix passed 842 XLSX tests in 71 files and 70 focused
tests, plus forced package builds, XLSX typecheck/lint, scoped formatting,
built package imports and the XLSX browser worker check. The first parallel full
run's unchanged encryption 5-second timeout is preserved; the same source passed
all 842 with two workers and unchanged timeout. See the
[iteration-cache contract and actual-app evidence](iterative-caches-20261010.md).
Core bytes are unchanged from the 2,591-test source; the earlier Core/sheet-engine
browser worker check also remains tied to those same bytes.
The direct-color source's fresh bounded two-application dark-to-named-Light/save/full-close/
fresh-reopen case passed, including inherited/default-reset fonts, literal black,
live dark1, red, ordinary controls, 13/18pt sizes and marker persistence.
The original public-Core fixture SHA-256 is
`f47e9de9f26b0c9d2692f08328ef732b744abb65d94432a2021741e043e95410`.
WPS saved 9,792 bytes, SHA-256
`06c409c2e21d1a5ce37b111f19fa403b3e2127e8e2d42be17ae871f761bfe3db`;
Excel saved 7,202 bytes, SHA-256
`405dd4acb51fb1ab8be9bd3443617c17e341f4c3d6609ef5acff4385f0f6b4bf`.
Their actual saved OOXML and 13 nonblank safe JPEGs are retained in
`font-reset-production-gui-20261010`. This is one focused case, not universal
application or table-format fidelity.

Public ingestion of those actual saved copies preserves direct colors/reset,
sizes and live dark1. Excel's named Light2 definition also recovers correctly.
WPS's separately defined named-Light style exposed an existing importer defect:
it omits the schema-defaulted `table` attribute. Source `90279cf` ignored the
definition and substituted a white-header Medium1 fallback. The latest fix
recovers the actual seven DXF elements and uses the workbook palette/tint.
Its 61 actual-saved-byte/public roundtrip checks passed, including A/B/F derived
blue, C literal black, D live dark1, E red, sizes and marker. Schema omitted/true/
false availability branches and actual referenced definitions have regressions.
This restores the represented definition; DXF colors are materialized using the
existing tint helper, with no measured native pixel-color equivalence or live
DXF theme-binding claim. The earlier 26 narrow direct-font checks are not
presented as a complete WPS table roundtrip pass. Retained output SHA-256:
`577b208be526675af62f1e8c0f5e362a81b32178273816ca3128e14d5580f3fb`.
Evidence is in `wps-table-style-default-import-20261010`.

Earlier XLSX production `5a7f2fa7feba84e5f32d38b2c46783a7c9fab0c8`, including
the unstyled-import fix at `6765d70`, passed 748 tests in 69 files.
The earlier combined run at `2a4a63742afc3827e9bff7776d6f47ce339eeb60` passed
2,572 Core and 63 acceptance-tool tests; at the earlier XLSX-only checkpoint the
Core source was unchanged and the actual
140 executed Core JS files retain runtime digest
`22072e1126982643d95ccf86b7794cdc3a53380d5ff3e420fffb361c9b294541`.
Those earlier suites were not rerun for that XLSX-only change. The frozen
schema-3 checkpoint `7181c6ac2564dec0631622758e93915974e678ff` has 308 checks
and 12 workbooks; it is historical evidence of its own source, not a new run of
the later font fixes. The separate whole-workspace boundary check still reports
125 pre-existing diagnostics.
These counts do not establish application fidelity or whole-project CI success.

## Excel for the web

- The production table/filter/pivot fix passed native open without repair,
  structured-formula edit/recalculation, ordinary and independent sum/average/count
  pivot refresh, filter clear/reapply and full close/fresh reopen. Its concrete
  fixture SHA-256 is `d6aec64d6c168741b5490ee85659dfd60dbbfa01dd3efc97c26094bb9698877e`.
  All 23 uncompressed parts match the newer schema-3 data fixture; the distinct
  newer ZIP container was not silently relabelled as the GUI-tested file.
- The production validation fix rejected 11, accepted 10, and repeated the
  rejection after save/full close/fresh reopen. Tested minimal fixture SHA-256:
  `387af7be1e8752efc64f9fe60445c4a3d459c1724dd59154319d3bf3cd6642bc`.
- Formula, geometry, protection, 1904-date and focused style/number-format edits
  also survived save/full close/fresh reopen. These were key checks, not every
  individual control in the workload.
- Imported floating images initially rendered but were not visible after
  save/fresh reopen; the in-cell image and marker edit persisted. The historical
  floating-only and WPS-producer controls' retained reopen PNGs are blank, so
  corrected records distinguish transient observations from durable proof.
  Later native-authored and strict paired probes below have nonblank screenshots
  and actual saved bytes. They establish neither wholesale XML deletion nor a
  general lack of over-cells support in Excel web.
- The historical cache-free iterative formula `(B3+1)/2` displayed `#VALUE!`.
  The later bounded genuine-cache production fix passes edit/recalculation and
  save/full-close/fresh-reopen below; the old file is not relabelled as passed.
- Table-header text remains black against a dark fill in native and isolated
  worksheet-order-corrected baseline diagnostic files. No semantics-preserving
  production fix had been established at the frozen production checkpoint.
  The later default-font repair restored default and size-only headers; the
  equal-to-Normal literal RGB behavior led to the user-approved reset rule above.
  Its focused new actual-app verification passed as recorded above; the
  observations below remain historical and attached to their original source.

## WPS desktop

Application: official Linux WPS Office `12.1.2.29182.AK.preread.sw`.
The user approved both displayed agreements and the explicit acceptance completed
at 02:06 UTC. Native source originals were preserved; edits used isolated copies.

- Table formulas recalculated E2/E7 from 200/400 to 300/500 after C2 40→60.
  Ordinary pivot totals became 60/60/120; repeated-field sum/average/count became
  120/30/4. Filter clear/reapply and save/close/reopen passed without repair or
  save warning. Saved data SHA-256:
  `cf1b40d8396014e5dd004841b9070f327bb1221d1630bc9f1903fac30a832e27`.
- Validation rejected 11, accepted 10 and still rejected 11 after save/reopen.
  Saved validation SHA-256:
  `2bf06537cf18df8d8a23d474f5ec949d02318bbad8cb12cbedd46ca1cdd2c0ed`.
- Both in-cell and floating images persisted after marker edit, save/close/reopen.
  Saved image SHA-256:
  `65fddc95ba053d56eac20f8bb69729d2e644a6d099cd0b3b6a024c805f67f302`.
- Locked-cell edits were blocked, unlocked 12→14 and dependent 24→28 persisted,
  and serial 1 under the 1904 date system remained 1904-01-02 after save/reopen.
  Saved protection/calculation SHA-256:
  `bb8da39b9b383778a00c2dfd2b5b6ad804db0422c711f3f33f69148778973e50`.
- The historical iteration sample produced a circular-reference diagnostic and value 0 on
  open and reopen. The saved formula remained `(B3+1)/2`; WPS removed the source
  `iterate`, `iterateCount` and `iterateDelta` attributes from `calcPr`. No global
  calculation settings were changed.
- Geometry merge/hidden rows and columns/freeze/formula recalculation and four
  style sheets received one focused key sweep. Both files were natively saved;
  styles had no content edit. Neither received a full close/reopen check. Print preview could not open
  because WPS reported no installed printer. No printer or setting was added.
- The same dark-header/black-text issue occurs in the frozen WPS production
  fixture. A later candidate restored live table-style inheritance; see below.

Actual WPS data reimport through public Sheetcraft APIs passed formula values,
filter criteria and pivot-metadata presence, but **not lossless roundtrip**.
WPS removes the private row-visibility provenance extension: after import,
clearing the filter removes derived visibility but can retain the overlapping
manual-hidden row. Genuine manual/outline hiding must not be blindly discarded.

## App-authored table-font diagnosis

The target applications' own smallest synthetic tables retain size-only 13-point
headers while their font color and boldness follow table-style changes. Actual
WPS dark, Clear/None and named-light saved packages were obtained and parsed.
Its default font and size-only font differ only in size; named-light changes
table differential styles without pinning white into the direct font. Clear/None
has no `tableStyleInfo.name`. The reader's invented Medium2 in that case was
fixed and covered by 30 focused tests at local commit
`6765d700026a3237ab8325465b1d82b355783791`.

A Theme1-only change did not fix the product header. The next single-factor
candidate instead cloned the product's own Normal font, changing only size to 13. Normal11, table differential styles and all other package parts stayed
unchanged. Both applications then showed white bold13 on dark, changed to a
genuinely named light style, saved, closed and freshly reopened successfully.
WPS defaults changed to blue while a palette-explicit black C1 remained black;
Excel's Light1 used black defaults, with the explicit override distinguished on
the prior dark stage. Formula values 24/12/21/57 and geometry stayed unchanged.

The earlier candidate SHA-256 is
`ef1c918cf080ef0bc811ba14a62516c4ac28d1dd1241b1bbe2ae639961e4b551`;
the actual WPS-saved copy is
`41d2ad9d639bc156aefdab1c033ea9f4a14d1bed77325e67f0e79333eb16a61e`.
Eleven nonblank safe screenshots and the saved-byte inspection are retained.

The resulting production fix completes fonts with no explicit color from the
unchanged Normal base and preserves explicit RGB/theme representations. A narrow
own-producer roundtrip guard recovers only the canonical projected default color;
it is structural provenance, not authentication. Foreign/WPS-resaved equal-color
provenance is not globally normalized. Ten new font regressions cover direct
color intent, repeated export and guard exclusions; the full XLSX suite passes
748 tests including the five new unstyled-import regressions.

The public-Core final fixture SHA-256 is
`98606385fbb20daca8da559abab2e86a90b827ab7221e70953fc4115590e0d7d`.
Its public encode/decode/encode archives are byte-identical, including all nine
parts. In both applications the initial default13 and size-only18 controls show
readable white bold headers; explicit Theme1 black and explicit RGB red retain
their colors. The exact literal RGBblack C1 does **not** override the header,
despite having a distinct stored font. On WPS named-light it follows blue rather
than staying black. WPS's own More Colors / Custom RGB0/0/0 / HEX000000 operation
also follows blue and its saved bytes merge C1 into the default font. This is an
observed same-Normal-environment compatibility boundary, not proof that every
possible OOXML representation is incapable of an explicit same-color override.

The actual WPS production-saved package SHA-256 is
`3e7b52aebc85b0237c671a22353b0ab6fdca7c118ee993738439602bf9d80519`;
the separately saved native-custom-RGB control is
`ca93bb1de3426ae1b2b2188603f2d3d563955c51586443304e79ecda5b0b532c`.
This production checkpoint does not change Normal or substitute an indexed or
theme color. The later fixed-RGB diagnostic below remains candidate-only.
Core's implicit text fallback is fixed RGB, not a live dark1 binding, so changing
literal RGB to a theme binding is not assumed semantics-equivalent. Final
production named-light/save/full-close/fresh-reopen completed in both apps:
default13, size18, Theme1 black, red and values 24/12/21/57 persisted. The thirteen
nonblank safe PNGs, two WPS saved packages and corrected observation records are
retained in `table-header-production-gui-20261010`. Excel-saved downloaded bytes
remain unacquired; on its Light1 default and explicit black are visually equal,
so that stage cannot independently prove the literal override. The dark-stage
failure prevents claiming complete table-font fidelity. New documents/tabs were
safely closed after recording results.

### Historical fixed-RGB Core-default base diagnostic (before reset decision)

Public-Core ordinary default and size-only cells resolve the fixed fallback
`#20242c`, whereas the current XLSX Normal/default-derived fonts store
`FF000000`. Direct `#20242c` is also retained as explicit Core style and overrides
a dark table header. A single fresh public-Core diagnostic changed only Normal11
and its implicit default13/size18 fonts to `FF20242C`; geometry, explicit fonts,
table DXFs and other ZIP parts were unchanged, with an exact inverse proof.

This candidate **failed the regression guard in WPS**. Its explicit RGBblack C1
became correctly dark, but explicit Core-default RGB F1 became inherited white.
The unchanged baseline F1 was dark, with WPS's native color dialog confirming
HEX `20242C`. Thus moving the base merely moved the same-Normal override defect
to another genuinely explicit color. Four actual nonblank safe JPEGs are kept
in `core-default-color-base-gui-20261010`. No table-style edit, save/reopen or
Excel test followed this newly observed regression; no production change was
made. This is not a proof that every representation is incapable of the intent.

The immutable pair and source/runtime/inverse proofs are retained in
`core-default-color-base-control-20261010`. Its unchanged-production-reader
import also materializes the new implicit base as direct color because the narrow
own-producer guard currently recognizes the old black base only. Any eventual
base repair would need corresponding narrow reader handling and legacy own-file
support, rather than treating this diagnostic as a successful roundtrip.

[The short font-intent diagnosis](font-intent-diagnosis-20261010.md) separates
the ordinary default-color mismatch from repaired inheritance and the open
literal-versus-reset contract. No product-semantic change is assumed.

## App-authored floating-image diagnosis

At the user's request, Excel web created a new blank synthetic workbook and
inserted a 160×96 checkerboard using **Place over cells**, not the in-cell option.
Its marker and floating picture survived a saved state, full tab closure and
fresh reopening. The actual OneDrive-download package is 8,688 bytes, SHA-256
`62a1fd774f8b206cc81f2ac35b78271d27e26bfa3d4166b8b424aa6fb036d667`.
It uses `twoCellAnchor editAs="oneCell"`. Excel reencoded the 355-byte source PNG
to 418 bytes, with identical decoded RGBA pixels. Nonblank actual screenshot
buffers, relationships, hashes and safe identity records are retained in
`excel-authored-floating-20261010`. Thus Excel web can persist its own floating
picture in this session; a universal unsupported-feature claim is incorrect.

The historical imported floating-only workbook was separately downloaded,
without reopening or editing it. Its 7,379-byte saved package, SHA-256
`2d28025cce6ab25239f8e9446ffb56f99ce9c8137becd4ca3e75f1b26fa72ae3`,
retains B2=1, the complete worksheet/drawing/media chain, a `oneCellAnchor`, and
the original PNG bytes. It does not prove or upgrade the old visual observation.

A fresh public-Core baseline and a candidate changed only the anchor form;
the picture subtree, transform, IDs, original PNG and ten other ZIP parts stayed
identical, with an exact inverse ZIP proof. Both initially showed the image,
saved A1=2 and then reopened without a visible image in nonblank screenshots.
Their actual saved packages retain A1=2, media and drawing relationships:
baseline SHA-256 `e341e0fa0e9752cb3c41b6a2cf08dbd3bc35ea949a4a634c3ab46763666989a1`;
candidate SHA-256 `f898d0c920d30d3f3aa16debbc0ef3d92f4e99458b509f2d03c4fdea6a4d92d8`.
The candidate also retains `twoCellAnchor editAs="oneCell"`. Anchor form alone
was therefore insufficient in this pair; production was not changed.

The next single control reuploaded the proven Excel-native exported package
unchanged as a new synthetic workbook. It initially displayed the picture and
saved the marker with `_REUPLOAD` appended. Full tab closure and fresh reopening
of the same file identity showed the saved marker but no picture, including a
second settled view about 30 seconds after navigation with no loading indicator.
Its actual saved package is 8,670 bytes, SHA-256
`da00389043e6d843ee8c181c8e722c3662fbd807887ab72701edf9ff5db432b8`.
All 14 parts remain. Drawing XML, creation ID, anchor, transform, PNG and both
drawing/image relationships are byte-identical to the native original. Workbook
compatibility extensions and properties are unchanged; revisions, selection,
shared-string marker and ordinary document metadata account for the differences.

This reproduces a native-creation versus upload/load-path distinction in this
session, including an Excel-authored package. It does not identify the internal
mechanism or prove a universal platform limitation. The visible-image failure
remains unresolved, but these bytes do not support a native-only drawing defect
or deletion. No further attribute matrix or production change follows this
checkpoint. Actual packages, nonblank safe screenshots and records are retained
in `floating-anchor-control-gui-20261010` and
`excel-native-reupload-control-20261010`. Stage 1 remains open.

## Iteration classification

The user authorized temporary WPS iteration 50 / 0.0001 with restoration.
Native WPS +1 and +2 synthetic formulas genuinely recalculated, saved and
survived document close/fresh reopen. The original unchecked / 100 / 0.001
setting was restored and visibly confirmed. Its native saved file also passed
actual Excel formula edit/recalculation/save/fresh reopen and supported download.
This replaced the earlier cancelled, unchanged-options investigation; the old
records remain historical evidence.

The three-factor Excel comparison isolates first-load initialization: cache-free
baseline and `ca=1` only both produce `#VALUE!`; a genuine Core cache alone loads
numerically and advances beyond the cached value. The production fix writes only
residual-qualified finite Core results from a coherent export-owned snapshot.
Unsafe closures, stale bridges, disabled iteration and nonconvergent values stay
uncached and reported. No `ca`, source rewrite, solver, synthetic value or policy
change was introduced.

The final clean public-production sample passed real +2 recalculation, saved
state, full document/tab close, fresh reopen and actual saved-byte inspection in
both apps. Excel works with the imported policy. In the observed WPS build,
iteration-disabled edits return 0 in both product and WPS-native files; first
cache display is not recalculation proof. Actual convergence requires enabling
its application iteration preference. The approved temporary setting was
restored again after final validation; the export does not override app settings.
The exact input, actual outputs, UI-edit caveat and remaining cache boundaries
are in the [focused checkpoint](iterative-caches-20261010.md).

- [Microsoft ExcelScript Application](https://learn.microsoft.com/en-us/javascript/api/office-scripts/excelscript/excelscript.application?view=office-scripts)
- [Microsoft iteration API](https://learn.microsoft.com/en-us/javascript/api/office-scripts/excelscript/excelscript.iterativecalculation?view=office-scripts)
- [Microsoft recalculation guide](https://support.microsoft.com/en-us/excel/change-formula-recalculation-iteration-or-precision-in-excel)

## Evidence and publication boundary

Actual observations, safe worksheet screenshots, source/working-copy hashes and
WPS saved bytes are retained separately from frozen machine originals. Library
milestone backups include recoverable source and evidence; a backup version is
reported only after upload and actual retrieval verification.

The latest verified remote checkpoint remains
`b4c1b59b2f54f0c537ed967069406cf761a786f1`; later local commits have not been
pushed while the earlier publication cancellation remains unresolved. No merge,
release or deployment has occurred. Later insertion/package/toolbar stages do
not become accepted merely because the machine checks pass.
