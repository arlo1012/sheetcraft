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

The formula-authoring interaction adds one shared completion/reference editor
used by both the grid and formula bar: caret scanning, a localized floating
listbox with argument help, reference drag state, and absolute-reference cycling.
The first measured production entry is 324,042 B raw / 89,258 B gzip versus the
preceding 313,274 B / 85,997 B baseline. This is product behavior, with no new
dependency or formula-library runtime. The entry limit is deliberately adjusted
to 330,000 B / 91,000 B to include that capability and a small integration margin.
Total JavaScript and all CSS limits remain unchanged; splitting code into another
chunk must not be used to evade the total check. The editor is loaded with the
workspace so immediate typing and reference picking have no asynchronous handoff.

The colored-reference follow-up adds a shared native-textarea mirror, all-reference
tokenization, theme-aware range colors, and validated closing-parenthesis completion.
The measured entry is 329,676 B / 91,036 B gzip, with 815,002 B total JavaScript;
entry CSS is 75,486 B and total CSS gzip is 27,063 B. Relative to the completed
authoring baseline (324,502 B / 89,442 B entry JavaScript and 74,443 B entry CSS),
the added behavior costs about 5.2 KB JavaScript and 1.0 KB CSS, without dependencies.
The entry JavaScript raw limit stays 330,000 B; its gzip limit becomes 92,000 B.
Total JavaScript raw becomes 816,000 B, entry CSS raw 76,000 B, and total CSS gzip
27,500 B. Other limits remain unchanged. These measured adjustments keep both
entry and total checks enabled with small headroom.

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
