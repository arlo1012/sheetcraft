# Ordinary column direction/header continuation — 2026-10-10

This bounded development checkpoint extends the existing ordinary clustered
column I/O slice after `de864504e39e2eab95283f523ce253197b60599f`.
It covers existing Core/Web configuration, not new chart families or whole Insert.
No Core production semantics, snapshot model/version or editor command changed.

## Source semantics and implementation

The eight configurations are both `seriesBy` directions crossed with the two
independent header flags. Both flags trim the corresponding source row/column.
For columns, headerRow supplies series names and headerColumn supplies categories;
for rows those roles reverse. Disabled labels remain Core's compact 1-based strings.
Enabled empty and duplicate labels do not gain a fallback name. Nonfinite or
nonnumeric values remain missing points; real zero remains zero.

The writer emits horizontal/vertical references for the exact rectangular source.
Disabled series headers use exact quoted string references `"1"`, `"2"`, …;
disabled category headers omit `cat` and use indexed categories. The importer
requires exactly one of the eight configurations to prove all references and
caches. It does not guess ambiguous headerless 1×1 orientation, or rename a native
default `Series1` into Core `1`. No private metadata was added.

Sparse WPS label-cache points are admitted only where the actual source proves
the corresponding empty label. Shared PivotChart text-cache validation remains
strict. Ordinary and linked ownership/refresh remain distinct.

Web row-direction header captions were corrected to their existing actual roles;
tests prove all eight checkbox configurations are emitted unchanged. Renderer
coverage keeps empty/duplicate labels and all-missing series without zero-filling.

## Actual producer work (local-only files)

Real WPS Linux 12.1.2.29182 was used in the dot cloud desktop. Existing authenticated
Excel web was reused in the same Chrome test tab. No sign-in, agreement, settings
change, sharing link, cookie backup or additional screenshots upload was involved.

1. Copy the earlier synthetic native column producer, use Chart Tools → Switch
   Row/Column and save. WPS stores three row-oriented series with names A2/A3/A4,
   categories B1:C1 and values B2:C2 / B3:C3 / B4:C4. Public decode/reencode retains
   row direction, both header flags, names/order and values.
2. Create a 2×3 data-only numeric sheet `10 20 30; 40 50 60`, insert the first
   clustered column option. WPS chooses row series with absent names/categories;
   its default Series1/Series2 naming is deliberately not claimed as supported.
   In Select Data → Edit Series, explicitly enter names `1` and `2`, then save.
   Actual WPS XML now uses quoted string references and absent categories. Public
   decode/reencode retains row direction and both disabled headers without guessing.
3. In the row producer clear A2, B1 and C3. WPS retains an empty series label,
   a sparse blank category point and the genuine missing numeric point. Public
   decode/reencode retains empty labels, ordering and the missing value.

These new native/saved XLSX files, raw XML, parsed producer JSON and screenshots
remain local. This checkpoint contains ordinary text observations, source tests,
the reproducible synthetic fixture script and owned check logs. Recreate producers
from the recipe after reset; no new binary or account session is a dependency.

## Formal product and double-app acceptance

Run the public-entry `create-native-column-chart.mts options` mode after building
Core/XLSX. It creates C-11, C-10, C-01, C-00, R-11, R-10, R-01, R-00 on identical
A1:C4 sources: region/apple/pear; east 60/70; north 100/80; south 120/90.
The digits are headerRow/headerColumn. Initial product length was 25,511 bytes.

Actual WPS and Excel web each opened all eight formal product sheets, with their
own expected names/categories/direction. Each sheet's B3 was changed 100→111:
the ordinary chart updated immediately without PivotTable Refresh. Save, close
to Home, reopen through Recent, and view all eight retained 111, direction and
label order. Excel showed saved state and no repair prompt. Excel saved download
bytes were not obtained and are not part of this evidence.

### WPS numeric text-cache discrepancy and bounded adaptation

On actual WPS save, nonnumeric text referenced as values becomes cached zero.
The initial strict public import retained only the two both-header charts. A local
single-factor control removed only 22 zero cache points whose actual referenced
source was nonnumeric text; all eight then recovered. That diagnostic control
also rewrote namespace prefixes and ZIP directory entries, so it is not presented
as formal product output.

The actual unmodified WPS-saved formal product was subsequently decoded/reencoded
by the final public API: all eight configurations and 111 values survived, with
six explicit `chart-cache-normalized` warnings and normal style/dimension warnings.
This exception requires an exact proven reference, Core missing point, actual
nonempty nonnumeric literal string, cached zero and disabled value labels. Real
zero, empty/whitespace strings, booleans, numeric-looking text, formulas/errors,
wrong references and displayed value labels cannot use it. Core restores missing;
the WPS saved native zero and Core gap are a disclosed visual difference, not a
lossless-fidelity claim. This actual public reexport was then opened in Excel web:
all eight charts rendered at 111 with the correct direction, names and categories,
saved state and no repair prompt. This was first-open proof, not another edit/save
cycle. The initial product GUI, public post-save proof and reexport GUI are separate
evidence. Test views were closed back to both app Home screens.

### Empty labels and genuine missing numeric cell

`options-blanks` makes B1/A2 empty strings and C3 a genuine missing value; the
initial product length was 25,361 bytes. Actual both-header C-11/R-11 charts in
both apps show empty legend/category labels without synthesized names and no bar
for C3. R-11 B3 100→111 updates immediately and is retained after save/reopen.
WPS C-11 retains its unchanged 100 and blank/missing behavior after reopen.

The actual WPS-saved blank matrix public import retains those two both-header
charts. Its other six charts expose an empty-string source as a cached zero when
a corresponding header is disabled, and remain conservatively omitted with six
located `feature-omitted` warnings. Genuine missing C3 cache points are still
omitted, not zero-filled. Worksheet cells survive. The regular all-eight
product/snapshot roundtrip and both-header blank-label cases are covered by direct
synthetic tests; the generated blank matrix also passed the public product
roundtrip. All-eight WPS post-save blank-matrix
support and lossless blank-vs-zero visual fidelity are **not** claimed.

## Checks and preserved failures

Owned logs are under `evidence/native-column-options-20261010/`.

- Initial focused run: 120 pass / 1 fail from an obsolete unsupported-option
  assertion; an initial package-cwd path mistake also prevented test file creation.
- Second run: 146 pass / 1 fail from a new mutation targeting chart title rather
  than series name. Fixture corrected, without widening admission.
- Third run: 4 files / 147 tests passed, before the WPS text-cache adaptation.
- Initial full XLSX: 77 files / 1,019 tests passed, before that adaptation.
- Final focused XLSX: 4 files / 159 tests passed, including wrong references,
  ambiguity, empty/whitespace/numeric text, booleans, errors, formula results,
  numeric zero and value-label boundaries.
- Final full XLSX: **77 files / 1,031 tests passed** after final production code.
- Core chart-data focused: 1 file / 11 passed; no full Core suite rerun in this
  phase. Earlier 2,621 Core passes remain historical evidence only.
- Web chart focused: 2 files / 21 passed; full Web suite and actual Web editor GUI
  were not rerun. Full Web typecheck passed.
- XLSX types/build, strict reproduction-script types, scoped lint/format and diff
  checks passed; see final static log for exact commands.
- Aggregate architecture check remains failed with **125 existing diagnostics**;
  exact normalized comparison against de864 adds/removes zero. This includes old
  lexical history diagnostics and actual old Web adapter issues; not all green.
- No new independent adversarial review. The earlier stopped PivotChart review
  remains incomplete and was not repeated.

No full repository CI, merge readiness, all-chart support or all-insert completion
is asserted. Next bounded work can close the empty-string WPS cache boundary from
actual source evidence before moving on to existing line/bar chart types.
