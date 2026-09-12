# Sheet Canvas renderer

The Sheet is one rendering and input surface. `SheetSurface.vue` owns one canvas
for cell content, borders, headings, selection/reference/clipboard outlines,
reading highlights, frozen lines, image pixels and operation previews. Rendering
uses one ordered pass without content/overlay canvases or an offscreen border
bitmap. Native editing and menus remain DOM adapters.

## Ownership and invalidation

Core owns workbook state, calculation, commands and history. Sheet Engine owns
geometry, hidden rows, selection and viewport contracts. The Web `sheet-grid`
module owns the display snapshot, render frame, paint scheduling and native
editor/menu adapters. The `sheet-images` module owns image editing and its painter.

`useSheetDisplaySnapshot` prepares document-derived spill values and content extent
once per document change. Viewport scene preparation never scans all formulas.
`SheetRenderFrame` projects the engine layout into surface coordinates for body
panes and header items; header hit testing never resolves merged-cell anchors.
Editor clipping, image fragments and overlay ranges use the same engine layout.

The centralized scheduler coalesces all invalidations into one animation-frame
paint. Selection changes reuse prepared cell presentations and border plans, but
repaint the visible surface so previous selection pixels are removed:

| Change                                                         | Work                                        |
| -------------------------------------------------------------- | ------------------------------------------- |
| Selection, header hover/focus, reference/copy state            | Repaint with existing scene and border plan |
| Image drag/resize/crop or decoded floating image               | Repaint with existing scene and border plan |
| Scroll inside current visible row/column membership            | Repaint with existing scene and border plan |
| Visible membership, dimensions, hidden rows, document revision | Rebuild visible scene and border plan       |
| Locale, date system, loaded fonts                              | Rebuild cell presentation                   |
| Theme, DPR, zoom                                               | Refresh palette/backing bitmap and repaint  |

The backing density is device pixel ratio multiplied by Sheet zoom. Theme and DPR
observation have one per-sheet lifecycle. Text measurement and automatic row
heights consume the shared font-loading revision. Decoded image caches retain
visible sources and release callbacks on teardown.

## Interaction and accessibility

The native scroller provides scroll extent. A constant-size surface routes hits to
headers, images or cells. Native DOM remains for the active textarea, selected
image controls, fixed freeze hit targets, menus and dialogs. There is no visual
DOM node per cell, heading or unselected image. The heading focus entry has a
localized label and supports keyboard menus and dimension adjustment. Ordinary
axis selection returns to the native editor to retain clipboard and IME behavior;
formula reference picking keeps the active formula editor focused.

The shared `sheet-input` boundary converts browser coordinates to logical sheet
coordinates and owns the active pointer session. Starting another gesture cancels
the previous one. Pointer cancellation, Escape, blur and unmount release capture
and listeners; each controller retains its independent command/preview rules.

Focused tests verify document snapshot reuse, visible-scene invalidation, scheduler
coalescing, frozen/hidden header hits, overlay clipping, pointer cancellation,
editing, clipboard, transformed images and command/history effects. Browser
verification complements these contracts with actual Canvas and native focus.

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

## Single-canvas verification

The single-canvas browser check confirmed one canvas in the Sheet surface, cell
editing, click selection, held-button drag selection, stable selection after
release, scrolling and zooming. Focused tests verify that selection repaint
reuses the existing scene and border plan and that multiple invalidations share
one frame. Historical multi-canvas timing samples below do not measure the
current single-canvas renderer.

## Historical two-canvas surface verification

Before the single-canvas update, the 2026-09-12 browser check used the same 100,000-cell fixture with fills,
borders, wrapping, a merge and frozen row/column. At 100%, 50% and 10% zoom,
the Sheet subtree had 11 descendant DOM nodes and two visible canvases; it had
zero row/column heading DOM nodes at every zoom. This is a node-count check,
not a throughput comparison. The active editor remains native.

Browser checks also exercised cell editing, whole-column formula reference
picking, keyboard axis menus and menu focus. Focused regression tests cover
selected-image wheel routing and preview focus restoration.

## Historical cell-only migration sample

The earlier cell-only paired local sample on 2026-09-12 used the original `f97d71c7` DOM
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

That cell-only renderer kept two canvases and zero per-cell DOM elements at each
zoom. In that earlier implementation, header nodes still grew with the visible row and column count. The unified surface described above removes those heading nodes. Zoom
transition time is not claimed here; the controlled comparison records the
resulting node pressure. A separate Canvas drag check showed a 16.8 ms 95th
percentile frame interval during movement; its remaining long task occurred
when the mouse-release aggregates refreshed. At that time, unit tests also verified that
selection movement neither rebuilt the scene nor repainted cell content. The
current single-canvas renderer reuses the scene and repaints the visible surface.

Browser checks confirmed cell editing, selection, frozen rows/columns, merged
cells, cell images and filter controls. Changing the root theme refreshed the
painted background, and DPR=2 produced the expected two bitmap pixels per CSS
pixel. Test browsers and the comparison servers were closed after verification.

## Historical cell-only bundle comparison

Both the original `f97d71c7` and the Canvas implementation build successfully.
The original already exceeds the configured bundle budgets: its entry is
721,375 B JavaScript (207,521 B gzip) and 139,148 B CSS (19,588 B gzip). The
inspected Canvas build adds about 1 KB JavaScript and removes about 2.7 KB CSS.
The existing bundle budget failure remains separately tracked by the unchanged
budget check.
