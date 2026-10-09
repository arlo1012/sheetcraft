# Native spreadsheet ownership and delivery sequence

## Decision

Sheetcraft owns the spreadsheet middle layer: workbook state, commands, formula
semantics, XLSX feature mapping, diagnostics and fidelity rules. ExcelJS,
SheetJS and Formula.js are not production engines or replacement adapters.

This is not a zero-dependency requirement. Mature low-level libraries are
appropriate for ZIP, XML parsing/building, encryption and cryptographic
primitives. The native XLSX implementation currently uses `fflate` and
`fast-xml-parser`; `cfb` and the existing cryptographic helpers remain deliberate
dependencies. Domain-specific XML generation is controlled by the first-party
writer, with shared escaping, relationship, namespace and worksheet-order
helpers. A general XML builder may replace repeated low-level string handling
when reliability or maintainability justifies it, without changing ownership of
spreadsheet behavior.

## Current module boundaries

- `@sheetcraft/xlsx-io` is a runtime-neutral workspace package. Its public
  entrypoint exposes workbook import/export and encryption. The native OOXML
  adapter is internal to `packages/xlsx-io/src/native`.
- Formula evaluation is first-party code in `packages/core/src/formula`, exposed
  through `@sheetcraft/core/formula`. It currently remains part of the Core
  package; directory separation does not mean independent dependency ownership.
- Web UI calls package APIs and Core commands. Neither XLSX I/O nor formula
  business rules should depend on Vue, TDesign, DOM, storage or networking.

## Required delivery sequence

1. Finish native XLSX/formula regression and comprehensive acceptance. Use actual
   product command/export paths, paired baseline/native cases, and real Excel
   web, LibreOffice Calc and WPS desktop evidence. Record supported fidelity,
   existing omissions, viewer-specific degradation and regressions separately.
   A smoke workbook or XML parsing success cannot close this gate.
2. Complete requested insertion features, dialogs and interactions against WPS
   desktop parity, with focused command/history and UI tests. Begin only after
   the preceding acceptance gate is resolved.
3. Isolate two reusable packages immediately after functional stabilization:
   refine the existing XLSX I/O package and extract a standalone formula package.
   Keep the formula host contract independent; place Core integration in an
   optional adapter with no dependency cycle. Verify separate imports, tests,
   Worker use and external-consumer builds.
4. Audit every existing toolbar entry and placeholder, then complete missing or
   unwired tools against WPS desktop behavior and dialog details. Preserve the
   established top-toolbar visual style and mature modules. Acceptance requires
   real action, resulting state, persistence and XLSX exchange where relevant;
   a visible or clickable button alone does not establish completion.

For each feature, consult official WPS and Excel help or product descriptions
alongside actual desktop interaction. Record options, inputs and outputs,
constraints and edge cases as a behavior specification and acceptance cases.
Label desktop and web editions separately; a web edition's limitations do not
define the ceiling for desktop parity. Implement from this evidence rather than
guessing behavior from a button or dialog screenshot.

Continue work on `refactor/native-xlsx-20261009`. Commit verified self-contained
small requirements; push completed rounds with truthful acceptance notes. Merge
into the UI branch only after the whole requested round is complete. This plan
does not authorize npm publication, repository visibility changes or public
deployment.
