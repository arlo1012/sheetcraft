# Sheetcraft continuation after recovery — 2026-10-10

## Table filter-buttons and converted-range continuation

After380cbed, filterColumn metadata fixed the actual buttons-off defect without
losing active criteria. Actual Sheetcraft Alpha filter→buttons off→Undo/Redo→save
reload→UI XLSX export passed. Actual WPS and Excel edit10→11, save-close-reopen
retain criteria/hidden arrows/total11; converted Sheet1 also retains ordinary
=B2*C2 and SUM121 with former South row visible. Final XLSX81files/1158tests pass;
first1154pass/3fail and fixture corrections remain logged. Read
`docs/acceptance/structured-table-filter-buttons-20261010.md`. Partial native
visibility warns and is not represented as full support. Product import GUI,
Medium5 persistence, advanced-filter UI rejection and calculated-column observations
remain open; numeric total literal gate remains. No new raw artifacts uploaded.

## Numeric total limitation and ordinary mixed totals continuation

The ordinary mixed label/SUM109/custom SUBTOTAL101/custom SUM+1/blank fixture now
passed actual Excel and WPS editing, save-close-reopen (30/13/5/132/131). Numeric
literal99 in a total row repaired even from a native WPS producer; the adapter
now blocks that exact literal-number category with location-bearing
CompatibilityError and localized JSON-backup guidance. Core values/snapshots are
not converted. New gate focused tests/types/build passed; full1138 is the prior
checkpoint result. Product gate GUI passed with exact location and successful JSON backup retaining99;
first stale incremental dist/harness failure and force-build recovery are recorded.
Read the totals acceptance continuation and preserved journal. Filter buttons,
full table UI/import and calculated-column observation scope remain open.

## Latest totals repair WIP

After `b3db3eed88ecf06d9f13b9678414150390b10778`, actual native positive and
single-attribute negative controls isolated missing total-column metadata as the
Excel table1 repair cause. The formal regenerated product now opens editable in
Excel and WPS; real edits recalculate30/71/131 in both. The writer derives each
column role from its actual final total cell, retaining custom/label/constant
differences without changing worksheet/cache. Full XLSX1138 tests pass. Read
`docs/acceptance/structured-table-totals-20261010.md` for conservative structured
reference downgrade, failures/checks and still-pending save/reopen/custom/filter
button acceptance. This remains source/text WIP, not full Insert completion.

## New header/filter continuation

After `5e823043b80d4aa7b84456322b68562e79bbdcfb`, the actual no-header/empty,
growth/Tab and convert-to-range product UI paths were exercised. A third actual
header-visibility/filter bounds defect is repaired, with explicit advanced-filter
atomic rejection and localized settings feedback. Read
`docs/acceptance/structured-table-header-20261010.md` for exact final evidence.
WPS formal table editing/save/close/reopen retained 30/71/131, but filter-buttons
visibility differs and both formal product and WPS-saved files trigger Excel
web repair of table1. Keep these failed native results; isolate their causes next.
Do not claim dual-app table acceptance, calculate-column fill, or Medium5
persistence: the downloaded final source proves Medium2 after watcher reload.
New actual artifacts remain local; this checkpoint is source/text only.

## Latest in-progress table acceptance

The checkpoint after `da661700c08654acfaf77985da10cea47cf92390` repairs two
actual Sheetcraft UI defects: implicit own-table column references were not
rewritten on header rename, and explicit resizing retained invalid old filter
bounds, preventing export/autosave. The formal UI recheck now retains a renamed
current-row formula/value, exports the shrunk filtered table, and supports
undo/redo plus browser-local reload. Core table/filter/formula tests and focused
XLSX table tests pass. The expanded Web run retains two unchanged 5-second
reentrant close/navigation timeouts; read the current log and its isolated
diagnostic rerun, not older pass counts. This is a WIP checkpoint, not complete
structured-table/dual-application acceptance.

Read `docs/acceptance/structured-table-lifecycle-20261010.md` and its text-only
evidence directory for the bounded matrix, initial failures, implemented fix,
remaining GUI work and inherited total-row/selector-caption limitations.
Continue no-header/empty creation, style/display, table growth/Tab, conversion,
formal XLSX WPS/Excel lifecycle and WPS-only calculated-column observations.
Do not implement automatic overwrite/fill before its contract is chosen. Further
native chart types are paused. Separate online Insert menu DOM research is
read-only reference; it does not authorize copying proprietary SVGs or expanding
shape geometry. Preserve the user's current browser sessions and few tabs.

## Authoritative repository

- Private repository: `https://github.com/arlo1012/sheetcraft.git`.
- Branch: `refactor/native-xlsx-20261009`; read its current remote head before work
  or publication. Do not use a stale local recovery HEAD as the remote lease.
- Published checkpoints: `7ccd` native linked PivotChart export / original three
  producer files; `72bd` exact Excel export acceptance; `32f0` explicit Core manual
  pivot-member ordering; `50ef1ad61e0e29b1d693252de21f79d540a8d25a` bounded import
  WIP and DXF fix; `e513272666288f9bdbf52c08a5fe6aa38d94411a` verified WPS
  post-save PivotChart import; `de864504e39e2eab95283f523ce253197b60599f` ordinary
  both-header column-oriented native charts. The current continuation adds the
  existing eight ordinary direction/header configurations with disclosed WPS
  text-cache normalization and blank-source limitations. The original README/source-checkpoint
  in this directory describes the earlier recovery, not the latest remote head.
- Preserve existing history. No force update, PR, UI merge or website publication
  is part of these checkpoints. API publication must use the freshly verified
  expected branch head. Local author name is `arlo1012`; do not invent an email or
  claim the API rewrote older commit authors.

## Restore and checks

Restore all source from the current branch through normal authorized Git access
or GitHub blob/tree APIs; verify byte lengths and Git blob hashes. Recover into a
fresh directory rather than overwriting another working copy. This cloud working
copy's local Git HEAD is a synthetic recovery commit, while the index trees were
verified against the actual published GitHub trees. Clone/reconstruct a proper
checkout after reset instead of attempting to push that synthetic history.

Use the repository's frozen Bun lockfile and read AGENTS.md / any relevant local
skills first. Bun 1.3.11 was used. Build Core before the XLSX package, then run the
owned feature tests and package types/build. See the exact check logs under
`docs/acceptance/evidence/native-pivotchart-import-20261010/`; full XLSX package
reached 75 files / 965 passing tests in the prior PivotChart phase. Latest ordinary
column phase reached **76 files / 996 passing tests** after final shared drawing
validation, with XLSX types/build/scoped lint/format and full Web typecheck passed.
The subsequent options continuation reached **77 files / 1,031 passing tests**,
Core chart-data focused 11 and Web chart focused 21. Full Core/Web suites were not
rerun in this phase. Read `docs/acceptance/native-column-options-20261010.md` and
its evidence directory for final checks, preserved initial failures and limitations.
That options checkpoint was published as `9d3020e92e3b4a7d9e5f0a5b35bb69489d3b0da7`.
The bounded exact-empty-string follow-up reached 77 files / 1,040 XLSX tests and
4 files / 168 focused tests, retained all eight actual WPS-saved blank-matrix charts,
and verified their formal reexport in both apps. Its public source-identity proof,
warnings and remaining boundaries are in
`docs/acceptance/native-column-empty-source-20261010.md`.
That exact-empty follow-up was published as
`17dae1ca443207080adc82170aea312b341595aa`. The current bounded straight-marker
line continuation reached **78 files / 1,083 XLSX tests**, focused 5 files / 211,
with owned package types/build/static checks passed and the same 125 architecture
failures. Read `docs/insert/native-line-charts.md` and
`docs/acceptance/native-line-chart-20261010.md` for actual producer/save discrepancy,
numeric/genuine-blank source limits, initial failures and exact GUI scope.
Read `docs/acceptance/native-column-chart-20261010.md` and its evidence directory
for initial failures and exact final logs. The architecture aggregate remains
failed with 125 prior diagnostics and no additions relative to the earlier 126;
owned chart-local lexical symbols were renamed. This is not all-repo CI green.
The prior independent PivotChart import review was incomplete and not repeated.

## Current bounded contract

Read `docs/insert/native-pivotchart-import.md`, `docs/insert/native-column-charts.md`,
`docs/insert/pivot-manual-member-order.md`, and their acceptance records. Linked
clustered columns support one row field, one column field, one measure and proven
contiguous cached leaf layout. Import/export remain stale
until explicit refresh. Native identity maps to the actual imported PivotTable;
manual display order survives saved layout, snapshots and refresh. Legacy snapshots
1–43 remain readable; manual ordering requires version 44, ordinary writing remains
version 43. Unknown members append in source encounter order within each parent.

Ordinary clustered columns now also support a same-sheet contiguous rectangular
source, either series direction and all eight existing header configurations,
with text/blank categories/headers. Headerless 1×1 is deliberately omitted because
its native source cannot prove direction. Actual WPS cached-zero nonempty text can
restore Core missing values only with exact source proof and a located warning.
Exact literal empty-string source is now separately proven and admitted by the
follow-up; null blank, whitespace, numeric-looking text, formulas/errors and
value-labelled zeros still cannot be normalized. The prior six omissions remain
recorded at 9d3020. Do not claim native zero/Core gap fidelity is lossless.
They keep a live evaluator dependency: source changes update immediately without
PivotTable Refresh. Cache/formula proof is mandatory on import; no native identity
is guessed. Zero/negative values and missing numeric points are retained. Hidden
source cells require showHidden=true; other types/layouts remain omissions. No
snapshot model/version changed for this ordinary I/O slice.

Ordinary native lines now use the same exact rectangle/name/category/value proof,
but only unstacked straight visible-circle-marker lines with genuine numeric/blank
points and explicit gaps. Text/cache-zero normalization stays column-only. Unknown
marker/smooth/axes/linked-line variants are not guessed. No bar support is inferred.

The native package admission is explicit and bounded. Media/pictures, unknown
chart families, unexpected namespaces/payloads and unconsumed drawing relations
remain blocked. Unsupported safe cache/layout/reference/geometry variants omit the
individual chart with a located warning. WPS physical placement is approximate,
and native decoration fidelity is explicitly omitted.

## Reproduce synthetic roundtrips

After building Core and XLSX, from the repository root:

    bun scripts/compatibility/create-native-chart-import-roundtrip.mts input.xlsx output.xlsx

Add `refresh` only when explicitly testing the Core refresh command. The helper
calls the compiled public XLSX entry, uses the actual output basename, sets the
chart sheet active, and refuses to overwrite an output or use the input as output.
Use the three already committed WPS files under
`docs/acceptance/evidence/wps-pivotchart-producer-20261010/` as inputs. New GUI-saved
files remain local; their ordinary text/hash results and synthetic structural
regressions are committed, not additional binaries or screenshots.

Both real WPS and logged-in Excel web passed first-open, source 110→120 while
chart/report remained cached at 110/530, explicit native refresh to 120/540,
save-close-reopen with correct fields/order and no Excel repair. The WPS-saved
product was then decoded/reencoded/decoded through the public APIs, retained
120/540 and refreshed 130-source edits to 130/550. Its reexport additionally opened
correctly in Excel. Saved Excel download bytes were not obtained; GUI reopening is
the evidence, not a supposed downloaded producer file.

For the ordinary slice, the public-entry reproduction script supports:

    bun scripts/compatibility/create-native-column-chart.mts seed output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts product output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts options output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts options-blanks output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts roundtrip input.xlsx output.xlsx

The data-only seed is Data!A1:C4 with region/apple/pear; east 60/70;
north 100/80; south 120/90. Create its real native chart in WPS via Insert → Column
→ first clustered option. Both WPS and Excel passed product first-open, B3
100→110 immediate update, save/close/reopen. The actual WPS-saved file's public
reimport/reexport opened correctly in Excel at 110. The WPS-created producer's
public reexport also opened correctly in WPS at 100; its implicit default title
placeholder is deliberately not recreated. Native style/geometry warnings remain.
New ordinary GUI files/raw XML/screenshots are local only; no new binary is a
cross-reset dependency. Preserve the committed code, synthetic structure and
recipe, and recreate after reset. Do not upload additional GUI artifacts without
specific authority. Both test views were closed back to app Home.

## Applications after an environment reset

User has authorized restoring the project and installing official WPS again.
Current cloud installation was official WPS 12.1.2.29182; installer SHA-256 is
`ca6be0aa3d803c8fb810dc95f888e7221a95d173dc81e2ea5a3e54535b7e9b48`.
The currently working `/workspace/shared/apps/wps-sheet.sh` applies writable
HOME/XDG paths and the official library/init environment; do not assume calling
`office6/et` directly recreates that environment. Re-establish that setup from the
official vendor if absent. New, materially different terms or permissions require
normal disclosure/approval. Keep cloud sync disabled and use synthetic local files.

Use the current authenticated Excel web session if available. Do not extract,
store, upload or restore cookies, profiles or account credentials. If login is lost,
Excel may be skipped with a clear “not revalidated” result while WPS/code continue;
user can sign in again separately. No login state is part of the recovery material.
Keep only the active test document/window and close saved synthetic views afterward.

## Remaining route

This completes only the current bounded native export/import slice, not all insert
features or native drawing import. Continue the agreed insert capability roadmap
in small verified groups, then independent I/O and formula-core APIs, remaining
existing toolbar parity, and only afterward a whole-round UI merge. Expand chart
families/layouts only from actual producer evidence plus focused regressions.

## Ordinary horizontal bar continuation

Line checkpoint `7111852c606bad20c165334aa1242b673b799186` is the verified parent.
Actual WPS clustered-bar producer proves category-left/value-bottom minMax axes
and first source category bottom-most; Core/Web semantics unchanged. All eight
series/header configurations passed WPS/Excel live21→41 and save/close/reopen.
Native edited111/gap and formal WPS-save reexports also passed scoped Excel
first-open checks. XLSX1120/focused248 and owned static checks passed; existing
125 architecture diagnostics unchanged. New GUI artifacts remain local.
See [bar contract](../../insert/native-bar-charts.md) and
[acceptance](../../acceptance/native-bar-chart-20261010.md).

## Existing object editor rejection/lifecycle closure

Verified remote parent is horizontal-bar `9d8fbde5e5615089a396fc694c77153c20edf371`.
Drawings/camera/controls each reproduced insert/edit draft loss on execute=false;
drawings also accepted a replaced workbook with the same sheet ID. Initial7failed/
35passed, then final90 action /108 feature-DOM /222 related workspace tests passed.
Captured session callbacks, actual identity/generation, reentry and permissions
are guarded; unchanged existing no-opfalse still closes, rejected edits keep inputs.
Web types and owned static passed;125 architecture diagnostics remain, one line
location shifted with no semantic additions. No new GUI/native phase claimed.
[Acceptance](../../acceptance/insert-dialog-guards-20261010.md) and
[current complete Insert inventory](../../insert/current-scope-20261010.md) separate
implemented product paths, unverified/current native limits and real feature gaps.
