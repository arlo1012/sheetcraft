# Existing same-sheet line Sparkline lifecycle — 2026-10-11

Baseline: `656cbe0f3262b617a92d9a6fb634bf67a5d259c2`.
Only the existing Sparkline dialog and its local Workspace range picker changed.
Core command/mapping/rendering, sheet selection semantics, snapshot/native format,
style choices and supported types are unchanged.

## Reproduced boundaries and bounded fix

The mounted concrete dialog reproduces discarded local fields after a false
executor result, obsolete confirm/close acting on a new dialog, same-address reopen
reusing local fields, stale generation confirmation, missing module context closure,
and older success closing a reentrant new dialog. The first module baseline has
6 failures / 5 passes; its explicit old close masked two context-closure assertions.
Removing that masking close makes 8 module cases fail. The corrected actual Workspace
picker baseline fails both replacement cases: a newly reopened dialog remains
suspended by the prior truthy-to-truthy pick. The final picker regression also proves
old picker confirm/cancel and old selectReference cannot affect a newer pick.

A read-only review found the owner-unmount boundary. The mounted saved-confirm test
failed once before scope disposal; the local scope cleanup now invalidates it.

The keyed dialog captures workbook object, generation and Sheet identity/membership.
Its own confirm/close and the picker's own token callbacks guard that context. Every
dialog replacement cancels its pending picker synchronously. Reentrant older result
paths cannot close a newer dialog or replace its error. Explicit source/destination
references remain the operation targets; this does not introduce a new selection-
change cancellation rule. The existing picker uses its independent reference editor.

## False, no-op and actual protection

Actual Core returns false for an unchanged normalized Sparkline, adding no history.
That valid confirmation still closes. After execute=false, the controller compares
the actual destination definitions with every requested normalized result. It closes
only when the desired definitions already exist; otherwise the same local editor
stays mounted with a failure prompt and its fields for retry. Thrown execution is
also retained. No preview mutates or clones Core state to guess the result.

An ordinary preprotected locked destination is already rejected by Web's editable-
range preflight; no ordinary protected-cell GUI vulnerability is claimed. The real
Core refusal regression injects permission revocation immediately at the execute
boundary, then invokes actual executeWorkbookCommand. The real sheet_protected error
is translated into false exactly like the existing Workspace executor. Complete
snapshot equality is measured against the state after that intentional protection
transition; the refused command changes no workbook data/history. Removing the
synthetic protection and retrying succeeds in one command. Pivot output is not used
as a fake Sparkline protection fixture.

## Serial checks and original failures

- Initial module baseline: 6 failed / 5 passed; corrected module boundaries: 8 failed.
- Initial Workspace selector used a nonexistent data attribute, then matched the
  same-named group. These two harness failures were not product picker evidence.
- Corrected actual picker baseline: 2 failed / 17 unrelated cases skipped.
- Owner-disposal baseline: 1 failed / 11 skipped.
- First guarded aggregate: 38 passed / 2 selector harness failures.
- Subsequent guarded aggregate: 59 passed; final exact-path aggregate: 8 files /
  69 passed, including Sparkline/controller, actual Workspace picker/entrypoints,
  Hyperlink, Symbol and shared range-input interaction.
- Existing Core Sparkline feature/history/serialization: 24 passed.
- First Web build stopped at TS6133 for an unused Dialog test import; no Vite build
  ran in that attempt. Scoped initial lint also failed for that import. It was removed;
  final concrete lifecycle 12 passed and full Web Vue/Node types plus production
  Vite build exit 0. Production source did not change after the 69-case run.
- Final scoped formatting/lint and source/Markdown whitespace checks exit 0.
- Independent read-only review found no remaining blocking source issue.

The three large harness runner dumps contain whole synthetic Workspace DOM. Their
unaltered bytes stay local in the recovery materials; Git keeps their SHA256, size,
precise summary and selected failure lines. The genuine concise module/picker/
disposal failures and final results remain as logs. Raw runner trailing spaces and
blank EOF cause whole-stage whitespace exit 2; code/Markdown-only exit 0 is separate.
Full repository CI, bundle-limit checks and WPS/Excel/native exchange were not rerun.
The existing >500 kB build warning remains (main chunk 2,154.34 kB before gzip).

## Actual production-preview GUI

One own cloud Chrome page used the final production build through loopback preview,
after all tests/build finished. New synthetic Sheet5 was added without Replace,
import or reset; the five prior synthetic sheets remain exactly unchanged.

Source values were entered through actual cell editors: `[2,4,3]` and `[3,1,6]`.
The address field accepts a cell, not a rectangular selection; entering A1:C2 did
not select it. Ordinary Shift+Arrow keys selected A1:C2, and the dialog showed exact
same-sheet source and D1:D2 default destination. No new address-input contract was
introduced. One assumed input aria-label selector timed out: TDesign puts that label
on its wrapper. Inspecting the actual two editable inputs and using those controls
completed the path; no product failure or pass is assigned to that unmatched action.

- Change source/destination and marker draft, Cancel, reopen: original defaults.
- Invalid D1:D3: editor and fields retained with invalid-range prompt. Cancel its
  actual source-range picker: same pending fields return; correct D1:D2 and commit.
- Two visible line graphs appear, mapping D1→A1:C1 and D2→A2:C2.
- Open D1, change destination/marker, Escape, reopen: stored fields intact.
- Confirm unchanged D1: closes without an extra history entry. One Undo removes
  the original two-graph creation; one Redo restores both. Public JSON proves it.
- Editing both existing graphs explicitly uses A1:C2→D1:D2 with markers and axis.
  Opening D1 alone still loads only D1's source/destination, preserving existing
  first-cell editing semantics. Independent single Undo/Redo restores complete
  before/after JSON bytes, not just the display.
- Select D1:D2 and Clear: both Sparkline definitions disappear, source values stay.
  One Undo restores the exact edited snapshot; Redo clears; final Undo restores it.
- Explicit Save locally, export, ordinary reload (wait for authoritative loaded A1),
  inspect D1 fields/options, Cancel and re-export: byte-identical snapshot.

The 10 local exports prove all these equalities. Created: 29,578 bytes, SHA256
`d9d9912801ea165f83a449da3252065afe98fda12507f0c177cb8a483ad9e3a3`.
Cleared: 28,408 bytes, SHA256
`c9703a421403f73959d1457e43014901ab583c1bd8cc1c098d38efe6491b0e68`.
Final edited/reloaded: 29,574 bytes, SHA256
`244e74517fc04d7f4185439fb9174438296d63aaa63bc0b10900347ad4ffe909`.
All six numeric sources and all five prior sheets are structurally identical across
these exports. Raw JSON/screenshots stay local and are not in this checkpoint.

Own tab20 and preview were closed; terminal prompt confirmed. oom_kill stayed25
before/after, and no Error9 occurred on the own page. This does not diagnose or cure
previous renderer crashes. No heavy check ran alongside GUI.

## Remaining Insert boundary

This accepts one existing same-sheet line lifecycle, not every source/destination,
column/winLoss, protection, decoration, native or layout variant. Native writers/
readers were unchanged. The other remaining existing paths still need their own
actual lifecycle checks: icon/equation, camera, form controls, cell/floating images,
screenshot, attachments/documents, watermark and whole dashboard. Those are separate
from more native chart types and generic drawing/media interchange.
