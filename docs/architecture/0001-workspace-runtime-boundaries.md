# ADR 0001: Workspace and Runtime Boundaries

Status: accepted

## Context

The workbook engine will be consumed by the Vue Web application, other
frontends, workers, and server runtimes. The current source tree combines the
Web application and runtime-neutral TypeScript under one Vite package, so the
runtime boundary is conventional rather than enforced.

## Decision

Use a Bun workspace with these ownership boundaries:

- `apps/web` owns the Vue 3 and TDesign application.
- `packages/core` publishes `@idea10/core` and owns workbook state, commands,
  history, serialization, input rules, queries, and domain errors.
- `packages/sheet-engine` publishes `@idea10/sheet-engine` and owns headless
  Sheet geometry, selection, view state, and interaction contracts.

The allowed dependency direction is:

```text
apps/web -> @idea10/sheet-engine -> @idea10/core
apps/web ------------------------> @idea10/core
worker/server/other frontend ----> @idea10/core
```

`@idea10/core` and `@idea10/sheet-engine` target ES2022 and are tested without
DOM libraries. They must not import Vue, TDesign, application i18n, browser
storage, clipboard APIs, or network clients. Runtime capabilities such as ID
generation are supplied through explicit ports when deterministic or portable
behavior matters.

Package entrypoints expose thin, explicit subpath APIs. Application code must
not deep-import package implementation files. Package build output is ESM with
TypeScript declarations. Packages remain private until a release and registry
policy is accepted, while retaining a publishable layout.

## Consequences

- Web-only effects stay in adapters even when their data types originate in a
  package.
- Public commands and snapshots use serializable data contracts.
- Internal Maps may remain for performance, but snapshots use versioned DTOs.
- Root scripts orchestrate package and application checks.
