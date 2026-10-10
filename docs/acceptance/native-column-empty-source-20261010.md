# Exact empty-string chart source follow-up — 2026-10-10

Parent checkpoint: `9d3020e92e3b4a7d9e5f0a5b35bb69489d3b0da7`.
This closes only the six WPS-saved empty-string chart omissions reported there.
The earlier failed import result and its boundaries remain in that checkpoint.
No Core semantics/model/version, source rectangle, UI configuration or generic
drawing admission changed. New GUI files, raw XML, parsed producer JSON and
screenshots remain local; only code, synthetic regressions and text are preserved.

## Read-only source proof before implementation

In the actual saved eight-sheet blank-label producer, A2 and B1 remain shared-
string empty text. Public `decodeXlsx` preserves each as literal string `""`.
The genuine missing C3 cell decodes as null; genuine numeric zero retains numeric
literal identity. Thus the public source contract distinguishes the observed empty
text from both blank and real zero. No inference from cache zero alone is needed.

The importer now admits only an exact empty literal string in addition to its
previously proven nonempty nonnumeric literal text exception. It still requires
the exact validated value reference, evaluated Core missing point, actual numeric
cache zero and disabled value labels, and emits `chart-cache-normalized`.
Null blank cells, whitespace-only or numeric-looking text, booleans, formulas and
errors, wrong references, mismatching real numbers and value-labelled zero remain
excluded. Real numeric zero passes exact comparison without normalization.
Native cached zero versus Core missing/gap is still an explicit visual difference;
this is not a promise of lossless native presentation.

## Synthetic and actual public I/O proof

- Direct boundary test now accepts a literal empty-string zero with warning and
  rejects an otherwise identical chart with displayed value labels.
- Eight synthetic WPS-like configurations distinguish empty A2/B1 from blank C3
  and real numeric C4 zero, prove expected orientation/header flags/data, then
  preserve the same data through snapshot and public reexport/reimport. The
  mutation fills only actual string-source cache points, not blank cells.
- Final public decode/reencode of the actual unmodified WPS-saved blank producer
  retains **all eight** charts with six normalization warnings and ordinary style/
  physical-placement warnings; no feature omission. Initial formal reexport length
  was 25,610 bytes. It uses the same existing reproduction script and fixture.
- After the recovered file was saved again in real WPS with R-00 B3 100→112,
  public decode/reencode still retained all eight charts, R-00's missing/112/missing
  row values, original options and empty label identities, without omission.

## Actual double-app acceptance

The final actual WPS-save → public decode/reencode file was opened in real WPS
Linux 12.1.2.29182 and in the existing authenticated Excel web cloud-browser tab.
All eight charts were individually rendered in both apps. Actual empty names and
categories remain empty when enabled, disabled labels retain exact indexed Core
names, row/column directions are correct, and genuine missing C3 has no bar.

R-00 B3 was changed 100→112 in each app and saved. WPS close/Home/Recent reopen
retained 112, correct orientation/names and missing bars. Excel showed saved state,
then Home/Recent reopen retained the same 112 chart and missing bars, without
repair. This follow-up verifies all eight first-opens and a representative
headerless row edit/save/reopen, not a second edit cycle on every sheet. The
earlier regular matrix already proved edits/save/reopen on every configuration.
Saved Excel download bytes were not obtained. Both app document views were closed
to Home, preserving the existing session. No account/settings/terms or sharing
change was made.

## Checks and limitations

Owned evidence: `evidence/native-column-empty-source-20261010/`.

- Focused XLSX: 4 files / **168 passed**.
- Final full XLSX: 77 files / **1,040 passed** after final production code.
- Package types/build, scoped lint/format and diff checks passed.
- The initial formatter attempt used wrong package-relative paths and matched no
  files. Its failure is recorded; the corrected root invocation passed. No test
  failure occurred in this follow-up.
- Architecture aggregate still fails: **125 existing diagnostics**, zero added or
  removed against 9d3020. This is not all-repository green.
- Core/Web production did not change and their suites/types were not rerun for this
  two-file source/test fix. Prior focused 11/21 and Web typecheck remain historical
  evidence, not new runs. No new adversarial review or remote CI pass is asserted.
- Headerless 1×1 direction remains deliberately ambiguous/omitted; richer chart
  types, numeric/date categories, layouts and decoration remain outside the slice.

Next is actual-producer-led native I/O for existing line/bar UI types, one bounded
type at a time, reusing the proven ordinary rectangular-source contract where its
native structure is actually confirmed.
