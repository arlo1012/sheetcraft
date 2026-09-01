# ADR 0004: Performance And Verification Gates

Status: accepted

## Context

The runtime packages are intended for Web, Worker, server, and other frontend
consumers. The Web application also contains a virtualized Grid and a sizable
third-party UI dependency. Type correctness alone does not protect runtime
portability, interaction behavior, history payload size, or production bundle
cost.

## Decision

The root `ci` script is the complete non-browser gate. It runs formatting,
lint, strict type checks, Node and Web unit tests, architecture boundaries,
built-package public import checks, a browser-target Worker bundle and message
round trip, and production bundle budgets.

Core structural history stores sparse axis slices for row and column changes.
An inverse records only deleted entries or entries truncated at the final axis
boundary. It must not snapshot unrelated cells or dimensions. Full Sheet state
replacement remains an explicit internal command for cases that actually need
it.

The Web build uses stable app, Vue, TDesign, and icon chunks. Bundle budgets
measure both the app entry and all JavaScript and CSS assets in raw and gzip
bytes. Budget changes require a production build and an intentional config
update; generated asset hashes are not committed.

High-risk visible interaction changes additionally require a real-browser
regression. The regression covers selection, editing and IME, clipboard,
history shortcuts, row and column operations, Sheet view-state restoration,
floating focus behavior, localization, and both token themes. Browser checks
remain an explicit release activity until a maintained end-to-end suite is
introduced.

## Consequences

- Runtime-neutral package regressions fail before Web deployment.
- Axis history cost grows with the affected sparse slice rather than the whole
  Sheet.
- Vendor chunking cannot hide growth in the app entry or total assets.
- Unit tests remain the fast default for local feature work, while shared or
  high-risk changes expand to the root gate and browser evidence.
