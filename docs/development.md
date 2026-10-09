# Development Guide

This guide turns the accepted architecture decisions into a feature workflow.
Read the relevant ADRs in `docs/architecture/` when a change crosses one of
these boundaries.

## Put Work In Its Owner

| Concern                                                        | Owner                            | Web responsibility                                                     |
| -------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Workbook data, commands, history, serialization, domain errors | `packages/core`                  | Create and execute public commands; display translated results.        |
| Sheet geometry, selection, view state, interaction contracts   | `packages/sheet-engine`          | Adapt contracts to DOM input and rendering.                            |
| Bootstrap and top-level composition                            | `apps/web/src/app`               | Compose product modules and own application adapters.                  |
| Product capability                                             | `apps/web/src/modules/<feature>` | Own components, local state, command intents, tests, and local styles. |
| Proven cross-module browser primitive                          | `apps/web/src/shared`            | Keep a narrow, stable contract with focused tests.                     |

Packages do not import Vue, browser APIs, TDesign, storage, or application
translations. Import public package subpaths only. Workbook changes travel
through a `@sheetcraft/core` command and history session; do not mutate workbook
state from a Vue component.

## Build A Feature

1. Search the owning module and `src/shared` before adding a component or
   composable. Reuse a stable contract when it fits; keep one-off behavior in
   its feature until another module needs the same contract.
2. Put the visible surface in a concrete Vue component. Import and compose
   tool components directly in the owning template. Do not use component
   registries, schema-driven layout, or `<component :is>` for product UI.
3. Define component boundaries with typed props, emits, and slots. Keep
   command construction and workbook-session execution in the Web adapter,
   such as `src/app/composables/useSpreadsheetWorkspaceController.ts`.
4. Add both locales before exposing a label: visible text, ARIA labels,
   validation feedback, status text, and menu text use `useAppI18n()` and the
   typed schema in `src/shared/i18n/schema.ts`.
5. Put feature layout and interaction state in scoped SCSS. Use semantic
   `--sheetcraft-*` tokens; add framework mappings or approved internal overrides
   only in `src/shared/styles/_tdesign.scss`.

For a new command-backed intent, the component emits a typed payload and its
owner translates that intent to a core command:

```ts
const emit = defineEmits<{ clear: [range: CellRange] }>();

function clearSelection(): void {
  emit("clear", selectionRange.value);
}
```

```ts
execute(createClearCellRangeCommand(activeSheet.value.id, range), "cells.clear");
```

The first snippet belongs to the product surface; the second belongs in the
Web controller or another adapter that owns the `WorkbookSession`.

## Run And Verify

Start normal development from the workspace root:

```bash
bun run dev
```

The root command builds Core and Sheet Engine, starts TypeScript's project
watcher, and launches Vite. It keeps Web imports on public built exports while
propagating package changes to the browser. Compiler diagnostics stay visible;
fix them before expecting current package output. Ctrl-C stops the processes
started by this command. An occupied server port fails rather than selecting
another port silently.

To run an independent development server on another port, pass Vite arguments
through the root command:

```bash
bun run dev -- --port 7201
```

Mirror source ownership in `apps/web/src/tests`. Run the affected test
directory first. Use Node tests for `core` and `sheet-engine`; browser/DOM
tests belong to Web.

Run typecheck, lint, format, build, or the full `bun run ci` gate when a shared
contract, package boundary, build configuration, or multiple modules change.
Use a real browser for substantial visible interactions, uncertain browser
behavior, or high-risk changes such as selection, editing and IME, clipboard,
history, floating focus, localization, or themed rendering.

Commit a completed small feature promptly with a conventional commit message,
for example `feat(web): add sheet action` or `fix(web): retain menu focus`.
