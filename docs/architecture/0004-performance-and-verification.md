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

Cell/floating images and the formula foundation recalibrate the same gates after
an inspected production build: 340,150 B app JavaScript (93,695 B gzip),
825,663 B total JavaScript (243,916 B gzip), 75,800 B app CSS and 216,937 B total
CSS (27,073 B gzip). Limits are 350/97 KB app JavaScript, 850/252 KB total
JavaScript, 78/12 KB app CSS, and 220/28 KB total CSS. Image asset validation,
portable bundles, rendering and gestures add product code without new runtime
dependencies; entry and total gates both remain active.

Image clipboard/conversion and fullscreen preview require another inspected
production build. `TImageViewer` is dynamically imported and its direct
`image-viewer` and `image` modules are placed in higher-priority, non-recursive
TDesign chunks. This keeps the viewer out of the entry's static imports and
HTML preloads; shared TDesign dependencies stay in the regular vendor chunk.
The measured build is 357,133 B app JavaScript (98,667 B gzip), 899,773 B total
JavaScript (261,767 B gzip), 75,876 B app CSS (11,512 B gzip), and 232,804 B
total CSS (30,040 B gzip). The deferred viewer assets are 17,216 B JavaScript
(5,587 B gzip) and 10,844 B CSS (1,867 B gzip). Limits retain practical small
headroom at 360/100 KB app JavaScript, 910/265 KB total JavaScript, 78/12 KB
app CSS, and 240/31 KB total CSS. Total-asset budgets continue to account for
deferred code so lazy loading cannot hide overall bundle growth.

Non-destructive image crop, quarter-turn rotation, and original restoration add
V5 snapshot metadata, shared image presentation, and interaction geometry without
new dependencies. Crop controls and the image toolbar load on demand; transformed
previews retain the deferred TDesign viewer and embed the original image bytes
into a temporary SVG presentation. The inspected production build measures
373,792 B app JavaScript (103,800 B gzip), 923,377 B total JavaScript
(269,326 B gzip), and 77,549 B app CSS (11,699 B gzip). JavaScript limits become
380/106 KB for the app entry and 940/275 KB across all assets. CSS budgets stay
unchanged. Both entry and total checks remain enabled, including deferred tools.

Integrating formula authoring and image editing adds horizontal/vertical flips
with V6 snapshot metadata. The combined production build is 391,478 B entry
JavaScript (109,408 B gzip), 941,398 B total JavaScript (275,000 B gzip),
79,916 B entry CSS (12,091 B gzip), and 239,211 B total CSS (31,464 B gzip).
The measured integration sets entry JavaScript limits to 400/112 KB and total
JavaScript to 960/280 KB. Entry CSS becomes 82/12.5 KB; total CSS retains its
240 KB raw limit and sets gzip to 32 KB. No dependency was added, and deferred
image tools and previews remain included in the total gates.

The compact workbook footer adds searchable sheet navigation, overflow controls,
and active-tab visibility while removing unavailable view/zoom buttons. Its
inspected production build measures 395,019 B entry JavaScript (110,460 B gzip),
83,082 B entry CSS (12,473 B gzip), and 242,377 B total CSS (31,846 B gzip).
The additional 3,166 B of CSS covers the navigation popup, responsive tabs, and
focus states. Raw CSS limits intentionally become 84 KB for the entry and
244 KB for all assets. JavaScript and gzip budgets remain unchanged; the feature
reuses the existing menu/floating primitives and adds no runtime dependency.

Sheet management adds V7 properties, undoable visibility/pinning/tab colors,
and protection enforced by Core commands and Web editing entry points. The
inspected production entry is 409,705 B JavaScript (114,223 B gzip), an increase
of 14,686 B raw over the footer baseline. Total JavaScript is 960,722 B
(280,231 B gzip); entry CSS is 84,318 B (12,627 B gzip). No dependency was added:
the tab color panel uses the existing TDesign color picker. Entry limits become
415/116 KB JavaScript and 86/13 KB CSS; total JavaScript becomes 970/284 KB.
Total CSS budgets remain unchanged, with both entry and total gates enabled.

The compact tab refinement fills inactive tabs and chooses contrasting text and
icons, while active tabs use a neutral background with a colored top edge. Tabs
open their menu directly through right-click or keyboard, and the add button
follows the final tab. Hover darkens custom colors and recalculates foreground
contrast. The inspected build has 84,290 B entry CSS (12,656 B gzip) and 32,029 B
total CSS gzip. The total CSS gzip limit becomes 32,500 B; all other
limits stay unchanged.

The two-row footer adds a synchronized horizontal scrollbar, persisted statistics
preferences, six numeric summaries and selectable digit grouping. Its inspected
production entry measures 424,982 B JavaScript (118,159 B gzip) and 86,576 B CSS
(12,981 B gzip); total JavaScript is 976,338 B (284,270 B gzip) and total CSS is
245,871 B (32,354 B gzip). Limits become 430/120 KB entry JavaScript, 88/13.4 KB
entry CSS, 985/288 KB total JavaScript and 248/33.5 KB total CSS. No dependency
was added, and both entry and total gates remain active.

Scrolling preserves the selection identity in stored view state, so summary,
style and filter computations remain cached. The cell layer uses constant-time
visible-cell deduplication, skips empty merge lookups, moves row panes together,
and reuses unchanged cell styles and render results. Active editor slots always
refresh. In a local Chromium development-build capture at 1617 by 1290 pixels,
60 frame-aligned scroll updates had a median interval of 74.3 ms before these
changes and 30.0 ms afterwards; a 60-step drag-selection capture improved from
45.8 to 16.8 ms. These are comparative diagnostics on an empty worksheet, not a
cross-device timing gate. Regression tests protect unchanged selection-derived
results during scrolling, live editing, image updates, frozen panes and extent
growth.

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
