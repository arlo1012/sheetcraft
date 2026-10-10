# Residual-qualified iterative XLSX caches, 2026-10-10

Local production: `1b498934dc9a58922a08514db8fa29f64780f86b`.
Required applications are Excel for the web and WPS desktop. This checkpoint
changes only XLSX export qualification and its focused tests; Core, source
formulas, workbook calculation policy and `ca` serialization remain unchanged.

## App-authored evidence and one-factor diagnosis

Under the user's approved temporary WPS iteration setting of 50 / 0.0001,
a new native synthetic B3 formula `=(B3+1)/2` converged near 1. Changing the
source to `=(B3+2)/2` genuinely recalculated near 2, saved and survived full
document close/fresh reopen. Actual native WPS bytes contain numeric caches,
`ca=1` and iterate/count/delta. The setting was restored to its original
unchecked / 100 / 0.001 and verified after closing the test. The same native
WPS file uploaded to Excel also passed actual formula edit/recalculation,
save/full close/fresh reopen, with a real downloaded saved package.

Fresh public-Core source at the preceding `6bf91e7` checkpoint produced a
valid iteration policy and genuine value `0.99993896484375`, but the writer's
acyclic-only eligibility rejected every cycle, leaving no `<v>`. Three
immutable one-factor files were compared in Excel:

| Input                           | First-load B3 |
| ------------------------------- | ------------- |
| No cache, no `ca`               | `#VALUE!`     |
| `ca=1` only                     | `#VALUE!`     |
| Genuine Core numeric cache only | `0.9999695`   |

The numeric-cache factor alone cured this exact initial-load failure. Its
first value advanced beyond the input cache, and a true keyboard source edit
to +2 recalculated near 2. All three recovered files were saved, fully closed,
freshly reopened at the same opaque identity, and actually downloaded. Their
saved formulas/cache/iteration policy were inspected. Baseline recovery was
preceded by an unsuccessful DOM-only input attempt that re-entered the old
source; that caveat does not affect its clean initial-load observation. Seven
nonblank safe JPEGs are retained; two blank captures remain quarantined and
are not evidence.

## Export contract

The new allowance exports an immutable snapshot of genuine finite Core values.
It first resolves the qualifying loops, then captures and checks their closure:

- Every cyclic member needs a finite same-memo original-source residual at most
  the workbook's maxChange; export the original Core value, never the rechecked
  number or an invented exact solution.
- Acyclic bridges and consumers must exactly match the same memo. Inconsistent
  stale bridge values and reverse dependents are rejected.
- Unknown/parse/missing/external/out-of-bounds sources, explicit error tokens,
  erroneous materialized/formula dependencies, nonfinite/nonnumeric loop
  results, volatile loop paths and uncertain array/spill sources are excluded.
  SUMIF remains conservatively outside this allowance.
- Supported inline scalar error handling can qualify. IFERROR cannot launder
  an unsafe referenced dependency into the allowance.
- Disabled iteration and finite capped nonconvergence remain uncached with the
  existing formula-not-calculated report. `=B3+1` has residual 1 and is rejected
  at the tested 50 / 0.0001 policy.
- Sparse indexing, nonrecursive graph/SCC/reverse propagation and the existing
  acyclic cache/error path are retained. Later unrelated evaluator reads cannot
  mix new values into the export-owned frozen cache map.

A small residual qualifies an approximation; it does not prove that Core stopped
before the iteration cap. This is a bounded export repair, not a new solver or
universal cyclic-formula compatibility guarantee.

## Verification

The exact production source passed 70 focused tests and 842 XLSX tests in 71
files, plus forced package build, XLSX typecheck/lint, changed-file formatting,
public built package imports and the browser XLSX Worker gate. Core source and
its 140 compiled JS files remain identical to the 2,591-test checkpoint; that
Core suite was not redundantly rerun. Whole-project CI is not claimed.

The first default-parallel full run passed 841 tests but an unchanged encryption
salt/key test exceeded its existing 5-second timeout at 5.68 seconds. The original
failed log is preserved. The same source passed all 842 using two workers,
without changing any test timeout or source.

A new clean public-package sample uses Core commands and actual encodeXlsx,
without any cache provider. Its SHA-256 is
`cc6307959fa20f95858b870d702f931f1165e82ee4c90d986fc760afac12029b`
(3,354 bytes). Relative to the immutable pre-fix sample, only worksheet1 changes,
by the exact `<v>0.99993896484375</v>` insertion. All seven uncompressed parts
are identical to the successful cache-only factor; the ZIP container differs.
Source, fixture and all 199 compiled Core/IO JS bytes are bound and retained.

## Final production-app boundary

WPS initially displays the genuine cache with its original iteration setting
unchecked / 100 / 0.001. A real +2 formula commit then returns 0 while iteration
is disabled. The WPS-authored native control behaves the same after true F2/Enter
source re-entry, so cached first display must not be labelled successful
recalculation. With the approved temporary 50 / 0.0001 setting, the production
source's single +2 commit genuinely recalculated to `1.999938965`, saved, fully
closed and freshly reopened at `1.999984741`. Actual saved output is 7,649 bytes,
SHA-256 `9493985b8bef06e68c30a1e35aa13233079b03b43901cf7caa5c06977220d2a6`.
Its OOXML retains +2, `ca=1`, cache `1.99996948242187` and iterate 50 / 0.0001.
The original setting was restored and verified after the test document closed.
In this WPS build/session, actual iterative edits require an enabled application
iteration preference, including its own native file; the export does not override it.

Excel's final public-production file initially displays `0.9999695`, advancing
beyond the original Core cache. Exact +2 genuinely recalculated to `1.999939`,
saved and survived complete tab close/fresh reopen of the same opaque identity,
which displayed `1.9999695` with the exact +2 source and saved status. The actual
download is 5,661 bytes, SHA-256
`afd224e2306b16e80fc57b67694520b072d768b13a9ef7b923674385cfcc92db`.
Its stored +2 cache is `1.99993896484375`, distinct from the advanced runtime
reopen value, and its policy remains iterate 50 / 0.0001. Excel itself adds
`ca=1`; the product output did not need that flag.

The initial Excel load is clean. During editing, a Control+A input mistake
committed a joined comparison formula and FALSE; Undo restored exact +1 and
near 1. A grid-selector timeout made no source change. Visible Home/Shift+End
selection and clearing then committed exact +2. These extra UI steps are
recorded, so the final edit is not described as a single clean attempt. Fifteen
nonblank safe final-app screenshots and both actual saved packages are retained.
Owned test documents/tabs were closed; the prior starred WPS document was not
edited or saved.

Evidence directories, retained as milestone Library materials:
`wps-authored-iteration-20261010/accepted-run`,
`excel-native-iteration-control-20261010`,
`iteration-export-diagnosis-20261010`,
`iteration-export-controls-gui-20261010`,
`iteration-cache-production-verification-20261010`,
`iteration-cache-production-sample-20261010` and the final
`iteration-cache-production-gui-20261010`.

The local commit has not been pushed while the earlier GitHub cancellation
remains unresolved. Stage 1 remains open; the reproduced Excel uploaded-workbook
floating-picture visibility issue is not eliminated by this formula fix.
