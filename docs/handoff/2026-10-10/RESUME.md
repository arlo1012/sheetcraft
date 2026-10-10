# Sheetcraft continuation after recovery — 2026-10-10

## Authoritative repository

- Private repository: `https://github.com/arlo1012/sheetcraft.git`.
- Branch: `refactor/native-xlsx-20261009`; read its current remote head before work
  or publication. Do not use a stale local recovery HEAD as the remote lease.
- Published checkpoints: `7ccd` native linked PivotChart export / original three
  producer files; `72bd` exact Excel export acceptance; `32f0` explicit Core manual
  pivot-member ordering; `50ef1ad61e0e29b1d693252de21f79d540a8d25a` bounded import
  WIP and DXF fix. This continuation also records the subsequent WPS post-save
  variant correction and final acceptance. The original README/source-checkpoint
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
reached 75 files / 965 passing tests, and the final cosmetic local-identifier rename
was followed by types/build, scoped lint/format and 88 feature tests. Full Web
typecheck passed. The architecture aggregate remains failed with 126 pre-existing
code-line diagnostics; evidence is retained rather than presenting all-repo CI as
passing. Final independent import review was incomplete.

## Current bounded contract

Read `docs/insert/native-pivotchart-import.md`,
`docs/insert/pivot-manual-member-order.md`, and the two acceptance records. Current
chart support is linked clustered columns with one row field, one column field,
one measure and proven contiguous cached leaf layout. Import/export remain stale
until explicit refresh. Native identity maps to the actual imported PivotTable;
manual display order survives saved layout, snapshots and refresh. Legacy snapshots
1–43 remain readable; manual ordering requires version 44, ordinary writing remains
version 43. Unknown members append in source encounter order within each parent.

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
