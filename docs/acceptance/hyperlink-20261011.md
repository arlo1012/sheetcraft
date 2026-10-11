# Existing Hyperlink lifecycle — 2026-10-11

Baseline: `7a63e96be1e2529b67dc4b98e4092cc810362638`.
This slice fixes only the existing Hyperlink controller/dialog confirmation
lifecycle. It keeps the target validation, external opener, internal resolver,
Core link/content/style/visited commands and snapshot/native formats unchanged.

## Actual reproduced failures

A mounted concrete HyperlinkDialog with the real controller and Core/history
reproduces the protection refusal. A protected sheet allows insertHyperlinks but
the target cell is locked. The existing Web executor translates Core's
sheet_protected domain error into false. Both save and remove leave the entire
serialized workbook and history unchanged, but the old controller unconditionally
closes and discards the edited dialog. This is not just a fake rejection result.

Captured old component confirm/remove/cancel callbacks after cancel→reopen can
mutate or close the newer instance. A same-ID workbook replacement delivered
before the old asynchronous generation watcher runs can receive the old confirm;
changing the sheet or active address also allows stale confirmation. The corrected
baseline has 8/8 targeted failures: two refused confirmations, three obsolete
callbacks and three captured-context changes. The first run's two protection
fixtures lacked editableRanges and failed at serialization; that harness error
and six genuine failures are retained separately, not relabeled as eight product
failures.

## Local bounded change

The controller owns a keyed dialog with captured workbook, sheet, address and
generation plus instance-bound confirm/remove/cancel callbacks. Context changes
close synchronously. Stale callbacks do not write, close a newer dialog, set its
error, or refocus over it. The Workspace merely binds that keyed instance;
other toolbar/controller architecture is unchanged.

False or thrown execution leaves the same mounted dialog, local target/display/
tooltip fields and failure message for correction/retry. Successful execution
closes only its own still-current instance. Reentrancy that opens a newer editor
cannot cause the older success path to close it. A same-address reopen receives
fresh initial fields. The existing Core set-link command returns an inverse even
for unchanged input; an unchanged confirmation remains accepted. No new command
result semantics or no-op history policy were imposed on other features.

## Code checks and failure history

- Initial lifecycle: 8 failed, including 2 fixture setup errors plus 6 target defects.
- Corrected baseline: 8 target failures, real refusal leaves snapshots/history exact.
- First guard-focused run: 3 files / 14 passed.
- Related aggregate: 5 files / 39 passed; includes lifecycle, existing controller/
  locale tests, actual Workspace entrypoints and Symbol regression.
- Grid click/drag/secondary-button hyperlink interactions: 3 passed.
- Existing Core cell-style/link history/snapshot: 8 passed.
- Initial Web build stopped at types, TS2345: the new test fixture omitted the
  required idFactory. No production build ran in that attempt. The fixture was
  corrected to the existing sequential factory contract; original log is retained.

- Final post-type-correction related aggregate: 5 files / 39 passed.
- Full Web Vue/Node type checks and production Web Vite build: exit 0. The existing
  >500 kB chunk warning remains; the main chunk is 2,153.20 kB before gzip. This
  is not a full repository CI/bundle-limit pass.
- Final scoped formatting, lint and source/Markdown whitespace checks: exit 0.
- Independent read-only review found no remaining blocking issue in this slice.
- Whole staged whitespace check exits 2 on preserved raw test/build logs (natural
  blank EOF and runner trailing spaces); source/Markdown-only check exits 0. Logs
  were not rewritten to erase original output.

## Actual GUI and persistence

The final production build ran through a single loopback preview at
127.0.0.1:7200. A new synthetic Sheet4 was added to the previously backed-up
isolated workbook, without replacing/importing any document. No GUI was open
alongside checks/build.

A1 was created with display `Internal report`, target `#Sheet4!C3` and a screen
tip. Editing all three fields then Cancel preserved the original; Escape also
discarded an edited draft, and reopening showed fresh original fields. Editing
all three to `Edited internal report`, `#Data!A1`, `Go to synthetic data` committed;
one Undo restored the previous three fields, and Redo restored the edited three.
Alt+Enter actually navigated only to the synthetic Data sheet A1. Returning to
Sheet4 retained the link and its visited state.

Remove closed the editor while retaining the label. Reopen showed a new-link
editor with blank target/tip and disabled OK. Undo restored the link; Redo removed
it; another Undo restored it for persistence. The removed public JSON has no
hyperlink property, but retains the existing purple/underline style. Removing a
link does not promise to clear independent cell formatting.

Explicit Save locally, public JSON export, ordinary browser reload, restored
field inspection and re-export produced identical 24,830-byte JSON snapshots:
SHA256 `de5068be0798f87184eddc8d4b5e65c381093110460df520af06b932472f46ff`.
A1 contains the edited string, exact target/tip and visited=true. The prior four
synthetic sheets are structurally identical to the previous public export.
Raw exports stay local. The reload waited for the authoritative loaded A1 label
before subsequent interaction, avoiding the earlier Symbol loading/focus race.

Two attempted first clicks on a ribbon tool did not open a dialog, and the
following Cancel locator timed out with no dialog matches. The page stayed alive.
Using the real ribbon scroll button to expose the tool, then observing the opened
editor before subsequent actions, completed the path. This receipt does not label
those swallowed/scroll-associated clicks as a confirmed controller defect or a
passed action. No new ribbon implementation was included.

The own tab and preview process were closed (terminal prompt confirmed).
`oom_kill` stayed 25 from before GUI to cleanup. No Error 9 occurred in this own
page; this does not establish the cause or cure of earlier renderer crashes.

## Remaining boundaries

This is an existing UI lifecycle slice. It does not reaccept every external URL,
mailto, hidden-sheet, formula/numeric, permission, IME, visited-theme or native
XLSX variant. Existing focused tests preserve those covered cases separately.
Only synthetic internal link navigation was performed in the actual GUI; no
external navigation, upload or user document replacement occurred. Raw JSON/screenshots
stay local; this checkpoint contains source, tests and plain acceptance evidence.
Full CI and repository-wide suites are not claimed. Sparkline and the other
remaining Insert entries are separate next scopes, not silently included here.
