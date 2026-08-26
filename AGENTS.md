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
- Tailwind CSS for ordinary layout and spacing.
- Product-owned CSS variables and layers for stable design tokens.
- SCSS `@use` modules for shared tokens and base styles.
- Scoped SCSS for complex component-specific states.
- Keep Tailwind's CSS entry separate from the Sass compile path.
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

- Keep files focused and avoid implementation-heavy index files.
- Prefer typed props, emits, and slots for component contracts.
- Add dependencies only when an implemented requirement needs them.
- Run targeted tests first, then typecheck, lint, format check, and build for
  completed frontend changes.
- Use real-browser verification for visible interaction changes.
- Do not commit unless the user explicitly asks for `提交`.
