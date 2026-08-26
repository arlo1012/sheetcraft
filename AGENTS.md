# idea10 Agent Protocol

## Product State

- This branch is a clean implementation with no compatibility obligation to
  the previous frontend structure.
- Add only behavior requested for the new implementation.
- Historical branches are reference material, not code sources to copy by
  default.

## Technology

- Vue 3 with `<script setup lang="ts">` and strict TypeScript.
- Vite and Bun for development and builds.
- Product-owned CSS variables and layers for stable design tokens.
- SCSS `@use` modules for shared tokens and base styles.
- Scoped SCSS for complex component-specific states.
- Lucide Vue is the primary icon set. Add Iconify only when a confirmed domain
  icon cannot be expressed by Lucide.
- Do not add TDesign or another UI framework unless the user explicitly changes
  this decision.

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

- Keep application bootstrap and top-level composition in `src/app`.
- Put each product capability in `src/modules/<feature>`.
- A module owns its components, state, commands, tests, and local styles.
- Move code to `src/shared` only after multiple modules need the same stable
  contract or primitive.
- Avoid barrel files that hide ownership or accumulate implementation logic.

## Engineering

- Keep this file concise and limited to stable collaboration, architecture, and
  verification rules. Do not record feature behavior, task status, business
  checklists, or historical implementation notes here.
- Keep files focused and avoid implementation-heavy index files.
- Prefer typed props, emits, and slots for component contracts.
- Add dependencies only when an implemented requirement needs them.
- Mirror source ownership under `src/tests`, then split each matching test
  directory into small scenario-focused files. Treat that directory as the
  aggregate test entry for its source capability.
- Run only the unit tests for the changed feature or module by default. Do not
  run the full unit-test suite for a small change unless the user asks for it or
  the change affects shared contracts or multiple modules.
- Expand verification only when the change risk or affected boundary requires
  it. Keep typecheck, lint, formatting, and build checks scoped when the tooling
  supports it.
- Use real-browser verification for visible interaction changes.
- After completing and verifying a small, self-contained requirement, commit it
  promptly with a conventional commit message. Keep unrelated changes out of
  that commit.
