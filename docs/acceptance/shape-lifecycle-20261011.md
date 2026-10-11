# Existing rectangle → arrow lifecycle — 2026-10-11

Code baseline: `a44fe73f4d494d95e4be89d9cfad87f30c7f1720`.
No production source, preset, geometry, native writer or snapshot changes were
needed for this bounded acceptance. This is actual Sheetcraft UI evidence, not a
new WPS/Excel native shape round-trip.

## Scope and isolation

One new empty Sheet2 was added to the already backed-up synthetic Data + Sheet1
workbook through the real Add sheet button. No reset/import/replacement was used.
Public final JSON comparison proves the existing two sheets are unchanged.
Only one shape was inserted, then that same ID was edited from rectangle to arrow.
All raw JSON exports and screenshots stay local; this checkpoint contains text only.

Before opening the single own loopback test tab, serial checks completed:
drawings aggregate + actual Insert workspace entrypoints, 5 files / 60 passed;
shared floating layout/resize geometry, 2 files / 15 passed. No build/check ran
alongside GUI. The existing baseline Core drawing/history/serialization evidence
remains separate from these fresh checks. An initial wrong relative log-directory
command failed before invoking tests; the corrected runs below are the actual results.

## Actual user paths

1. At B3, open Insert → Shapes, change name/preset and Cancel: zero objects.
2. Confirm one rectangle named Synthetic lifecycle shape, text Rectangle text,
   260×140, 22px bold, No fill and 3px blue outline. Actual SVG is a rectangle,
   transparent fill and stroke-width 3.
3. Edit that rectangle to Arrow with different text/rotation, then Cancel:
   the rectangle and original text remain. The next Undo still undoes insertion,
   proving the canceled edit did not insert a history entry. Redo restores it.
4. Confirm the same ID as Arrow: text Arrow text, 280×160, 24px normal-weight
   italic, rotation 15°, white fill and 5px blue outline. Turning off No fill uses
   the existing white-reset behavior. Actual SVG path, fill/stroke width and
   text/rotation styles match. One Undo restores the complete rectangle snapshot;
   one Redo exactly restores the complete arrow snapshot.
5. Shift+Right moves 10px. One Undo/Redo restores exact full before/after snapshots.
   Delete removes the only shape; Undo restores it.
6. With the documented Sky desktop multi-point drag and fresh screenshot
   coordinates, move the arrow +90px/+40px. Anchor becomes row 4 / column 2,
   offsets 12/0. Dimensions and every other field stay intact. One Undo exactly
   restores the full pre-drag snapshot; one Redo restores the full post-drag snapshot.
7. Drag the existing east resize handle +50px: width 280→330, height remains 160.
   Anchor/offsets/ID/preset/text/style/rotation remain intact. One Undo restores the
   complete pre-resize snapshot; one Redo restores the complete resized snapshot.
8. Explicit Save locally, public JSON export, ordinary reload, public JSON export:
   final snapshots are byte-identical (19,103 bytes, SHA256
   `cebcb6f46f060e82acdf04c9bcc554bc7f4d0fd70503e4ac4a7216bb701044ba`).
   Final screenshot shows the preserved arrow.

Three earlier window-bound App.drag attempts (two object hit regions and one
east handle) returned without an error but changed no geometry. Their Undo
returned to the prior editor command, not a nonexistent movement. They are not
counted as passing gestures or as a product defect. The documented Sky desktop
route above then supplied actual successful gestures, without synthetic DOM events.

## Environment and remaining boundaries

`/proc/vmstat` oom_kill was 25 before GUI at 05:24:51 UTC and remained 25 through
the subsequent observations and cleanup. The own Shape test tab did not show
Error 9. The unrelated preexisting WPS online Book tab was seen on Error 9, with
unknown onset; it was not operated or attributed to this test.

An optional Export XLSX download wait timed out and reset the UI tool kernel.
The test page remained alive and was rebound; no new native file was captured.
The Vite terminal logged lazy dependency optimization followed by “reloading”
around that export attempt. This is a correlated environment observation, not a
proved crash cause or format failure. Save/reload/JSON acceptance was completed
afterward. The own tab was closed and own loopback Vite stopped; prompt verified.

Not accepted by this bounded slice: all nine presets, corner/aspect/frozen-pane/
zoom variants, an in-progress gesture Escape in the actual GUI, custom color-picker
entry and complete protection matrix. Existing unit tests cover pointer cancel/
read-only behavior and side/corner geometry; they do not replace those GUI paths.
Numeric rotation is supported, while the selection/clip/drag/resize geometry
remains axis-aligned; no new rotation handle or flip/adjustment was added.
Native XLSX shapes remain an intentional located feature-omitted boundary.
No target-app native shape support or full-Insert completion is claimed.

Fresh check logs and plain operation receipt are under
`evidence/shape-lifecycle-20261011/`. Full CI and repository-wide suites were not run.
The Markdown-scoped staged whitespace check passes. The all-file staged check
returns 2 for the two preserved raw Vitest logs' natural blank line at EOF; those
stdout logs were not edited to manufacture a clean whitespace result.
