# Ordinary native clustered horizontal bars — 2026-10-10

Parent `7111852c606bad20c165334aa1242b673b799186`. This is one bounded existing-
feature native I/O slice, not all bar variants or completion of Insert. No Core/Web
production model, commands, UI or snapshot version changed.

## Actual native producer

WPS Linux 12.1.2.29182 opened the synthetic Data!A1:C4 region/apple/pear seed with
60/70, 100/80 and 120/90. Select the used rectangle, Insert → Chart → Bar → first
Clustered Bar. Saved native producer was 13,776 bytes. Actual XML has barDir bar,
clustered grouping, category-left/value-bottom axes, minMax orientations,
autoZero crossings, crossBetween between, gapWidth140/overlap-40, bottom legend
and gap missing-point behavior. Actual categories are south/north/east top-to-
bottom: the first source category is bottom-most, matching the existing Web axis
contract. XML series order remains apple/pear; native visual legend is pear/apple.

Delete C3 and change B3 100→111. WPS immediately shows the longer north/apple bar
and absent north/pear bar. Save/close. Public native decode/reencode recovers one
live ordinary bar for both original and edited producer, correct 100 or 111 and
missing source, references and expected style/dimension warnings, without feature
omission or cached-text normalization. Excel first-open of the actual edited
native public reexport shows 111 and absent pear/north bar, with no repair prompt.

## Formal product matrix and save/reopen

The public `bar-options` helper generates C-11 through R-00: both series directions
crossed with the two independent header flags. Numeric data is row*10+column,
except genuine missing C3; enabled headers alone retain text. B3 initially21.

Actual WPS and authenticated Excel web both render all eight configurations. Each
sheet B3 21→41 changes its live bar, with correct category/series labels and absent
missing bars, no PivotTable Refresh. Each app saves, closes to Home, reopens from
Recent and individually displays all eight retained41 charts with names/order,
direction and header roles intact. Excel reports saved state and no repair prompt.
C-01's first immediate screenshot preceded asynchronous repaint; its later actual
reopened chart showed41 and is the retained-value evidence.

The unmodified WPS-saved file public decode/reencode recovers all eight at41 with
no omission or cache normalization. Excel separately first-opened the formal
reexport's representative C-11 and R-00 with their41 bars, names/order/axis roles
and missing bars intact. This is distinct from the eight-sheet save/reopen cycle.
No saved Excel download bytes were obtained or claimed.

Existing cloud Chrome test tab and WPS window were reused and test documents
closed to Home. No new login, legal agreements, sharing, settings or session backup.
New native/saved XLSX, raw XML, producer JSON and screenshots stay local. Git
contains ordinary source/text, synthetic structure regressions, helper and logs.

## Checks preserved

Evidence `evidence/native-bar-chart-20261010/`:

- Focused six files: **248 passed** (37 new bar scenarios plus prior line/column/
  linked chart checks). Eight configurations retain Core snapshot and repeated
  public roundtrip/live111 behavior. Presentation flags and empty names/labels,
  missing/negative/zero values and known safe/package boundaries are covered.
- Full XLSX after final production source: **79 files / 1,120 passed**.
- XLSX package types/build, strict public helper types, scoped lint/format and
  diff checks passed. No unit/static failure or real post-save discrepancy arose
  in this phase; earlier phase failures remain in their own logs.
- Architecture aggregate still fails: **125 baseline/current diagnostics**, with
  zero additions/removals against711185. Full repository CI is not asserted green.
- Core/Web full suites/types were not rerun for this I/O-only change; earlier
  results remain historical. Prior read-only existing chart-contract inspection
  informed the bounded axis mapping; no new adversarial PivotChart review.

Limits remain finite numeric/genuine-blank, single-sheet rectangular, unstacked
horizontal clustered bars with proven axes. Text zeros, richer axes, stacked bars,
linked horizontal charts and other native families remain omitted or blocked.
Styling/native reverse legend layout is explicitly different, not claimed lossless.
