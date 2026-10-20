# Web presentation guard regression coverage — 2026-10-20

## Scope and root cause

This is test-only maintenance. Core, rendering, native XLSX import/export and
user-visible error messages are unchanged.

The old combined guard test expected the direct Web helper's `Percentage
presentation` diagnostic from `createChartOption`. That entry point first calls
Core `normalizeSheetChart`, which correctly rejects an unsupported percent-stacked
chart with `Percent stacking`. The mismatch stopped the single test before its
line-marker and non-finite-source assertions could execute.

The test now describes both boundaries explicitly. Core-normalized options and
the directly called Web helper each assert their own existing diagnostics. A
single thrown exception can no longer prevent the separate invalid palette,
background, explicit percent reset, unknown field, chart-type, stacking,
line-marker and data-value cases from running. Accessor tests retain the check
that the getter is never invoked.

Each rejection has an admitted control. Percent cases cover both an unsupported
pie and an unstacked column; marker cases use a valid line and an invalid column
without accidentally retaining percent stacking. Chart-option and wordcloud
source-value cases independently cover positive infinity, negative infinity and
NaN, and verify useful output for finite data. The wordcloud fixture explicitly
uses a non-stacked chart and an otherwise valid palette.

## Guard sensitivity

A separate disposable copy runs the same 60-test file. Its unmodified control
passes all 60 tests. Removing the Core percent or marker rejection produces two
or one failures respectively: the later Web guard still rejects, but can no longer
masquerade as the Core boundary. Removing the direct Web percent or marker guard
produces two or one failures respectively because the helper accepts invalid
settings. Bypassing presentation data validation produces all six expected
non-finite-source failures, independently of chart type or marker validation.
Every mutant executes the full 60-test file; the product checkout remains
unchanged and the isolated files are restored afterward.

## Verification and retained failures

- Original focused file: 36 passed, 1 failed at the incorrect message assertion.
- Final focused file: 60 passed, no skips. One bundled test became 24 independent
  cases; the other 36 tests remain unchanged.
- Complete chart-directory aggregate, serial worker and 4 GB heap: 1,452 passed,
  42 failed across 11 of 57 files, no skips. This aggregate is not green.
- Of the 15 previously documented failures, this change fixes one and the other
  14 remain. The wider run also observed 28 failures in unchanged tests outside
  that historical subset. Those 28 have not been independently baseline-reproduced
  or diagnosed and must not be presented as verified historical failures.
- Independent review found no blocking findings and separately ran all eight
  formerly masked marker/non-finite cases successfully.
- Web typecheck, build, scoped formatting/lint and broader lint outcomes are
  recorded individually in the accompanying validation summary. Broad Web lint
  reports three unsafe-optional-chaining warnings in the unchanged conditional
  formatting manager test; this maintenance does not suppress or repair them.

The validation summary lists every retained failing test and distinguishes the
historical subset from newly observed failures. No existing skip is removed or
added to hide a failure. No whole-repository or remote-CI-green claim is made.

No browser, Excel or WPS GUI verification is needed or claimed for unchanged
product behavior. Existing unrelated Core and Web issues remain separate;
in particular, the range-series color-index semantic question is not reclassified
as a stale assertion or changed by this maintenance.

## Next bounded diagnosis, not implemented

Prioritize the six `source-workspace.test.ts` Change Type/Combo interaction
failures because they block verification of selected-owner identity, Cancel,
source preservation, hidden series and one-step Undo. The failures currently
occur at a missing TDesign Select (`:411`) or obsolete
`[data-chart-editor-type]` helper (`:1025`), while `ChartEditorDialog.vue` renders
`ChartTypeNavigation.vue` and `ChartSubtypeControls.vue`. First reconcile the
integration harness with the actual user controls, then execute the full
interaction assertions before deciding whether a production defect exists.
Do not weaken the identity/history assertions or label the user flow broken
solely because an old selector is missing. No code for this next task is included.
