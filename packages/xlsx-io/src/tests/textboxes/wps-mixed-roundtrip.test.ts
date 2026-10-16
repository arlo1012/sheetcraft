import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { unzipSync } from "fflate/browser";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { collectNativeChartParts } from "../../chart-package-parts.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
test("unmodified real WPS mixed package preserves text, charts and picture bytes through snapshot and native export", async () => {
  const bytes = new Uint8Array(
    readFileSync(new URL("./fixtures/textbox-mixed-wps-reference.xlsx", import.meta.url)),
  );
  expect(bytes.length).toBe(15832);
  expect(hash(bytes)).toBe("da79b5cb58730e8d0f6227f427d40b34fcd9d0ed21eb3031b905d7f6cfa2f748");
  const inputPicture = unzipSync(bytes)["xl/media/image1.png"]!;
  expect(hash(inputPicture)).toBe(
    "4d7fd68b0059ef07e2b4189aa68707f12c41a9664fbf2ca98e90c6836da7e4e5",
  );
  const decoded = await decodeXlsx(bytes),
    sheet = getActiveSheet(decoded.workbook);
  expect(sheet.drawings?.map((d) => d.kind)).toEqual(["chart", "chart", "textBox"]);
  expect(sheet.floatingImages).toHaveLength(1);
  expect(decoded.images).toHaveLength(1);
  expect(decoded.images![0]!.bytes).toEqual(inputPicture);
  const box = sheet.drawings!.find((d) => d.kind === "textBox")!;
  if (box.kind !== "textBox") throw new Error("Missing textbox");
  expect(box).toMatchObject({
    kind: "textBox",
    text: "first paragraph\nsecond paragraph",
    fontSize: 1100 / 75,
    color: "#000000",
    fill: "transparent",
    stroke: "transparent",
    shapeText: {
      fontFamily: "Liberation Sans",
      layout: { wrap: true, overflow: false, autoFit: "none", blockAlignment: "start" },
    },
    shapeStyle: { fill: { kind: "none" }, line: { kind: "none" } },
  });
  const locations = decoded.report.issues.flatMap((issue) => issue.locations);
  // Public reports bound example locations to ten per code. Check the precise
  // textbox diagnostics separately before that intentional aggregation.
  const archive = unzipSync(bytes);
  const native = await collectNativeChartParts(archive, async (part) => archive[part]);
  const materializations = native.textBoxes[0]!.themeMaterializations;
  expect(
    materializations.some((location) => location.endsWith("fontDescriptorMaterialization")),
  ).toBe(true);
  expect(materializations.some((location) => location.endsWith("themeMaterialization"))).toBe(true);
  expect(
    decoded.report.issues.find((issue) => issue.code === "style-omitted")!.count,
  ).toBeGreaterThanOrEqual(materializations.length);
  expect(locations).toContain("xl/drawings/drawing1.xml.pictureObjectOrder");
  expect(decoded.report.issues.some((issue) => issue.severity === "block")).toBe(false);
  const snapshot = deserializeWorkbook(serializeWorkbook(decoded.workbook));
  const out = await encodeXlsx(snapshot, {
    images: decoded.images!.map((asset) => ({ ...asset, width: 200, height: 200 })),
  });
  expect(
    out.report.issues.some(
      (issue) => issue.code === "feature-omitted" || issue.severity === "block",
    ),
  ).toBe(false);
  const again = await decodeXlsx(out.bytes),
    restored = getActiveSheet(again.workbook);
  expect(restored.drawings?.map((d) => d.kind)).toEqual(["chart", "chart", "textBox"]);
  const nextBox = restored.drawings!.find((d) => d.kind === "textBox")!;
  if (nextBox.kind !== "textBox") throw new Error("Missing reimported textbox");
  for (const key of [
    "text",
    "fontSize",
    "color",
    "fill",
    "stroke",
    "shapeText",
    "shapeStyle",
  ] as const)
    expect(nextBox[key]).toEqual(box[key]);
  expect(
    restored.drawings!.flatMap((d) => (d.kind === "chart" ? [d.chart.format?.legend] : [])),
  ).toEqual(sheet.drawings!.flatMap((d) => (d.kind === "chart" ? [d.chart.format?.legend] : [])));
  expect(restored.floatingImages).toHaveLength(1);
  expect(again.images![0]!.bytes).toEqual(inputPicture);
});
