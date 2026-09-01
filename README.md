# idea10

Clean-slate frontend initialized with Vue 3, TypeScript, Vite, Bun, SCSS, and
product-owned CSS tokens. The current milestone provides a focused spreadsheet
editing foundation: a sparse workbook model, command-based undo and redo,
virtualized cells with independently resizable rows and columns, pinned headers,
rectangular range selection, keyboard navigation, in-cell editing with IME-safe
composition, atomic range clearing, TSV clipboard workflows, cell formatting, a
compact Home Ribbon, and selection summaries in the workbook status bar.

Formulas, persistence, additional Ribbon categories, and sheet view or zoom
controls are intentionally outside the current milestone.

## Commands

```bash
bun install
bun run dev
bun run test
bun run --filter @idea10/web test -- src/tests/modules/workbook
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

The development server listens on `0.0.0.0:7200`.

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
- `apps/web/src/modules/workbook`: formula bar, Sheet tabs, status, and other
  workbook-facing Vue controls.
- `apps/web/src/modules/sheet-grid`: concrete Grid components, clipboard
  adapter, editor lifecycle, viewport, resize, and drag interactions.
- `apps/web/src/shared`: proven cross-module Web primitives, utilities, and
  style tokens.
- `packages/core`: runtime-neutral workbook model, commands, inverse history,
  serialization, styles, input rules, queries, and domain errors.
- `packages/sheet-engine`: runtime-neutral geometry, selection, extent,
  viewport state, and automatic row-height calculations.

Do not create a shared abstraction for code used by only one module.

## Package APIs

Consumers import only the explicit package exports. Deep imports into `src` or
`dist` are unsupported and rejected by the quality gates.

| Package                | Public subpaths                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@idea10/core`         | `commands`, `history`, `serialization`, `workbook`, `errors`, `runtime`, `clipboard`, `coordinates`, `input`, `search`, `selection-summary`, `style`, `style-state` |
| `@idea10/sheet-engine` | `extent`, `geometry`, `row-height`, `selection`, `view-state`                                                                                                       |

See [Portable Core Consumers](docs/portable-core.md) for deterministic runtime
ports, serializable commands and snapshots, and Worker/server integration.

## Historical Reference

Previous implementations remain available through Git:

- `codex/rebuild-frontend` at `66760f3`
- `refactor/ui-style-v2` at `d349cbc`

Use them to inspect behavior and tests. Reimplement features against the new
requirements instead of copying the old frontend components or dependencies.
