# Compatibility Lab

This private development workspace exercises Sheetcraft's first-party formula
runtime and XLSX codec through the public `@sheetcraft/core/formula`,
`@sheetcraft/core/workbook` and `@sheetcraft/xlsx-io` package outputs. It is not
imported by the web application and adds no lab dependency to product runtime.
The repository's root lockfile owns installation; there is no independent lab
lockfile or third-party spreadsheet-engine qualification dependency.

The probes establish only the executed evidence recorded in the generated
report:

- Core formula parsing/evaluation for math, case-insensitive criteria, ranges,
  lazy branches, lookup, per-call date systems, financial/text functions and
  typed errors;
- first-party OOXML encode/decode of a labelled synthetic workbook, including
  values, formula source, dates, number formats, styles, dimensions, filters,
  frozen panes and merges;
- imported-cache discard and recalculation after an input edit, invalid-archive
  rejection and pre-aborted import handling;
- actual resolved runtime dependency metadata, declared development-tool
  metadata and public Core function metadata (not a compatibility count);
- a browser-target Worker bundle, measured from its emitted bytes and SHA-256;
- a Node `worker_threads` formula calculation and XLSX encode/decode smoke.

The browser bundle is compile-only evidence. The Node smoke is Node-only
evidence, never a browser Worker qualification. The lab does not execute Excel
or compare with Excel-authored files and does not claim complete compatibility.

Run from the repository root with Bun and Node 24:

```sh
bun install --frozen-lockfile
bun run build:core
bun run build:xlsx-io
cd tools/compatibility-lab
bun run qualify
```

Build the product packages again after changing them: the lab intentionally
uses their public `dist` exports, without source aliases or internal imports.
`qualify` runs typecheck, tests, browser-target bundling and a Node Worker smoke,
then writes `reports/qualification-report.{md,json}`. These filenames remain
stable for existing report consumers; their purpose is first-party regression
evidence. Reports and bundles are generated, ignored artifacts.

## Regression semantics and limits

- `COUNTIF(A1:A3,"North")` over `North`, `south`, `NORTH` returns `2` under Core's
  case-insensitive criteria rules.
- `DATE` and `WORKDAY` return numeric date serials. A 1904-system call followed
  by a 1900-system call does not change another call's date system.
- `NA()` returns Core's typed `{ kind: "formula-error", code: "NA" }` value;
  errors propagate through referenced ranges, and lazy branches are tested.
- The synthetic `Synthetic Data!C2` source is `=A2+1`. Core computes `42`; the
  encoder writes an eligible formula cache, the importer reports/discards it,
  and Core computes `43` after changing the restored input from `41` to `42`.
  This is calculated synthetic provenance, not Excel-authored evidence.
- Function metadata is the current implementation inventory, not proof of
  exhaustive argument, reference, coercion, array or Excel compatibility.
- Invalid-file and cancellation probes are deliberately small; the package's
  own regression suites cover a broader surface. Neither suite substitutes
  for an external application/oracle corpus.

All fixture data must retain the `synthetic-not-excel-verified` label. License
fields and notice filenames are inventory metadata, not legal clearance;
missing declarations and redistribution obligations need review.
