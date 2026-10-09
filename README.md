# Sheetcraft

A spreadsheet editor built with Vue 3, TypeScript, TDesign, Vite, Bun, SCSS, and
product-owned CSS tokens. Its runtime-neutral packages provide a sparse
workbook model, reversible commands, versioned snapshots, and headless Sheet
geometry and interaction state.

Workspace packages use the `@sheetcraft/*` namespace. Existing browser storage
keys, JSON format identifiers, clipboard MIME types, and XLSX extension namespaces
retain their original `idea10` values so saved workbooks and settings remain readable.

The Web application supports virtualized cells, range and axis selection,
keyboard navigation, IME-safe editing, row and column resizing and insertion,
TSV clipboard and selective paste, cell and number formatting, format painter,
sorting and value filtering, frozen panes, merged cells, cell and floating images, and multiple Sheet
management. A compact Home Ribbon, formula bar, search, selection summaries,
and Chinese/English localization complete the editing surface.

Clipboard actions skip filtered-out rows and keep each paste atomic for undo.
See [Filtered Clipboard](docs/filtered-clipboard.md) for formula/style handling,
selection rules, and the explicit cut and merged-cell restrictions.

Formulas currently support single-Sheet A1 references, absolute and relative
references, ranges, parentheses, arithmetic (`+`, `-`, `*`, `/`), text, booleans,
comparison and concatenation. The first registry contains `SUM`, `IF`, `IFERROR`,
`AVERAGE`, `COUNT`, `MIN`, `MAX`, and `ROUND`; AutoSum remains available.
The formula bar and in-cell editor share one draft and caret session, including
F2 Point/Edit modes, arrow-reference selection, and Ctrl+F2 surface transfer.
Copying, moving, and changing rows or columns transform references. Cross-Sheet
formulas and functions beyond this first set are not implemented. See
[Formula Editing](docs/formula-editing.md) and [Formula Runtime](docs/formula-runtime.md).

The proposed [Formula and Excel Compatibility Plan](docs/formula-excel-compatibility-plan.md)
defines target scope, ownership, library qualification, and acceptance gates.
It is a design draft, not a list of currently supported features.

The first [Formula Foundation](docs/formula-foundation.md) implementation adds
reviewable function/feature inventories, typed error and empty-string content,
per-workbook date systems, shared reference contracts, and an isolated library
qualification lab. Product runtime progress and XLSX IO are documented separately.

Core writes V6 snapshots and accepts V1 through V6 input. The Web application restores
the current workbook from IndexedDB, automatically saves document edits, and
offers JSON import/export with validation and replacement confirmation. See
[Saving And Recovery](docs/workbook-persistence.md) for the local-only storage
scope, multi-tab conflicts, and recovery guarantees.

[XLSX IO v1](docs/xlsx-io.md) adds browser-Worker import/export with import overwrite
confirmation, direct export downloads, internal compatibility diagnostics, and bounded archive checks.
XLSX is a supported-subset interchange format; JSON bundles remain the complete
backup format for images and product-specific metadata.

See [Images](docs/images.md) for image insertion, movement, clipboard, and portable assets.

Charts, conditional formatting, printing,
additional Ribbon categories, and view/zoom controls remain unimplemented;
their existing disabled UI entries are placeholders.

## Commands

```bash
bun install
bun run dev
bun run test
bun run --filter @sheetcraft/web test -- src/tests/modules/workbook
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run ci
```

The Web test tree mirrors source ownership. For example,
`apps/web/src/modules/workbook/components/` maps to
`apps/web/src/tests/modules/workbook/components/`. Run the matching directory
as the aggregate entry instead of adding a package script per scenario. Core
and Sheet Engine tests run in Node through `bun run test:core` and
`bun run test:sheet-engine`.

`bun run ci` is the complete non-browser gate. It checks formatting, lint,
strict types, all unit tests, package boundaries and public imports, a
browser-target Worker consumer, and production bundle budgets.
It also validates the compatibility catalogs and their offline tests; the
isolated library lab is verified separately without adding product dependencies.

`bun run dev` builds Core, Sheet Engine and XLSX IO first, watches the packages through
TypeScript's dependency graph, and serves Web on `0.0.0.0:7200`. Rebuilt package
exports update the browser through Vite. Use `bun run dev -- --port 7201` for
another port. Occupied ports fail explicitly; Ctrl-C stops the watcher and Web
server together.

See [Development](docs/development.md) for the local edit/verify/commit workflow,
[Web Component Contracts](docs/web-components.md) for shared interactions, and
[Continuous Integration](docs/ci.md) for the Gitea workflow and runner setup.

## UI Composition

Tools are concrete Vue components imported and composed explicitly by their
owning toolbar or surface. Do not describe tool layout with TypeScript schema
objects, component registries, or generic dynamic renderers.

TypeScript objects may describe domain data, state, and command payloads. They
must not become a second declarative UI language.

Use product-owned CSS variables and CSS layers for stable design roles. SCSS
modules organize shared tokens and base styles; scoped SCSS owns
component-specific layout and interaction states.

## Source Modules

- `apps/web/src/app`: Web application bootstrap and top-level composition.
- `apps/web/src/modules/home-tools`: concrete Home Ribbon tool groups and their
  formatting and data menus.
- `apps/web/src/modules/workbook`: formula bar, Sheet tabs, status, and other
  workbook-facing Vue controls.
- `apps/web/src/modules/workbook-persistence`: local storage adapter, save/load
  coordination, file transfer, confirmation, and recovery feedback.
- `apps/web/src/modules/workbook-xlsx`: browser Worker lifecycle, XLSX file
  actions and compatibility-report confirmation.
- `apps/web/src/modules/sheet-grid`: concrete Grid components, clipboard
  adapter, editor lifecycle, viewport, resize, and drag interactions.
- `apps/web/src/shared`: proven cross-module Web primitives, utilities, and
  style tokens.
- `packages/core`: runtime-neutral workbook model, commands, inverse history,
  serialization, styles, input rules, queries, and domain errors.
- `packages/sheet-engine`: runtime-neutral geometry, selection, extent,
  viewport state, and automatic row-height calculations.
- `packages/xlsx-io`: runtime-neutral XLSX byte conversion and compatibility
  reporting, using a pinned browser artifact behind the Web Worker.

Do not create a shared abstraction for code used by only one module.

## Package APIs

Consumers import only the explicit package exports. Deep imports into `src` or
`dist` are unsupported and rejected by the quality gates.

| Package                    | Public subpaths                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@sheetcraft/core`         | `commands`, `history`, `serialization`, `workbook`, `errors`, `runtime`, `clipboard`, `coordinates`, `formula`, `input`, `search`, `selection-summary`, `style`, `style-state` |
| `@sheetcraft/sheet-engine` | `extent`, `frozen-layout`, `geometry`, `row-height`, `selection`, `view-state`, `viewport-layout`, `visibility`                                                                |
| `@sheetcraft/xlsx-io`      | root export: `decodeXlsx`, `encodeXlsx`, typed compatibility reports and errors                                                                                                |

See [Portable Core Consumers](docs/portable-core.md) for deterministic runtime
ports, serializable commands and snapshots, and Worker/server integration.

## Historical Reference

Previous implementations remain available through Git:

- `codex/rebuild-frontend` at `66760f3`
- `refactor/ui-style-v2` at `d349cbc`

Use them to inspect behavior and tests. Reimplement features against the new
requirements instead of copying the old frontend components or dependencies.
