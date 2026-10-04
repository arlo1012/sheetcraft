# idea10 Agent Protocol

## Scope

- Implement only requested behavior against the new architecture; no compatibility
  obligation to the previous frontend. Consult `refactor/ui-style-v2` only as an
  optional, non-authoritative reference for concrete uncertainties.

## Technology

- Vue 3 (`<script setup lang="ts">`), strict TypeScript, Vite, and Bun.
- Use TDesign Vue as the primary Web UI framework; use public APIs directly when they fit.
  No one-to-one wrappers
  without a repeated product need. Keep theme mapping and internal overrides in
  the shared TDesign adapter, never in feature components.
- Use product-owned CSS variables/layers for stable tokens, SCSS `@use` for shared
  tokens/base styles, and scoped SCSS for complex component states.
- Prefer Lucide Vue; add Iconify only for confirmed domain icons Lucide cannot express.
- Follow [Web UI standards](docs/standards/web-ui.md) for operation popovers,
  spacing ownership, and component-library integration.

## Composition

- Implement each tool or cohesive group as a concrete Vue component, explicitly
  imported and composed in its owner's template. No schema arrays, generic
  registries, or `<component :is>` factories. TypeScript objects model data, state,
  permissions, and command payloads, never the visual component tree.
- Search existing modules, components, and composables before implementing.
  Consider future reuse; extract loosely coupled components for clear repeated
  contracts and shared primitives for real duplication. Keep features independently
  understandable and one-off behavior local.
- Build floating content with `shared/floating` and menus with `shared/menu`;
  extend their explicit slots or composables before introducing new positioning,
  dismissal, menu semantics, or overlay layers. Keep TDesign dialogs as direct
  library use unless a repeated product contract exists.
- Prefer typed props, emits, and slots. Keep files focused; avoid barrels that hide
  ownership and implementation-heavy index files. Package entrypoints must be thin,
  explicit public APIs. Add dependencies only for implemented requirements.

## Module Boundaries

- Workspace root: repository orchestration. `apps/web`: Web application.
- `packages/core`: runtime-neutral workbook state, commands, history, serialization,
  and domain errors; no Vue, DOM, TDesign, i18n, storage, or networking dependencies.
- `packages/sheet-engine`: runtime-neutral Sheet geometry, selection, view state,
  and interaction contracts. Dependencies flow apps → packages, sheet-engine → core;
  packages never import application code.
- Within `apps/web/src`: `app` owns bootstrap/top-level composition;
  `modules/<feature>` owns each capability's components, state, commands, tests, and
  local styles; `shared` accepts only stable contracts/primitives needed by multiple modules.
- Route document edits through Core commands for consistent history/notifications.
  Persist only versioned snapshots through Web storage/transport adapters.

## Verification & Delivery

- Mirror source ownership in each workspace's test tree. Use small scenario-focused
  files, with each matching directory as its capability's aggregate test entry.
  Test core/sheet-engine in Node; browser/DOM environments belong only to Web.
- Small, localized UI/style changes: implement directly; run only minimal formatting
  or static checks. By default, do not add/run unit tests, full typechecks, builds,
  bundle checks, or browser/screenshot verification.
- Use user feedback for visual acceptance; avoid repeated verification. Expand checks
  only on request, observed failure, or substantial correctness risk.
- Shared-contract/workbook-correctness changes: run focused feature/module tests.
  Keep other checks scoped; run the full suite only when the boundary requires it
  or the user asks.
- Promptly commit completed, verified, self-contained small requirements using
  conventional commit messages; exclude unrelated changes.
- Keep this file concise: stable collaboration, architecture, and verification rules
  only; no feature behavior, task status, business checklists, or historical notes.
