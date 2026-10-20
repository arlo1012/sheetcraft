# Chart Type / Combo owner selection — 2026-10-20

## Scope and diagnosis

Six `source-workspace.test.ts` cases stopped at obsolete chart-category Select
controls. The current dialog uses `ChartTypeNavigation` buttons; per-series Combo
Selects are in the Select Data substep, reached through the actual button and
returned from with Back to chart preview. The harness now follows those controls
rather than adding removed selectors or bypassing component events.

Once the real controls were exercised, native Combo option pointerdown exposed a
product bug: the teleported popup was outside the dialog and had no chart-owned
popup marker, so `SheetDrawingLayer.clearOutside` cleared the selected drawing.
Independent cloud-browser reproduction showed chart handles and Chart Tools
vanishing and Home becoming active. Back and OK still committed the Combo in the
observed case; this is selection/context loss, not a proven data-loss defect.

A second real-browser check found an independent footer path: Back, Cancel and
OK also cleared selection because the editor's built-in TDesign footer is outside
the marked content and had no dialog-role ancestor. The earlier source-step
Cancel check proved rollback, not selection retention; subsequent direct Back
and outer OK/Cancel checks isolated this loss. The harness now emits pointerdown
before click for every editor footer action, reproducing both affected assertions.

The two minimal production changes restore existing ownership boundaries:

- The Combo per-series Select supplies `chart-editor-options-popup`, the existing
  class recognized by the drawing layer for a teleported editor popup.
- The type editor supplies `role="dialog"`, `aria-modal="true"`, and an accessible
  name matching its existing Insert Chart / Change chart type heading. These are
  the same attributes already used by source, series and category dialogs, and
  cover the built-in footer/header as well as the editor content.

No global outside-click exemption, dummy legacy selector, rendering rule, source
identity, or command/history logic is changed. Genuine grid clicks after dismissal
still deselect the chart. The popup convention is unchanged; this task does not
claim new per-Workspace popup isolation.

## Regression coverage

- Type navigation pointerdown preserves the selected custom-source owner.
- Line confirmation preserves ordered source identities/colors, appearance,
  drawing placement and one-step Undo.
- Combo preview remains detached, without source promotion, new identities or
  history writes; outer Cancel preserves the exact workbook.
- Native Combo dropdown pointerdown and click retain the owner and Chart Tools.
- Every editor footer uses pointerdown then click; Insert and Change Type modes
  expose the correct modal dialog name. Genuine outside grid input still clears
  selection, and an old type-confirm callback cannot edit a new active sheet.
- Source-step Cancel rolls back range and Combo edits without closing the parent
  dialog. Back keeps those edits local, and outer Cancel discards them.
- Repeated Combo selection and Pie-to-Combo navigation preserve the local choices.
- Final Pie/markerless percentage Line do not acquire dormant Combo choices.
- Confirmation/reopen, marker and secondary-axis edits retain the correct owner,
  sibling drawing, source and exact Undo/Redo snapshots.
- A hidden first raw series remains recipe column; the next visible series is line.

All original persistence/history assertions remain. The additional integration
case covers the newly required two-step dialog route. No tests are skipped or
weakened to hide failures.

## Verification

Final checks and exact browser steps are recorded in the accompanying validation
summary. Original focused baseline is 23 passed and 6 failed; after restoring
interactions but before the production fix, four of those six passed and two
failed the newly explicit native-popup owner assertion. With that popup fixed,
adding real footer pointerdown produced two more red assertions until the dialog
role was restored. These are separately verified failure paths, not six distinct
production defects.

Final coverage is **30/30 source-workspace cases plus 7/7 dialog companion
cases**, completed in bounded processes. The 57-file coverage union is **1,459
passed, 36 failed, no unexecuted cases** across 1,495 cases. Five cases reported
pending in the first other-chart aggregate were retried separately and passed.
All six original source-workspace failures are resolved; all 36 other failed
assertions match the previous aggregate. Of those, 14 were already historically
known and 22 remain additional previously observed failures not independently
baselined. This is not a clean monolithic aggregate.

Guard-removal checks run in an isolated copy: the unchanged control passes all
15 selected cases; removing popup ownership fails three; removing dialog
ownership fails four. Scoped lint/format, six web UI contract checks, web
typechecking and production build pass. Broad web lint still fails on three
warnings in unchanged conditional-formatting tests.

The actual cloud production UI verifies both fixes, footer Back/Cancel/OK,
repeated navigation, exact source/owner targeting and genuine grid deselection.
There are 18 assertions over normally exported snapshots: nine exact whole-workbook
comparisons and nine scoped preservation/value checks. Fifteen assertions are from
the earlier popup-only build, followed by three final whole-workbook commit/Undo/Redo
comparisons from the footer-inclusive build. Final footer selection checks explicitly verify Chart Tools and all eight
owner handles, rather than inferring selection from successful data rollback.

The previous 57-file chart aggregate was 1,452 passed and 42 failed. Only these
six failures are in this task's scope. Other chart failures, the unresolved Core
range-series color-index semantics, automatic-axis work and marker feature work
are not repaired or reclassified here. No whole-repository or CI-green claim,
WPS/Excel validation, pull request, merge or deployment is made.

## Next bounded diagnosis, not implemented

Reconcile the three `design-controls.test.ts` failures at the removed
`[data-chart-confirm]` footer helper with the real TDesign dialog footer, then
execute the existing appearance-preservation, subtype normalization and disabled
confirmation assertions before deciding whether another product defect exists.
Do not add legacy selectors or weaken those assertions. No work on that next
scope is included here.

## Reproduction inputs and bounded commands

Import the [synthetic two-sheet fixture](evidence/chart-type-owner-20261020/owner-source-fixture.json)
through File → Import JSON. `Chart Owner` contains an explicit-source target and
an untouched sentinel; `Source Data` contains a rectangular chart with the same
ID as the target. Use Change chart type → Combo → Select data → the pear series
Select, then exercise Back, source Cancel, outer Cancel/OK, Undo and Redo. A cell
click after dismissal must still clear the selected chart. Check both the visual
owner context and normally exported JSON, not only the chart's appearance.

The detailed [validation summary](evidence/chart-type-owner-20261020/validation-summary.json)
records the final coverage union and retained failures. Reproduce bounded source
coverage with two disjoint selections, using `NODE_OPTIONS=--max-old-space-size=4096`:

```sh
bun run --filter @sheetcraft/web test src/tests/modules/charts/source-workspace.test.ts \
  -t 'Change Type navigation|bounded Combo|main picker and type confirmation' --maxWorkers=1
bun run --filter @sheetcraft/web test src/tests/modules/charts/source-workspace.test.ts \
  -t '^(?!.*(?:Change Type navigation|bounded Combo|main picker and type confirmation)).*$' --maxWorkers=1
bun run --filter @sheetcraft/web test src/tests/modules/charts \
  --exclude '**/source-workspace.test.ts' --maxWorkers=1
```

These filters do not add test skips to the repository. Each source case must run
in exactly one of the first two processes; the aggregate comparison deduplicates
files and cases. Monolithic runs that terminated with an unexpected worker exit
are retained as incomplete attempts, not counted as successful full-file runs.
Closing the test browser tab did not eliminate that execution limit; its exact
cause was not established by this task.
