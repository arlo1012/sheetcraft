# Version 2 structured-table paired acceptance

The default acceptance workload now uses input schema 2 and preserves its evidence
in `generated-v2-20261010/`. This is a separately identified immutable run. The
original schema-1 run and the first runtime-fingerprinted schema-1 run are retained
unchanged and can still be inspected with their original provenance.

## Source and runtime state

Native source/manifests were locally committed at
`9d5763e9bfe7f427ab432598e7d8ea2fe0679c39`. This record does not claim that the
commit was remotely pushed. Baseline remains fixed at
`173aa37d1bc61d446508457c842aac7fccedcb47`, with all 196 pinned restoration files
verified before its run.

- Input SHA-256:
  `5dd9ec119f09cdf5b88b8131753e536a0aeec908d087f6f0fc197f136530c27f`
- Native runtime-source SHA-256:
  `5caac12cb5e5667b11e768eb2fc37c34889601a0e4200f5e3f385d6aa9e0b0dd`
- Native executed-Core SHA-256:
  `22072e1126982643d95ccf86b7794cdc3a53380d5ff3e420fffb361c9b294541`
- Baseline runtime-source SHA-256:
  `74c414771b2fde4d1b68f6f1cf24915622012768cc207f29dad34bc186bfd87b`
- Baseline executed-Core SHA-256:
  `2e5f1aa531fc953cb575b182cf6764742c1b60f5ccfa090baa94ee8c3464fe00`

The runner forced successful scoped Core builds at 00:43:33–00:43:38 UTC for
baseline and 00:43:41–00:43:52 UTC for native on 2026-10-10. It preserved and
fingerprinted all 140 executed Core JavaScript modules for each adapter. Source
and executed runtime bytes stayed stable during generation.

## New command-driven checks

The existing Sales Source table gains a Row Total column through actual Core
commands. E2:E5 keep the original Core formula `=[@Amount]*[@Units]`. Their
sorted-row values and exported numeric caches are 200, 120, 60 and 20. E7 uses
`=SUM(SalesTable[Row Total])` and must compute/cache 400.

Native stored formula XML expands to
`SalesTable[[#This Row],[Amount]]*SalesTable[[#This Row],[Units]]`, while original
Core sources remain unchanged. Excel's `@` shorthand remains valid. These four
stored-form checks target Calc interoperability and do not establish general
Excel invalidity or a real-app recalculation result.

The product-path check then decodes each exported workbook, clones its imported
snapshot, and applies a Core command changing Sales Source!C2 from 40 to 60.
A fresh Core evaluator must calculate E2 as 300 and E7 as 500 in both adapters.
The verifier checks the edit command, address, content, imported-sheet target and
edited snapshot provenance. Original workbook bytes are untouched.

## Result and limits

The run contains six workbook groups, 12 originals, and 16 actual XML worksheets
per adapter: styles 4, geometry 3, data/pivots 3, rules/notes/links 3, images 1,
protection/print 2. Separate diagnostic workbooks are not counted in this matrix.

All 285 native expected checks passed. Pair classification is 274 paired passes,
eight native improvements, one known omission and two unsupported-import checks.
There are no native regressions, shared matrix failures or blocked cases. All six
pre-export command snapshots match across adapters. The four extra improvements
over schema 1 are the explicitly Calc-targeted stored-form assertions.

The corrected evidence verifier passes. Fifty focused harness/tampering tests,
scoped lint and formatting pass. The schema catalog accepts frozen schema 1 and
current schema 2 and fails closed for unknown versions.

A subsequent review independently pinned the style-default and eleven semantic
number-format expected representations. Coordinated tampering of both adapters'
expected/actual values and recomputed paired records now fails verification.
No frozen input, adapter report, runtime snapshot or workbook was changed by that
verifier repair. Standalone verification checks recorded source-manifest digest
consistency; checkout source-byte consistency is a separate execution check.

Actual application testing must independently force hard recalculation, edit C2,
verify E2/E7, then save, close and reopen. Clear the filter and expand outlines in
an isolated test copy if the West row is hidden. Preserve originals and record
those inspection changes. Canonical XML, caches and product Core recalculation
cannot substitute for the current Excel web/WPS application evidence.

The current application gate is Excel web and WPS desktop only, following the
user's updated scope on 2026-10-10. LibreOffice testing is stopped and its
save/reopen checks are no longer required. The frozen 36-entry three-app template
and Calc-targeted machine assertions remain historical evidence; future
scope-version-2 templates contain 24 Excel/WPS observations. Stage 1 was open at
this recorded checkpoint; its later conditional conclusion and remaining limits
are in the [current application checkpoint](app-checkpoint-20261010.md).
