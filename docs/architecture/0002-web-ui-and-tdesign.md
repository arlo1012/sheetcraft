# ADR 0002: Web UI and TDesign

Status: accepted

## Context

TDesign is a required part of the Web frontend. Product components also need a
stable visual contract that does not expose third-party implementation details
through every feature stylesheet.

## Decision

TDesign Vue is the primary component framework for `apps/web`. The application
keeps a root `ConfigProvider`, locale synchronization, and direct ESM component
imports for tree shaking.

Product-owned semantic variables use the `--idea-*` prefix. A shared TDesign
adapter maps product theme roles to TDesign variables and contains the small
set of approved framework overrides. Feature styles may use TDesign public
component APIs, but must not target internal `.t-*` structure with local deep
selectors.

Do not wrap every TDesign component. Add a shared UI component only when it
defines a repeated product contract, removes meaningful behavior duplication,
or centralizes accessibility that multiple modules require. Prefer native HTML
controls when they provide the correct semantics without losing required
TDesign behavior.

Visible labels, ARIA labels, status messages, and menu text use the shared Web
translator. Runtime-neutral packages expose operation and error codes, not
localized strings.

## Consequences

- TDesign remains an intentional dependency rather than a migration target.
- Product feature CSS depends on semantic product roles, not copied framework
  internals.
- Framework upgrades have one theme and override review surface.
- Shared primitives remain narrow and evidence-driven.
