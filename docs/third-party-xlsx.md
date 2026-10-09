# XLSX helper dependencies and notices

`@sheetcraft/xlsx-io` uses a first-party sparse OOXML reader and writer in
`src/native/`. It does not load ExcelJS, the SheetJS spreadsheet engine, or
Formula.js. Core owns the formula parser, evaluator, function registry, references,
calculation scheduling and workbook state.

The feature still uses established low-level helpers:

- `fflate@0.8.3`: ZIP compression/inflation.
- `fast-xml-parser@5.3.8`: XML parsing and structural validation.
- `@noble/ciphers@2.1.1`, `@noble/hashes@2.0.1`, `@scure/base@2.0.0`:
  cryptography and encoding for the existing Office Agile envelope.
- `cfb@1.2.2`: Compound File Binary container handling for encrypted Office files.
  This package is maintained by the SheetJS organization. It is explicitly retained
  in this migration; replacing it is a separate encryption-container decision.

Core's existing number formatter and solver remain unchanged. Replacing spreadsheet
engines does not mean replacing compression, XML parsing, number formatting or
cryptographic primitives with new implementations.

The deployable records remain at:

- `/third-party/xlsx/NOTICE.txt`
- `/third-party/xlsx/bundle-sbom.json`

These now describe the resolved production helper dependency closure of XLSX IO
and Core, with package versions, declared licenses and hashes of installed license
files. They are **not** a generated bundle inventory and do not assert every
reachable helper appears in every chunk. `bun.lock` records package resolution.

Import regression fixtures include frozen, independently authored ExcelJS and
ClosedXML workbooks. Their provenance is recorded in
`packages/xlsx-io/src/tests/fixtures/external/`; the tests do not execute those
libraries to produce their inputs.

The public decode path retains ZIP preflight, worker isolation and timeout.
The first-party reader rejects unsupported encodings, DTDs/entities, invalid
references and malformed XML; archive and sparse-cell limits remain bounded.
See [native migration](native-xlsx-migration.md) for scope and validation.
