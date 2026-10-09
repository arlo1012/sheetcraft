# Native XLSX task recovery

Recovery date: 2026-10-09. Source checkpoint:
`refactor/native-xlsx-20261009` at
`897addc40fdeec3837837823172a30d4f0f5b8e8`, tree
`4de3c5bc0b0717cec38ed92b93797e0943c7ac0e`.

The cloud validation environment was replaced. Restoring source does not restore
old local screenshots, application sessions, build output, installed fonts, or
uncommitted acceptance artifacts. This record separates durable historical
evidence from checks performed after recovery.

## Reproducible source checks

`source-manifest-897addc.json` freezes all 1,674 source files from the checkpoint,
including their Git blob SHA-1, byte length, and executable mode. It contains no
credentials, application profiles, dependencies, vendor installers, or build
caches. The 24 checked-in binary XLSX fixtures must be recovered as bytes, rather
than decoded as UTF-8.

For a new checkout or connector snapshot, run:

```sh
node scripts/recovery/verify-pinned-source.mjs . \
  docs/recovery/source-manifest-897addc.json /tmp/source-verification.json
node --test scripts/recovery/verify-pinned-source.test.mjs
```

The verifier compares only files present in this pinned manifest. Later source
changes are expected to report differences; use the result to distinguish them
from a failed restoration. It reports missing and changed files without rewriting
them, and rejects manifest paths or symlinks outside the selected source root.

## Durable historical evidence

- [The checkpoint commit](https://github.com/drlo1012/sheetcraft/commit/897addc40fdeec3837837823172a30d4f0f5b8e8)
  records 632 XLSX tests across 62 files, workspace typecheck/build, scoped
  lint/formatting, package/Worker checks, and the 10-test compatibility lab. Those
  are checks before environment replacement, not new execution evidence.
- [Native verification](../native-xlsx-verification.md) is an earlier record of
  485 XLSX tests across 46 files. Its desktop acceptance statements belong to
  that earlier stage and must not be silently promoted to the later checkpoint.
- [Pivot interoperability](../native-xlsx-pivot-interop.md) preserves the observed
  Calc duplicate-source-field limitation, the baseline/native XML comparison,
  official references, and focused regression coverage. It leaves Excel/WPS
  verification pending.
- The per-function formula registry/menu/scenario matrix is durable in
  `docs/formula-regression-matrix.{json,md}` and its generator remains in
  `scripts/compatibility/formula-regression-matrix.mts`.
- The existing whole-workspace gate has disclosed baseline failures. Focused
  passing checks do not establish a green aggregate gate.

## Checks executed after recovery

- All 1,674 pinned source files matched the frozen Git blob hashes and byte sizes;
  no files were missing or changed. All 24 binary fixtures matched as bytes.
- Bun 1.3.11 installed 398 packages with the frozen lockfile. The lockfile and all
  six manifests remained unchanged.
- Core, Sheet Engine and XLSX packages built successfully. XLSX passed 632 tests
  across 62 files with one worker; XLSX typecheck, scoped lint, public package
  imports and Worker checks passed. Worker execution was in Bun after a browser
  target build and does not establish browser end-to-end behavior.
- Core passed 2,567 tests and failed the same five stale snapshot-version
  assertions out of 2,572 tests. No formula test failed. Core typecheck passed.
- Formula-matrix `--check` failed. The committed generator enumerates directories
  without sorting and selects first matches, so directory creation order changes
  emitted ordering and six reference-case selections. Function/coverage counts
  remain unchanged. Its NA/VALUE implementation locator also matches unrelated
  quoted error codes. A deterministic generator repair is in progress; no green
  matrix gate is claimed here.
- Calc 26.8.1.1 opened a visible blank workbook and its About dialog confirmed the
  version/build. These are runtime readiness checks, not comprehensive workbook
  acceptance. The separately attempted headless smoke did not pass.

Machine-readable result files, full check logs, Calc readiness screenshots and
their checksums are preserved alongside this record. WPS recovery and actual
three-app comprehensive save/reopen acceptance remain pending.

## Acceptance artifacts requiring reconstruction

The checkpoint explicitly excludes the active comprehensive XLSX generator and
matrix. Their generated six paired workbooks, 27 sheets, local screenshots and
save/reopen outputs were not restored from this Git tree. Before replacement,
three-app acceptance remained partial. Those earlier observations must remain
historical until the corresponding files and application behavior are verified
again.

Reconstructed acceptance artifacts must carry their own generation time, source
commit, byte hashes, expected results and real application observations. Preserve
baseline artifacts unchanged. Record baseline gaps, regressions, viewer-specific
degradation and unsupported imports separately. XML validity, a unit-test pass or
an application version string cannot close a visual or save/reopen check.

The delivery sequence remains the one in
[native spreadsheet ownership](../architecture/0005-native-spreadsheet-ownership.md):
finish XLSX/formula and actual Excel-web, Calc and WPS acceptance first; then
insertion parity, reusable packages, and toolbar completion. Preserve the current
ribbon and style. Do not reintroduce ExcelJS, Formula.js or the SheetJS spreadsheet
engine into the product runtime.

## Runtime recovery

- Install the exact project package manager, Bun 1.3.11, from an official source.
  Run `bun install --frozen-lockfile` and verify lock/manifests did not change.
- The official LibreOffice 26.8.1 Linux x86-64 deb archive has 219,791,834 bytes and
  SHA-256 `30903df3b9f61360d9660cd707de48cd2831469114492a5008ed58a0ac77d044`.
  Verify the archive before extracting, and verify a visible Calc workbook in
  addition to its executable version.
- The previous WPS package was version `12.1.2.29182.AK.preread.sw`, 659,809,280
  bytes, SHA-256
  `ca6be0aa3d803c8fb810dc95f888e7221a95d173dc81e2ea5a3e54535b7e9b48`.
  No durable installer backup was verified. Its recovery requires the original
  package or a verified official download; do not guess a URL or silently change
  the validation version.
- Re-establish any needed application sign-in through the supported user flow.
  Do not extract credentials from prior profiles or infer that a new desktop
  session retains an earlier login.

Keep source scripts, matrices, fixture hashes and truthful result records in small
verified remote checkpoints. Exclude vendor installers, credentials and private
browser/application profiles.
