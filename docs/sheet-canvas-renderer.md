# Sheet Canvas renderer

The Web Sheet grid draws cell fills, grid lines, text and cell images on one
viewport-sized Canvas. A second Canvas draws explicit borders above selection
fills. Headers, selection outlines, floating images, menus and the active text
editor remain Vue components. Hit testing uses the existing Sheet viewport
layout, including frozen panes and merged-cell anchors.

## Ownership and invalidation

`packages/core` continues to own workbook data, commands and history.
`packages/sheet-engine` continues to own geometry, row visibility, selection and
viewport contracts. Canvas code lives in the Web `sheet-grid` module and adds
no dependency to either runtime-neutral package.

`SheetCanvasLayer.vue` owns the two contexts and schedules at most one paint per
animation frame. Its scene is in Sheet coordinates; each frozen pane applies
its own clip and scroll translation. A pixel scroll within the same visible
rows and columns reuses the scene and border plan. Changes to visible members,
workbook revision, geometry, row visibility, merges, locale, date system or
loaded fonts rebuild the relevant presentation. Cell formatting and text
wrapping are cached by source cell identity and dimensions; formula results
also depend on the evaluator revision. Caches retain visible cells and images.

The backing bitmap uses device pixel ratio multiplied by Sheet zoom. Root
theme class or `theme-mode` changes refresh the Canvas palette. Image decoding
and font loading schedule another paint without requiring a document edit.

Dragging updates the live selection and DOM selection overlay. Toolbar style,
filter/merge state and statistics use the last settled selection until mouse
release, so they do not scan workbook data on every pointer move. Commands
always use the live selection. Small selection summaries use direct cell
lookups, and literal summaries/filter values do not construct a formula
evaluator.

## Interaction and accessibility

The native textarea, keyboard navigation, clipboard commands, formula reference
picking and localized UI remain. Canvas cells do not create individual
`gridcell` elements; per-cell screen-reader semantics have been removed.

Tests drive real Canvas hit coordinates and inspect workbook state, editor
geometry and the actual scene/border builders. Focused tests cover scrolling
without scene rebuilds, selection without repainting, formula dependencies,
merged frozen fragments, styles and transformed images. Browser checks cover
the painted result and interaction timing.

## Reproducing the comparison

Generate the versioned 500-row by 200-column workbook with:

```sh
bun scripts/performance/sheet-canvas.mts
```

The fixture contains 100,000 populated cells, periodic fills/borders/wrapping,
one merged range and one frozen row/column. The generated snapshot is written
to `output/playwright/sheet-canvas-fixture.json`. Import the same pristine
snapshot into each renderer's workspace and confirm replacement. Reload after
import, use a 1440 by 960 Chromium viewport, and wait for initial rendering and
`document.fonts.ready` before sampling. Run tests and builds outside the
sampling interval.

The browser scenarios measure twelve real wheel events of 420 pixels with
16 ms spacing, a 36-step pointer drag, and five zoom-out button clicks from
100% to 50%. A separate stress scenario reduces zoom from 100% to 10%. The
actions are exported from
[`scripts/performance/sheet-canvas-browser.cjs`](../scripts/performance/sheet-canvas-browser.cjs)
and accept a Playwright page without adding a runtime dependency. Each records
animation-frame intervals, tasks over 50 ms, elapsed time and DOM counts. The
pause following each gesture is included in elapsed time; mouse-release work is
included in the drag's long-task total. These are local development-build
diagnostics, not a cross-device performance promise.

## Measured result

The final paired local sample on 2026-09-12 used the original `f97d71c7` DOM
renderer and this Canvas implementation. Other worktree checks had finished
before sampling. The comparison excludes an earlier DOM run that was blocked
by the import confirmation dialog.

| 100% scroll scenario                  |        DOM |   Canvas |
| ------------------------------------- | ---------: | -------: |
| Elapsed, including input/settle waits | 2,997.7 ms | 944.6 ms |
| Tasks over 50 ms                      |         12 |        1 |
| Total long-task duration              |   2,365 ms |    57 ms |
| 95th percentile frame interval        |   266.7 ms |  16.8 ms |

| Zoom | DOM renderer nodes | Canvas renderer nodes |
| ---- | -----------------: | --------------------: |
| 100% |              4,315 |                   954 |
| 50%  |             13,591 |                 1,142 |
| 10%  |            257,609 |                 2,658 |

The Canvas renderer keeps two canvases and zero per-cell DOM elements at each
zoom. Header nodes still grow with the visible row and column count. Zoom
transition time is not claimed here; the controlled comparison records the
resulting node pressure. A separate Canvas drag check showed a 16.8 ms 95th
percentile frame interval during movement; its remaining long task occurred
when the mouse-release aggregates refreshed. Unit tests also verify that
selection movement neither rebuilds the scene nor repaints cell content.

Browser checks confirmed cell editing, selection, frozen rows/columns, merged
cells, cell images and filter controls. Changing the root theme refreshed the
painted background, and DPR=2 produced the expected two bitmap pixels per CSS
pixel. Test browsers and the comparison servers were closed after verification.

## Bundle comparison

Both the original `f97d71c7` and the Canvas implementation build successfully.
The original already exceeds the configured bundle budgets: its entry is
721,375 B JavaScript (207,521 B gzip) and 139,148 B CSS (19,588 B gzip). The
inspected Canvas build adds about 1 KB JavaScript and removes about 2.7 KB CSS.
The existing bundle budget failure remains separately tracked by the unchanged
budget check.
