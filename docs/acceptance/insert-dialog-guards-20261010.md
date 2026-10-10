# Existing object editor confirmation guards — 2026-10-10

Parent `9d8fbde5e5615089a396fc694c77153c20edf371`. This closes a reproducible
existing product correctness gap in graphic drawings, camera and form controls;
no new insertion type, visual editor, generic component registry, native family,
Core command or snapshot version is added.

## Reproduction and fix

Unchanged action baseline: **35 passed**. Seven added regressions failed before
production changes: all three owners lost their insert/edit draft when execute
returned false, and drawings accepted a stale confirmation into a replacement
workbook with the same sheet ID. False executors deliberately did not mutate Core;
this isolates the lost-draft lifecycle, rather than fabricating an external GUI
failure. Initial failed logs remain preserved.

The three concrete owners reuse a small shared drawing-dialog target state
contract, mirroring the already proven Chart/Table captured-session pattern.
It captures actual workbook/sheet/generation/existing-object identity, has a
fresh dialog key and bound confirm/close callbacks, checks permission/busy/flush
before publication and commit, prevents synchronous confirm/open reentry and
invalidates callbacks after cancel, target replacement or scope disposal.
Each owner keeps its existing validation/defaults and command payload semantics.
Workspace binds each actual editor to its session; camera/control range picking
is canceled on any session change, including same-ID reopen.

An execute=false changed edit remains mounted with its actual local input fields,
so retry can commit them. A proven unchanged existing edit still closes on the
real executor's no-op false. Successful commits and explicit cancellation retain
normal close behavior. The no-op proof plans only the set-drawings command on a
shallow clone of its destination sheet, never changing the real workbook/history.
Deleted or same-ID replaced existing objects are not resurrected.

## Final evidence and limits

Evidence: `evidence/insert-dialog-guards-20261010/`.

- First fix after the seven reproduced failures: **42 passed**.
- Extended action boundaries: **90 passed** across the three paths. Covers retry,
  cancellation/stale callbacks, same-ID reopen, successful/no-op close, object/
  sheet/workbook/generation replacement, permission/busy denial, throwing/false
  executor, flush/execute reentry and scoped disposal/synchronous invalidation.
- Concrete Vue/TDesign editors plus their full feature directories: **9 files /
  108 passed**, no unhandled errors. Real input field preservation, successful
  retry, cancel and fresh same-ID component mount are exercised. The graphic
  editor's unasserted TTextarea autosizer is stubbed; editor logic and name Input
  are real. This is DOM evidence, not WPS/Excel GUI evidence.
- Related final aggregate: **13 files / 222 passed**, including actual workspace
  Insert entrypoints and existing Chart/PivotTable/Table dialog lifecycles.
- Complete Web `vue-tsc`/node types, owned lint/format and diff passed.
- Architecture check remains failed with **125 diagnostics**. There are no added/
  removed semantic diagnostics; one existing SpreadsheetWorkspace adapter-selector
  location moved 1791→1789. Exact and normalized comparison are retained separately.
- Full Web/Core/XLSX suites, bundle build and new target-app GUI were not rerun for
  this scoped source/DOM continuation. Earlier native bar1120 and GUI results remain
  bound to9d8fbd, not relabeled as new checks.

Intermediate failures are preserved: a wrong working-directory setup, duplicate
local test identifier, six concrete harness errors and a TDesign autosizer teardown
rejection; the second DOM run had108 assertions pass but still that rejection and
is not the final green run. Intermediate Web types caught removed aliases needed
by modal guards, then the missing test references. Fixes and final results are
separate logs; no failed run was overwritten or claimed green.

The current whole-Insert scope remains in
[the compact inventory](../insert/current-scope-20261010.md). Native exchange,
existing unverified features and actual remaining product behavior are explicit;
this confirmation fix is not all-Insert completion or authorization to merge UI.
