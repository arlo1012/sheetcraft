# ADR 0003: Workbook and Sheet View State

Status: accepted

## Context

Workbook data and Sheet view state have different lifecycles. The current Web
workspace stores selection both inside the grid view state and in a second
selection range map. Deleting a Sheet also removes its view state while core
undo restores only workbook data.

## Decision

Workbook state and reversible domain commands belong to `@idea10/core`.
Per-Sheet selection, scroll position, visible extent, editing state, floating
panels, and focus belong to the frontend or `@idea10/sheet-engine` contracts.
View state is not stored in core command history.

Each frontend keeps one `SheetViewState` record per Sheet identity. Selection
ranges and formatting read models are derived from that record instead of
being written separately. A frontend may retain view state for a deleted Sheet
while its identity remains referenced by bounded undo or redo history. The Web
adapter prunes state that is referenced by neither the workbook nor history;
that retention policy is not a workbook command concern.

Core history descriptions are stable operation codes. The Web adapter maps
operation and error codes to translated messages when they are displayed.

## Consequences

- Selection updates have one source of truth.
- Undo remains portable across browser, worker, and server runtimes.
- Restoring or resetting deleted-Sheet view state is explicit and testable.
- Vue components coordinate intents but do not own workbook invariants.
