# Compatibility Lab

This is an isolated Node 24 qualification package. It is intentionally outside
the workspace globs and does not introduce Formula.js or ExcelJS to product
runtime dependencies.

The probes establish only the executed evidence recorded in the generated
report:

- direct Formula.js calls for a small, labelled representative sample;
- ExcelJS in-memory XLSX write/read of a synthetic fixture;
- cache provenance, known losses, an actual resolved runtime dependency tree,
  a separate installed development inventory, and a browser / Worker-target
  bundle attempt;
- a Node `worker_threads` import smoke. It is Node-only evidence, never a
  browser Worker qualification.

They do not execute Excel, compare with an Excel-generated fixture, parse or
evaluate formulas themselves, or claim Excel compatibility.

```sh
cd tools/compatibility-lab
bun install --frozen-lockfile
bun run qualify
```

All fixture data is synthetic and must not be labelled Excel-verified.

`qualify` writes `reports/qualification-report.{md,json}` after typecheck,
tests, browser-target bundling, and the Node worker smoke all complete. The
bundle size and SHA-256 are measured from the emitted bundle; bundling remains
compile-only evidence. License fields are inventory metadata, not legal
clearance; `UNSPECIFIED` entries and all obligations need legal review.

## Initial observations (2026-09-05)

The lockfile pins Formula.js 4.6.1 and ExcelJS 4.4.0. The initial run passed
three test cases containing the labelled probes and a Node-worker import smoke.
Formula.js exposes 399 top-level exports in this package; export count is not
an Excel function-coverage count.

- Direct `COUNTIF(["North", "south", "NORTH"], "North")` returned `1`; criteria
  case/coercion rules need adaptation and Excel-authored comparison vectors.
- Date calls return JavaScript dates in the exercised default mode. Per-workbook
  date-system and timezone isolation remain unqualified.
- ExcelJS round-trips the supplied formula cache; it does not produce a newly
  calculated value. This is not an Excel-authored roundtrip fixture.
- The unminified browser-target bundle measured 1,776,413 bytes. This is a lab
  artifact, not a product-entry size estimate; browser execution is untested.
- License metadata and notice filenames are inventoried, including legacy
  `licenses` declarations. `buffers@0.1.1` has no declaration in its installed
  manifest and remains unresolved. jStat declares MIT in its legacy metadata
  and includes a LICENSE file. This inventory is not redistribution clearance.

The result is an adapter qualification baseline, not approval to wire either
library directly into Core or to promise complete Excel fidelity.
