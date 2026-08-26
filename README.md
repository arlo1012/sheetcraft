# idea10

Clean-slate frontend initialized with Vue 3, TypeScript, Vite, Bun, SCSS, and
product-owned CSS tokens. The current milestone provides a focused spreadsheet
editing foundation: a sparse workbook model, command-based undo and redo,
virtualized fixed-size cells, pinned headers, single-cell selection, keyboard
navigation, and in-cell editing with IME-safe composition.

Formulas, formatting, clipboard operations, multi-cell ranges, persistence, and
Ribbon tools are intentionally outside the current milestone.

## Commands

```bash
bun install
bun run dev
bun run test
bun run test -- src/tests/modules/workbook/input
bun run typecheck
bun run lint
bun run format:check
bun run build
```

The test tree mirrors source ownership. For example,
`src/modules/workbook/input.ts` maps to `src/tests/modules/workbook/input/`,
where number, text, and formatting scenarios live in small test files. Run that
directory as its aggregate entry instead of adding a package script per case.

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

- `src/app`: application bootstrap and top-level composition.
- `src/modules/workbook`: sparse workbook data, input parsing, commands, and
  inverse-command history.
- `src/modules/sheet-grid`: viewport geometry, selection movement, concrete grid
  components, and editor interactions.
- `src/shared`: proven cross-module primitives, utilities, and style tokens.

Do not create a shared abstraction for code used by only one module.

## Historical Reference

Previous implementations remain available through Git:

- `codex/rebuild-frontend` at `66760f3`
- `refactor/ui-style-v2` at `d349cbc`

Use them to inspect behavior and tests. Reimplement features against the new
requirements instead of copying the old frontend components or dependencies.
