# Existing icon and equation lifecycle — 2026-10-11

Baseline `f6681287b3aaa902252d847f8a6ef7e222668eb7`. This slice uses the existing
fileless icon and equation entries only. Icon retains the fixed nine-shape editor,
default star at80×80 and text overlay. Equation stores literal LaTeX source and
renders it with existing KaTeX; it is not a cell calculation formula. No catalog,
SVG assets, new preset, native exchange, model or snapshot version was introduced.

## Local production fix and unchanged lifecycle

Equation had three appearance fields with no renderer consumption: fill, outline
and line width. Their editor row is now hidden for equation, as already for
WordArt. The equation's generic Bold/Italic switches were also ineffective: an
actual `x^2` comparison checked both KaTeX root and real letter/number glyphs
before/after toggling, with identical family/weight/style/size. Its container
changed but KaTeX's inner reset and glyph classes cut off that inheritance.
Only those equation switches are hidden. Existing nondefault stored values survive
confirmation unchanged, and icon/text box/WordArt controls retain their behavior.
LaTeX `\mathbf{A} + \mathit{B}` still renders A at700 and B italic, proved in
actual final GUI. This does not claim that all mathematical glyphs default to a
normal font or that LaTeX formatting commands are ineffective.

The shared instance guard needed no production change. It already binds dialogId,
workbook/generation/sheet and existing-object reference. New coverage proves the
concrete icon/equation editor retains local fields and its instance on refused
execution, retry succeeds, cancel discards draft, and same-ID reopening detaches
old callbacks. Actual Core history tests prove unchanged confirmation legitimately
returns false and closes without extra history, changed edits are one transaction,
Undo/Redo and public snapshot deserialization are exact. Existing busy, protection,
reentrancy, object replacement and scope-disposal tests also ran.

## Serial checks, including original failures

Evidence: `evidence/icon-equation-20261011/`.

- web-baseline.log:1 product failure/4 passes, plus2 TDesign autosize teardown
  harness rejections. The unmounted unattached Textarea fixture was corrected
  with the established Textarea stub; real GUI later exercised the real textarea.
- web-baseline-corrected.log:1 product failure/4 passes, no unhandled errors.
  Three equation color inputs were present where only the consumed color should be.
- web-final.log:6 files/78 passes after the appearance-row fix.
- font-controls-baseline.log:1 product failure/5 passes; unused Bold remained.
- web-final-font-controls.log:6 files/79 passes against final production code:
  all sheet-drawings tests and actual Workspace insert entrypoints.
- core-drawings.log:23 existing Core drawing/history/structure/snapshot passes.
- native-omission.log:4 passes, adding icon/equation to existing located omission,
  source nonmutation, ordinary-cell retention and no invented import objects.
- scoped-static(-final).log:all4 changed source/test files format and lint exit0,
  source whitespace clean.
- web-types-build(-final).log:full Web Vue/Node types and production build exit0.
  Existing minified-chunk>500kB warning remains; full repository CI/bundle limits
  and whole native suite were not rerun.

Runner clocks use their environment timezone; GUI times below are UTC. No parallel
heavy tests/builds or heavy checks during GUI. Independent read-only diff review
found no blocking change; it did not run additional checks.

## Actual isolated product GUI

Cloud Chrome production preview bound only127.0.0.1:7200. New synthetic Sheet6 was
added to the already backed-up six-sheet test workbook; no Replace/import/reset.
All earlier six sheets remain structurally identical to the prior Sparkline final
public export. Only one own test page was open at a time.

Icon phase07:02–07:04 UTC: canceled new name/text/heart choice; fresh reopen reset
all defaults. Committed heart with literal `Icon <>&`,120×90,rotation15. Creation
Undo removed it and Redo restored the exact JSON. Existing edit Escape discarded
text. Explicit edit selected star, changed name/text/fill#abcdef/outline#123456/
width3. Edit Undo/Redo compared byte-identical full snapshots.

Formula switch observation07:04–07:05: actual root and glyph comparison is in
`glyph-style-observation.txt`. A preliminary read returned[] before the async
component settled; the corrected visible-node comparison proves the result.
Observation drafts were canceled, pages/preview closed before final code/checks.

Final phase07:07–07:10: equation creation Cancel discarded malformed source/name.
Committed `\frac{a}{b} + x^2` atD4,300×140,font28,color#654321,rotation10; real
fraction/superscript appeared. Creation Undo/Redo was exact. Existing malformed
LaTeX draft showed safe `.katex-error`; Escape restored original source. Edited to
`\mathbf{A} + \mathit{B}`,320×160,font32,rotation-5; actual styled A/B appeared.
Edit Undo/Redo, Save locally and ordinary reload were byte-exact. Reopened both
objects after reload: all committed fields retained, equation's five inert
switches absent, icon's effective appearance/font switches retained.

Two GUI harness issues are retained in gui-receipt.txt: a download helper captured
an already closed own tab, and a DOM role-table locator did not match the actual
canvas worksheet. Neither was a product failure or crash. Fresh actual AX/DOM
inspection and explicit current-tab helper completed the public comparisons.
Own pages and preview were closed. No own Error9; oom_kill stayed25 throughout.
This does not establish the cause or resolution of earlier Chromium crashes.

## Persistence evidence and native boundary

All16 public JSON exports and one XLSX remain local; none uploaded. Exact groups:

- icon-created/creation-redo/canceled-edit/edit-undo:32,625B SHA256
  `4eceaf7d698e239543a3a37754494618489d2a9a98d33a0e3713a42041a4a6b7`
- icon-edited/edit-redo/equation-creation-undo:32,628B SHA256
  `1b8b8cae7dd19c08dc01f3031ec526c3f4f6a7db4f7cff414f71123f68bbcb84`
- equation-created/creation-redo/canceled-edit/edit-undo:33,258B SHA256
  `c06a269a112677b3cdcf3b1afa8ca9c6be196eff1b75e4c86ce6065925deb749`
- equation-edited/edit-redo/before-reload/after-reload:33,262B SHA256
  `1c1c2211965106400c0e0578e09532dac62d5afe257a74c013b3af3bea4f6df5`

Actual GUI XLSX8,453B SHA256
`54e89f3394613c7f366e9fb28e753ffbf314e3a4e1ce599caca5b6981ad93027`,
15 ZIP parts, no drawings/charts/media. A fresh native API encode of the actual
final public JSON reports feature-omitted count5, including both new objects with
located Sheet6.drawings IDs, and leaves the source snapshot unchanged.

Important correction: those warnings exist in the native API report. Current Web
export checks blocking issues but discards warning issues and reports generic
success after download. This slice does **not** claim the GUI warned the user of
omission. That visibility defect is the next bounded repair, separate from the
verified object lifecycle. Native icon/equation Excel/WPS round-trip is unsupported
and was not attempted. The existing formula hint also interprets `{a}/{b}` as i18n
placeholders; recorded, not changed here.

Stop at this bounded existing lifecycle. Whole Insert, more file objects and all
native graphics remain separate work; see the current Insert matrix.
