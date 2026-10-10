# Genuine WPS linked PivotChart producer, 2026-10-10

Application: WPS Office Linux `12.1.2.29182.AK.preread.sw`. The synthetic six-record
input is the existing `wps-table-source.xlsx` fixture, SHA256
`6f03fe0846ee7d1e408b185b21fa9e8f2dee68fd2d9d29899168dc9abb83d974`.
Its structured `Table1` is on `Sheet1`; the configured `PivotTable1` belongs to
`Sheet2`, starts at A3, has region rows, product columns, and sum(amount), total 520.
Only an isolated copy was edited.

## Actual native workflow and observations

1. Open the WPS-authored input as `sc-pivot.xlsx`, select the existing report,
   and use Insert → PivotChart. Select the first Column variant and confirm.
   The chooser caption read “Clustered Column - Line”; the saved OOXML establishes
   `barChart`, `barDir="col"`, and `grouping="clustered"`.
2. Save through WPS. The UI exposes PivotChart field areas and field buttons.
   The original saved file is 20,583 bytes, SHA256
   `b3e91f240adc02b746ff43a102e4ce1775fe6b5078e816b16cb12f3464d9989c`.
3. Change only source `Sheet1!C2` from 100 to 110 and save. Before Refresh, the
   report and chart still show north/apple 100 and total 520. That stale-cache
   saved file is preserved independently.
4. Select the report, use PivotTable Analyze → Refresh, and save. Both the report
   and chart update north/apple to 110; report total is 530. The original saved
   file is 20,601 bytes, SHA256
   `300c55073782d3058dd70f58b23d6028dee972c5904f3b6595ebf96467a2592a`.
5. Fully close this workbook tab, verify its native sheet window disappears, then
   freshly reopen the saved file from WPS Home. The updated chart persists, and
   selecting it again exposes PivotChart field areas. No repair or save warning
   was observed. Reopening leaves the file bytes unchanged. Close it afterward.

These are native-producer observations. They do not establish product-export
acceptance, Excel-for-the-web acceptance, or all WPS PivotChart variants.

## Saved package contract

- `xl/charts/chart1.xml` contains
  `pivotSource/name = [sc-pivot.xlsx]Sheet2!PivotTable1` and `fmtId=0`.
  This is the owning report sheet, not the raw source sheet.
- Two series are apple and pear; categories are east, north, south. Chart caches
  omit grand totals. Before refresh values are 60/100/120 and 70/80/90; afterward
  they are 60/110/120 and 70/80/90.
- Native formula ranges include a grand-total endpoint even though cached point
  count excludes it. Do not use this producer detail as permission to add totals
  to the chart data or to silently collapse noncontiguous product data.
- The chart uses a native worksheet drawing relationship and `graphicFrame` in
  a two-cell anchor. Its drawing relationship targets `../charts/chart1.xml`.
- Chart MIME type is `application/vnd.openxmlformats-officedocument.drawingml.chart+xml`;
  drawing MIME type is `application/vnd.openxmlformats-officedocument.drawing+xml`.
- WPS also emits chart style/color parts and c14 PivotChart field-button options.
  Their necessity is not inferred from their presence alone.

[Microsoft's Office implementation note](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/3a82b89e-7264-40c1-a09f-d569374fe6a9)
requires filename, owning sheet, and exact native PivotTable name. Merely pointing
an ordinary chart at report cells does not establish that association.

## Evidence and metadata boundary

- Three XLSX files, a provenance manifest, and a read-only byte/XML verifier are
  included here. The four native-window screenshots were retained locally and
  are not published to Git. The workflow observations above come from this
  round's actual GUI actions, not a reconstructed or mocked visual test.
- The three published XLSX files are metadata-sanitized copies. Only the opaque
  `docProps/custom.xml` ICV property was removed. No populated author/company/
  manager, email, private path, or external relationship was found in this
  synthetic producer. Every non-docProps part remains byte-identical, with ZIP
  CRC validation and original/published per-part hashes in `manifest.json`.
- GUI observations and original hashes above apply to the original saved bytes.
  Published sanitized copies were not GUI-retested and have distinct hashes.
  Their internal PivotSource preserves the original native filename identity;
  do not mistake a renamed evidence filename for a newly authored chart identity.
- `manifest.json` records the hashes of those unpublished screenshots without
  including the images. The native application's clock is retained in file
  metadata; the report date follows the session's UTC date.

Run `python3 verify.py` from this directory. `verification.json` records its
result. This verifies preserved bytes and the bounded package observations;
it does not run WPS, Excel, or product tests.
