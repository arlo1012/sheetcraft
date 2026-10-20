# Short native chart rendering, 2026-10-20

## Fixed scope

The ordinary native line fixtures at 320 × 200 and 640 × 200 px, including a
WPS-saved short copy, previously failed before ECharts rendering. Both 16px axis
titles left a valid 92.8px plot, but the Web title planner unconditionally required
96px. The error also affected the shared print option path.

The title planner now retains at least half the pre-title plot span on constrained
axes, capped at the existing 96px budget and floored at 1px. It does not remove
validation: oversized and multiline titles that consume the plot still fail.
The existing grid offsets, fonts, title content, rotation and axis values are not
changed. Ordinary sizes retain the previous 96px threshold.

Actual browser verification caught a second issue that SSR fallback text metrics
had hidden: the mixed-language horizontal title measured 193.84375px, just beyond
the old 192px (60% of width) cap. Newly admitted compact charts now give centered,
axis-parallel names the space around the final grid midpoint, with a 4px edge
inset. The perpendicular title strip remains unchanged. Oblique/perpendicular
names and caller-specified containment/outer-bound layouts retain their existing
budgets. This is a bounded native-fixture repair, not a general manual-layout
implementation.

## Real application verification

- In the production Web UI, imported the 320 × 200 native XLSX and reloaded the
  saved document. Both complete titles rendered at their original 16px typography.
  DOM bounds confirmed both titles were wholly inside the SVG.
- Dragged width from 320 to 640 while retaining height 200, undid to 320, redid to
  640, then dragged back to 320. Each state retained the complete titles and plot.
- Exported the resized workbook through the actual Web File menu, then reopened
  that download in WPS at 100%. WPS showed the complete native chart and titles
  without a repair dialog.
- Separately opened 320 × 200 and 640 × 200 product exports in WPS, saved copies,
  and decoded/re-rendered the saved XLSX files. Dimensions and title typography
  survived. The existing reported OOXML omissions remain disclosed.

See [browser UI measurements](evidence/native-short-charts-20261020/browser-ui.json),
[WPS readback](evidence/native-short-charts-20261020/wps-readback.json), and
[native SVG results](evidence/native-short-charts-20261020/final-short-svg-results.json).
The earlier diagnostic input fixtures remain in
[evidence/native-auto-axis-20261020](evidence/native-auto-axis-20261020/).

## Regression and validation coverage

Focused tests cover original and WPS-saved native import, SVG title containment,
unchanged default/explicit axes, native export/readback, repeated resize,
undo/redo, snapshot restore, explicit percentage offsets and top/right placement,
wide-glyph compact names, oversized-title rejection, and Canvas print at 200px
logical height with density 2. Explicit bounds/major-unit persistence is tested
through snapshots, not a claim of newly supported native XLSX export.

The bounded 11-file chart aggregate passes. The full unbounded Web chart run was
terminated by resource pressure (exit 137), so no full-suite pass is claimed.
The four unrelated failing files seen before termination were rerun serially:
both current source and the original f055089 baseline produced the same
75 passes and 15 failures. The exact failure groups are preserved in
[baseline comparison](evidence/native-short-charts-20261020/baseline-failure-comparison.json).
Final check counts and source hashes are recorded in the adjacent evidence.

## Deliberately unresolved

This change does not implement WPS automatic-axis bounds, headroom or tick rules.
The short samples still differ: Web 0–120/20 versus WPS 0–150/50. The narrow
118–120 sample's WPS 117–120.5/0.5 behavior also remains unresolved. No explicit
bounds were added or hardcoded to disguise those differences. Data-table-specific
96px readability safeguards remain unchanged.
