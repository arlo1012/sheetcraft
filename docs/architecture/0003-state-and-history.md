# ADR 0003: Workbook and Sheet View State

Status: accepted

## Context

Workbook data and Sheet view state have different lifecycles. Duplicating
selection state or discarding deleted-Sheet view state immediately can make
formatting, navigation, and undo disagree about the user's current location.

## Decision

Workbook state and reversible domain commands belong to `@sheetcraft/core`.
Per-Sheet selection, scroll position, visible extent, editing state, floating
panels, and focus belong to the frontend or `@sheetcraft/sheet-engine` contracts.
View state is not stored in core command history.

Each frontend keeps one `SheetViewState` record per Sheet identity. Selection
ranges and formatting read models are derived from that record instead of
being written separately. A frontend may retain view state for a deleted Sheet
while its identity remains referenced by bounded undo or redo history. The Web
adapter prunes state that is referenced by neither the workbook nor history;
that retention policy is not a workbook command concern.

Core history descriptions are stable operation codes. The Web adapter maps
operation and error codes to translated messages when they are displayed.

### Persistence And Navigation

Cell contents, styles, dimensions, Sheet order and names, frozen panes, filter
criteria, and merged ranges are document state. User edits to these fields
are reversible Core commands. Snapshots serialize this state; formula results
and visibility indexes are derived again after loading.

`activeSheetId` remains in the workbook and snapshot as a reopen preference.
Ordinary Sheet switching does not enter undo history. Adding or deleting a
Sheet can change the active identity, and the inverse command restores that
command's previous active identity. This is a deliberate navigation policy,
not a requirement that every serialized field create its own history entry.

Selection, scrolling, visible extent, editors, clipboard outlines, format
painter state, floating panels, and focus are transient session state. They
are not included in workbook snapshots. Opening a workbook validates the full
snapshot first, then replaces the session document, starts empty undo/redo
stacks, and discards the previous document's transient state. A rejected
snapshot leaves the current session intact.

Core owns snapshot validation and command invariants. The Web application owns
when to save, storage/file access, replacement confirmation, and translated
save/load feedback. Low-level workbook mutators remain available for domain
implementation and setup; Web user edits go through the controller's command
entry so history and change notification stay consistent.

## Consequences

- Selection updates have one source of truth.
- Undo remains portable across browser, worker, and server runtimes.
- Restoring or resetting deleted-Sheet view state is explicit and testable.
- Vue components coordinate intents but do not own workbook invariants.
