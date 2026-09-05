# Portable Core Consumers

`@idea10/core` is the runtime-neutral workbook package for Web applications,
other frontends, Workers, and servers. `@idea10/sheet-engine` adds headless Grid
geometry and interaction state and depends only on Core.

## Runtime Contract

Core targets ES2022 and does not read the DOM, browser storage, the network,
Vue, or UI localization. Consumers provide runtime capabilities explicitly.
Workbook and Sheet creation require explicit IDs or an `IdFactory`; factories
keep tests and non-browser runtimes deterministic.

```ts
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbook } from "@idea10/core/workbook";

const idFactory = createSequentialIdFactory();
const workbook = createWorkbook({ idFactory });
```

A production adapter may use platform randomness, but that adapter remains
outside Core.

## Commands And History

Commands are structured-cloneable data. Use a `WorkbookSession` when the
consumer needs bounded inverse-command undo and redo.

```ts
import { createSetCellValueCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getActiveSheet } from "@idea10/core/workbook";

const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
const sheet = getActiveSheet(session.workbook);

executeWorkbookCommand(
  session,
  createSetCellValueCommand(sheet.id, { row: 0, column: 0 }, "ready"),
);
```

Use `tryApplyWorkbookCommand` when a transport boundary needs a data result
instead of a thrown exception. Display strings remain in the consuming app;
Core returns stable error and operation codes plus diagnostic details.

Web user edits use commands through the workspace controller's session. The
low-level model mutators exported by `workbook` are intended for Core
implementation, initial construction, deserialization, and test fixtures;
calling them for a user edit bypasses undo/redo and the Web change notification.
Navigation with `setActiveSheet` is an intentional exception: switching Sheets
does not create an undo entry.

## Snapshots

`serializeWorkbook` writes the versioned `WorkbookSnapshotV2` DTO.
`deserializeWorkbook` accepts V1 and V2, upgrades V1 literal values to the V2
content model, and validates formula sources, styles, dimensions, frozen panes,
filters, and merged ranges. Computed formula caches are not persisted. The
snapshot contains arrays and plain records rather than internal Maps, so it
can be serialized as JSON or transferred with structured clone.

```ts
import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";

const payload = structuredClone(serializeWorkbook(session.workbook));
const restored = deserializeWorkbook(payload);
```

`deserializeWorkbook` validates the complete payload and rejects unsupported
versions with a stable domain error. Consumers must not persist internal
Workbook, Sheet, Map, or history objects directly.

Storage and file/network transports belong to the consuming application.
Validate a complete incoming snapshot before replacing the current workbook;
failed reads must not partially mutate the active document. Loading another
workbook starts a fresh session history and clears document-specific transient
view state. `activeSheetId` is retained in snapshots as a reopen preference;
ordinary Sheet navigation remains outside undo history. See
[ADR 0003](architecture/0003-state-and-history.md) for the state contract.

## Import Boundary

Import from package roots or declared subpaths only:

```ts
import { createWorkbook } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
```

Paths under `@idea10/core/src`, `@idea10/core/dist`,
`@idea10/sheet-engine/src`, and `@idea10/sheet-engine/dist` are implementation
details and are rejected by repository checks.
