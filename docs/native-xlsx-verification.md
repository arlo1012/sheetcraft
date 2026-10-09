# Native XLSX verification record

Verification date: 2026-10-09. Source baseline: `ui-style-v3`, commit
`173aa37d1bc61d446508457c842aac7fccedcb47`.

The immutable original source archive has SHA-256
`6abf8f2c964d0d7510369b434cd3002b53e726a4fe1830ca8412ec91e8dbf221`.
Core and Web source trees remain byte-identical to that baseline. This migration
changes interchange, qualification, dependency records and documentation; it
does not constitute acceptance of the existing insertion UI.

## Final passing checks

- XLSX package: **485 tests passed in 46 files**, with two test workers to avoid
  the host memory pressure observed during the broad Web suite.
- Full workspace typecheck and production build; XLSX and tools lint; public package
  import verification.
- Formula/sheet Worker browser-target bundle and command roundtrip, executed in
  Bun's Worker runtime. XLSX Worker roundtrip, image media/anchors and malformed
  archive gate passed. These are not Chrome end-to-end checks.
- Compatibility lab: **10 tests passed**, typecheck, browser-target bundle,
  executed Node Worker formula/XLSX roundtrip and refreshed reports. The lab's
  browser bundle is compile-only evidence.
- Sheet-engine: **148 tests passed**. Compatibility catalog and Web UI
  architecture checks passed.
- All **18 frozen external fixture hashes** match their provenance manifest.
- ExcelJS, Formula.js and the SheetJS spreadsheet engine are absent from the
  workspace manifests, root lockfile and runtime imports. CFB remains deliberately
  retained, alongside the established ZIP/XML/crypto helpers.

The existing registry contains 240 function metadata entries. This records
implementation ownership, not exhaustive Excel-equivalence qualification.

## Audit fixes covered by regression tests

- Blank cells remain valid XML after theme or named-style binding.
- Illegal/duplicate/overlong worksheet titles fail explicitly on export; literal
  `_xNNNN_` title text is preserved.
- Merge references and style-table indexes are validated rather than truncated
  or silently replaced with defaults.
- Shared-formula translation is bounded and linear for protected tokens,
  preserves 3D sheet qualifiers, and limits per-formula and aggregate expansion.
- Numeric input uses decimal/exponent lexical validation. ISO dates validate
  their calendar and time components and use UTC when no timezone is specified.
- Cell/cached strings and note text/authors preserve literal escape sequences,
  overlapping escape patterns and XML-forbidden controls through OOXML escapes.
- Final worksheet children follow the SpreadsheetML sequence. Tables,
  backgrounds and sparklines stay at worksheet/root-extension level alongside
  nested conditional-formatting extensions. Ordering is based on the
  [Open XML SDK schema](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_spreadsheetml_2006_main.json).

## Full-workspace gate is still red

The full gate was run rather than inferred from focused passes. Baseline reruns
separate existing failures from this migration:

- Formatting: one unchanged Home data-menu test file.
- Web lint: three unchanged unsafe-optional-chaining warnings.
- Core: 1,561 passed and six failed; all six reproduce baseline. Five assertions
  use old snapshot versions; one SUBTOTAL expectation differs from the result.
- Architecture boundaries: 125 findings, exactly identical to baseline. The 11
  new native-reader local-name scanner hits were removed without weakening the
  checker.
- Broad Web run: 2,296 passed, 60 failure reports and two worker exits. Serial
  reruns completed the two interrupted files and exposed three more old
  assertions. All **54 known assertion failures** reproduce baseline with the
  same errors. All **nine original timeout cases** pass serially on both revisions.
  No failure-name/reason differential remains in this verification scope.
- The six-file Web XLSX module run has 37 passed and the same baseline feedback
  dialog Close-button assertion failure. Worker/image-preparation/action tests
  pass.
- Production bundle budgets exceed the same ten baseline limits. The entry/UI
  assets are unchanged; the native engine substantially reduces deferred code.

These failures were retained and disclosed, not fixed by changing unrelated UI
or weakening assertions. A whole-repository green CI result is not claimed.

## Independent interoperability evidence and pending acceptance

The two-sheet fixture contains invented stationery data only. Both baseline and
native files open through independent Openpyxl 3.1.5 and preserve the formula
sources, cached D8 total 57, currency/percentage/date formats, title/merges,
frozen panes, notes, image payload/anchor and row/column dimensions. This is
independent parser evidence, not an Excel/Calc visual or repair-dialog check.

Shell-only Calc conversion did not produce an output file: the bundled headless
runtime exited 137; the installed official runtime exited 1, with its explicit
graphics backend reporting no X display. Visible desktop interaction is pending
the user's handback. **Actual Calc and Excel-web opening, repair/error checks and
display comparison remain pending.**

The supported image-export path remains distinct from import: drawings/media
still block public import. Tests do not relax that security/compatibility gate.
No claim of full Excel compatibility, pixel-identical fonts or insertion-feature
acceptance is made. No public deployment was performed. This record describes
verification before the isolated review-branch publication; repository publication
does not close the pending desktop or Excel acceptance checks.

## Recovery package

The accompanying recovery archive contains a sanitized source snapshot, a
binary-capable patch against the sanitized baseline, per-file hashes, test
records and the synthetic interoperability samples. Dependencies, build caches,
environment files, credentials and local application profiles are excluded.
Restore and patch reproduction are checked against the complete source manifest.
Actual desktop/Excel acceptance can be resumed from this preserved state.
