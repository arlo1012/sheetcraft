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

The Worker smoke transfers a snapshot and command, evaluates a formula, checks
undo/redo and Sheet geometry, and validates the returned snapshot in the host.
It runs in Bun's Worker runtime after browser-target bundling; real-browser
interaction checks remain separate. Gitea Actions runs the root gate on pushes
and pull requests when repository Actions and a matching runner are enabled;
see [Continuous Integration](../ci.md) for the deployment requirements.

Core structural history stores sparse axis slices for row and column changes.
An inverse records only deleted entries or entries truncated at the final axis
boundary. It must not snapshot unrelated cells or dimensions. Full Sheet state
replacement remains an explicit internal command for cases that actually need
it.

The Web build uses stable app, Vue, TDesign, and icon chunks. Bundle budgets
measure both the app entry and all JavaScript and CSS assets in raw and gzip
bytes. Budget changes require a production build and an intentional config
update; generated asset hashes are not committed.

The local-persistence feature deliberately recalibrates the bundle budgets for
its storage/file coordination and TDesign's confirmation dialog. The measured
production build is approximately 301 KB app JavaScript (82 KB gzip), 786 KB
total JavaScript (232 KB gzip), and 214 KB total CSS (27 KB gzip). Limits retain
small headroom at 315/86 KB app JavaScript, 815/242 KB total JavaScript, and
220 KB total CSS; the existing CSS gzip limit stays unchanged. No dependency
was added, and both entry and total-asset checks remain enabled.

Cell/floating images and the formula foundation recalibrate the same gates after
an inspected production build: 340,150 B app JavaScript (93,695 B gzip),
825,663 B total JavaScript (243,916 B gzip), 75,800 B app CSS and 216,937 B total
CSS (27,073 B gzip). Limits are 350/97 KB app JavaScript, 850/252 KB total
JavaScript, 78/12 KB app CSS, and 220/28 KB total CSS. Image asset validation,
portable bundles, rendering and gestures add product code without new runtime
dependencies; entry and total gates both remain active.

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
