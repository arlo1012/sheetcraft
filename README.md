# idea10

Clean-slate frontend initialized with Vue 3, TypeScript, Vite, Bun, Tailwind CSS,
SCSS, and product-owned CSS tokens. The current screen is intentionally an
empty workspace; features will be added from explicit requirements.

## Commands

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build
```

The development server listens on `0.0.0.0:7200`.

## UI Composition

Tools are concrete Vue components imported and composed explicitly by their
owning toolbar or surface. Do not describe tool layout with TypeScript schema
objects, component registries, or generic dynamic renderers.

TypeScript objects may describe domain data, state, and command payloads. They
must not become a second declarative UI language.

Use Tailwind for ordinary layout and spacing. Keep stable design roles in CSS
variables and CSS layers. SCSS modules organize shared tokens and base styles;
scoped SCSS owns component-specific interaction states that are clearer in
semantic selectors. Tailwind's CSS entry remains separate from the Sass compile
path.

## Source Modules

- `src/app`: application bootstrap and top-level composition.
- `src/modules/<feature>`: one product capability and its concrete components.
- `src/shared`: proven cross-module primitives, utilities, and style tokens.
- `src/styles`: global framework entries such as Tailwind.

Do not create a shared abstraction for code used by only one module.

## Historical Reference

Previous implementations remain available through Git:

- `codex/rebuild-frontend` at `66760f3`
- `refactor/ui-style-v2` at `d349cbc`

Use them to inspect behavior and tests. Reimplement features against the new
requirements instead of copying the old frontend components or dependencies.
