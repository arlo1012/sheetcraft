# idea10 Agent Protocol

## Product State

- This branch is a clean implementation with no compatibility obligation to
  the previous frontend structure.
- Add only behavior requested for the new implementation.
- The `refactor/ui-style-v2` branch is an optional reference when historical
  behavior would resolve a concrete uncertainty. It is neither required nor
  authoritative; implement current requirements against the new architecture.

## Technology

- Vue 3 with `<script setup lang="ts">` and strict TypeScript.
- Vite and Bun for development and builds.
- TDesign Vue is the primary Web UI framework. Use its public APIs directly
  when they fit the product contract; do not create one-to-one wrapper
  components without a repeated product-level need.
- Product-owned CSS variables and layers for stable design tokens.
- SCSS `@use` modules for shared tokens and base styles.
- Scoped SCSS for complex component-specific states.
- Keep necessary TDesign theme mapping and internal overrides in the shared
  TDesign adapter layer. Feature components must not override TDesign internals.
- Lucide Vue is the primary icon set. Add Iconify only when a confirmed domain
  icon cannot be expressed by Lucide.
- Follow the concise [Web UI standards](docs/standards/web-ui.md) for operation
  popovers, spacing ownership, and component-library integration.

## Tool Composition

- Build each tool or cohesive tool group as a concrete Vue component.
- Import and compose tool components explicitly in the owning Vue template.
- Do not render tools from TypeScript schema arrays, generic component
  registries, or `<component :is>` factories.
- TypeScript objects may model data, state, permissions, and command payloads;
  they must not model the visual component tree.
- Before implementing a feature, search the existing modules, components, and
  composables for a suitable capability or abstraction to reuse.
- Consider whether the same interaction or component will recur in later
  features. Extract a loosely coupled common component when the repeated
  contract is clear; keep genuinely one-off behavior inside its owning module.
- Extract shared primitives only when they remove real duplication while
  keeping feature components independently understandable.

## Module Boundaries

- Keep repository orchestration at the workspace root and Web application code
  in `apps/web`.
- `packages/core` owns runtime-neutral workbook state, commands, history,
  serialization, and domain errors. It must not depend on Vue, DOM APIs,
  TDesign, i18n, storage, or networking.
- `packages/sheet-engine` owns runtime-neutral Sheet geometry, selection, view
  state, and interaction contracts. It may depend on `@idea10/core`, never on
  the Web application.
- Keep Web application bootstrap and top-level composition in
  `apps/web/src/app`.
- Put each Web product capability in `apps/web/src/modules/<feature>`.
- A module owns its components, state, commands, tests, and local styles.
- Move Web code to `apps/web/src/shared` only after multiple modules need the
  same stable contract or primitive.
- Dependencies flow from apps to packages and from `sheet-engine` to `core`.
  Packages must never import application code.
- Route user document edits through Core commands so history and change
  notification stay consistent. Persist only versioned snapshots through Web
  storage or transport adapters.
- Avoid barrel files that hide ownership or accumulate implementation logic.
  Package entrypoints are allowed only as thin, explicit public API surfaces.

## Engineering

- Keep this file concise and limited to stable collaboration, architecture, and
  verification rules. Do not record feature behavior, task status, business
  checklists, or historical implementation notes here.
- Keep files focused and avoid implementation-heavy index files.
- Prefer typed props, emits, and slots for component contracts.
- Add dependencies only when an implemented requirement needs them.
- Mirror source ownership in each workspace's test tree, then split each
  matching test directory into small scenario-focused files. Treat that
  directory as the aggregate test entry for its source capability.
- Test `core` and `sheet-engine` in a Node environment. Browser and DOM test
  environments belong to the Web application only.
- For small, localized UI or styling changes, prioritize direct implementation
  and run only a minimal formatting or static check. Do not add or run unit
  tests, full typechecks, builds, bundle checks, or browser/screenshot
  verification by default.
- Use user feedback for visual acceptance. Avoid repeated inspections and
  verification loops; expand checks only when explicitly requested, needed to
  investigate an observed failure, or justified by a substantial correctness risk.
- For changes affecting shared contracts or workbook correctness, run focused
  tests for the affected feature or module. Keep other checks scoped, and do not
  run the full suite unless the affected boundary requires it or the user asks.
- After completing and verifying a small, self-contained requirement, commit it
  promptly with a conventional commit message. Keep unrelated changes out of
  that commit.
