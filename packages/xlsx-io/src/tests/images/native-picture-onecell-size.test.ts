import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createWorkbook, getActiveSheet, setColumnWidth } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureAnchorRect } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { child, parseXml } from "../../pivot-xml.js";
import { inspectNativePicture, readXlsxPictures } from "../../picture-reader.js";
import { excelColumnWidthToPixels } from "../../column-width.js";
import { CompatibilityReportBuilder } from "../../report.js";

// Product compatibility policy, not a universal OOXML conflict-precedence claim.
// WPS was observed to keep this move-only picture 200x160 when A changed 88→127px.
// Captured original XML is unchanged; an explicit WPS picture resize also proves
// the selected extent is not hard-coded to 200px or inferred from source pixels.
test.each([
  {
    file: "wps-picture-solid-border.xml",
    columnA: undefined,
    markerWidth: 148,
    width: 200,
    height: 160,
  },
  {
    file: "wps-picture-column-resize.xml",
    columnA: 12.7,
    markerWidth: 162,
    width: 200,
    height: 160,
  },
  {
    file: "wps-picture-physical-resize.xml",
    columnA: 12.7,
    markerWidth: 176,
    width: 240,
    height: 192,
  },
])("move-only physical extent survives WPS column-width experiment: $file", (sample) => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const sheet = getActiveSheet(workbook);
  sheet.defaultColumnWidth = excelColumnWidthToPixels(8.8);
  sheet.defaultRowHeight = 20;
  if (sample.columnA !== undefined)
    setColumnWidth(sheet, 0, excelColumnWidthToPixels(sample.columnA));
  const source = inspectNativePicture(
    "twoCellAnchor",
    child(
      child(parseXml(readFileSync(new URL(`./fixtures/${sample.file}`, import.meta.url))), "wsDr"),
      "twoCellAnchor",
    ),
    sample.file,
  );
  expect(source.editAs).toBe("oneCell");
  if (source.anchor.mode !== "move-and-size")
    throw new Error("Expected captured two-cell markers.");
  expect(source.transform).toEqual({ x: 1, y: 1, width: sample.width, height: sample.height });
  expect(
    resolvePictureAnchorRect(
      { ...source.anchor, offsetMode: "free-pixels" },
      createPictureSheetMetrics(sheet),
    ).width,
  ).toBe(sample.markerWidth);
  const report = new CompatibilityReportBuilder();
  readXlsxPictures(workbook, [{ ...source, sheetIndex: 0, assetId: "synthetic" }], [], report);
  const image = sheet.floatingImages[0] as FramedFloatingImage;
  expect(image.frame.anchor).toEqual({
    mode: "move-only",
    offsetMode: "free-pixels",
    origin: { column: { index: 0, offset: 1 }, row: { index: 0, offset: 1 } },
    size: { width: sample.width, height: sample.height },
  });
  expect(report.build().issues).toContainEqual(
    expect.objectContaining({ code: "picture-geometry-approximated", severity: "warning" }),
  );
});
