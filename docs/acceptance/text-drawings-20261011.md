# Existing text box / WordArt lifecycle — 2026-10-11

## Bounded result

The existing Insert entries, editor, object layer, Core commands and snapshot
paths were exercised with synthetic data. This slice changes only two production
lines: hide the WordArt fill/outline/line-width row, and set font-relative
`line-height: normal` for textBox/wordArt content. No model, snapshot version,
WordArt effect, geometry catalog or native drawing implementation was added.

WordArt's fill/stroke/strokeWidth are normalized and retained by Core, history,
structure and JSON, but its renderer has no consumer for those three fields.
The renderer uses text color, font size, bold/italic, rotation and its existing
fixed shadow/stroke effect. The inert controls are hidden only for WordArt;
stored fields survive confirmation, including nondefault values in regression.
Text boxes retain effective fill/outline/line-width controls. Bold already worked
through the renderer's inline 400/700 values; it was not changed.

Large multiline text previously inherited the page's fixed 20px line height.
The real 28px text box and 40px WordArt reproduced overlapping lines, particularly
the short WordArt `Art one` / `Art two` case. Their line height now follows font
metrics; a real browser screenshot and computed styles confirmed separated lines.
Other drawing kinds retain their previous rendering.

## Actual UI evidence

The first session exercised Insert cancel, insert, edit cancel/confirm, toolbar
Undo/Redo, object keyboard movement, delete/Undo, dimensions, text/font/color,
rotation and save/reload on the isolated Data + Sheet1 workbook. The Data sheet
was unchanged. Literal `<tag>` text remained text. Text box uses 320×140, 28px
bold italic, 15° rotation, fill #ffeecc and 3px #123456 outline. WordArt uses
300×100, 40px bold italic, -10° rotation, color #004466 and two short lines.

After the filesystem loss, a fresh loopback Vite browser check on the recovered
source found the same saved synthetic workbook. It confirmed WordArt one color
control and text box three, canceled a WordArt rename without changing the object,
confirmed a text-box rename, and verified toolbar Undo then Redo. The subsequent
Undo attempt encountered a Chromium tab Error 9 / CDP timeout. The browser window
survived; ordinary Reload recovered the test page. Reload clears in-memory history,
so the temporary name was restored by an explicit editor confirmation, not by a
claimed persisted Undo. No crash cause is inferred from this observation.

Explicit Save locally, public JSON export, normal reload and a second JSON export
then produced identical 16,037-byte snapshots. Both are also byte-identical to the
surviving pre-loss final export, SHA256
`90e2181d93ae355a80e890a6d08b793201815055fdbcc9a4452d4ca12e4b7c24`.
The two objects, all fields and original Data sheet survived. Final computed line
height is `normal` at 28px and 40px, and the final screenshot showed separated lines.
The own test tab was closed after saving, and the own Vite process was stopped.
User online pages were not edited or closed. Raw exports/screenshots remain local.

## Native boundary

The actual earlier 5,060-byte XLSX export has SHA256
`27fdeefaaa06a7248ca3e5c80ff00125c0a586ef4b540b258e161dfc91867b09`.
It emitted two located `feature-omitted` warnings and no drawing/chart/media
parts. The surviving file was re-inspected after recovery. Native regressions
prove each object is explicitly omitted without mutating the source workbook,
ordinary cell content survives, and import does not invent objects.

This is not a native textBox/WordArt WPS/Excel round-trip. No new target-app native
acceptance was claimed. Existing native omission policy is unchanged. Rotation's
axis-aligned clipping/selection, wrap/clip rather than autosizing, additional
styles and all broader graphic types remain separate limitations or untested scope.

## Recovery and fresh checks

While the publication question was pending, the old project/dependency/freeze/log
directories disappeared in both the shell and original cloud terminal. The old
18-file manifests and raw logs were not recoverable. The completed Git baseline
remained `b79cf6c8a886b1f5c427e1eca90710ca883d0ed8`, tree
`f73e348369da78e27f71e4f8519d258002fc5fea`.

All 2,064 files (16,822,121 bytes) were restored from that exact tree and checked
against every Git blob SHA and size. The exact two production blob IDs were
reconstructed: DrawingContent `1c7e17ecb81132223f16af28e79073b1f965d1b7`,
DrawingEditorDialog `43ed5b312b68a128b3420f5820c3af767ef1afc1`.
Focused tests were rebuilt and rerun, rather than reusing the lost freeze hashes.

Fresh logs in `evidence/text-drawings-20261011/`:

- recovered-baseline-web.log: 4 passed / 3 genuine product failures before both fixes
- recovered-controls-only-web.log: 5 passed / 2 line-height failures after hiding controls
- recovered-final-web.log: 5 files / 60 passed (drawings aggregate + actual workspace entries)
- recovered-core-drawings.log: 23 passed (existing Core drawing/history/snapshot/structure cases)
- recovered-native-boundary.log: 2 passed (located omission and nonmutation)
- recovered-web-static.log: full Web Vue + Node types and production build exit 0;
  build retains the warning for minified chunks over 500kB
- recovered-scoped-static.log: six changed source/test files format/lint and diff whitespace checks
- recovered-gui.log: plain synthetic UI and public-download comparison receipt

The three package builds also exited 0 after frozen-lock dependency installation.
Log test clocks reflect their runtime timezone; the recovery/GUI narrative is UTC.
Earlier first-session harness errors (two missing parameter callbacks), genuine
initial control/line-height failures and final 60/23/2 successes are historical
facts, not reconstructed original raw logs. Full repository CI/tests were not run;
the earlier 125 architecture diagnostics remain a separate known result.

This closes a representative existing text-object lifecycle slice. Whole Insert
and general native drawing exchange remain unfinished. See the current Insert matrix.
