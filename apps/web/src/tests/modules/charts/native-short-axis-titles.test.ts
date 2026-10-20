// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "@sheetcraft/xlsx-io";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";

async function nativeWorkbook(filename: string) {
  const bytes = await readFile(
    new URL(
      `../../../../../../docs/acceptance/evidence/native-auto-axis-20261020/${filename}`,
      import.meta.url,
    ),
  );
  return (await decodeXlsx(new Uint8Array(bytes))).workbook;
}
function content(workbook: Workbook) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing native line chart");
  const data = getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id));
  return { sheet, drawing, data };
}
function verifyRender(workbook: Workbook) {
  const { drawing, data } = content(workbook);
  const { width, height } = drawing;
  const retainedChart = JSON.stringify(drawing.chart);
  const option = createChartOption(drawing.chart, data, { width, height, theme: workbook.theme });
  expect(option.grid).toEqual({ top: 45, left: 75.2, right: 22, bottom: 62.2 });
  expect(option.xAxis).toMatchObject({
    name: "Quarter 季度 & <channel>",
    nameRotate: 0,
    nameTextStyle: { fontFamily: "Arial", fontSize: 16, fontWeight: "bold" },
  });
  expect(option.yAxis).toMatchObject({
    name: "Revenue 收入",
    nameRotate: 90,
    nameTextStyle: {
      fontFamily: "Arial",
      fontSize: 16,
      fontWeight: "bold",
      fontStyle: "italic",
    },
  });
  const engine = init(null, undefined, { renderer: "svg", ssr: true, width, height });
  try {
    engine.setOption(option);
    const svg = engine.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    for (const title of ["Quarter 季度 & <channel>", "Revenue 收入"]) {
      const span = engine
        .getZr()
        .storage.getDisplayList(true)
        .find((entry) => entry.type === "tspan" && entry.style.text === title);
      expect(span, title).toBeDefined();
      const rect = span!.getBoundingRect().clone();
      const transform = span!.getComputedTransform();
      if (transform) rect.applyTransform(transform);
      expect(rect.x, title).toBeGreaterThanOrEqual(0);
      expect(rect.y, title).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, title).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height, title).toBeLessThanOrEqual(height);
    }
    expect(height - 45 - 62.2).toBeGreaterThan(0);
    expect(svg).toContain('stroke="#2563eb"');
    expect(svg).toContain('stroke="#16a34a"');
  } finally {
    engine.dispose();
  }
  expect(JSON.stringify(drawing.chart)).toBe(retainedChart);
  return option;
}

test.each(["auto-axis-small.xlsx", "auto-axis-short.xlsx", "auto-axis-short-wps-saved.xlsx"])(
  "%s renders full native titles at the original 200px height and survives native export",
  async (filename) => {
    const workbook = await nativeWorkbook(filename);
    expect(content(workbook).drawing.height).toBe(200);
    const option = verifyRender(workbook);
    for (const property of ["min", "max", "interval", "splitNumber", "scale"])
      expect(option.yAxis).not.toHaveProperty(property);
    const encoded = await encodeXlsx(workbook);
    const restored = (await decodeXlsx(encoded.bytes)).workbook;
    expect(content(restored).drawing.width).toBe(content(workbook).drawing.width);
    expect(content(restored).drawing.height).toBe(200);
    verifyRender(restored);
  },
);

test("repeated narrow/short resize, undo, redo and snapshot restore never alter title or axis data", async () => {
  const workbook = await nativeWorkbook("auto-axis-short.xlsx");
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const original = serializeWorkbook(workbook);
  for (const [width, height] of [
    [320, 200],
    [640, 400],
    [320, 200],
    [640, 200],
  ]) {
    const { sheet, drawing } = content(workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [{ ...drawing, width: width!, height: height! }]),
      ),
    ).toBe(true);
    verifyRender(workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    verifyRender(workbook);
    expect(redoWorkbookCommand(session)).toBe(true);
    verifyRender(deserializeWorkbook(serializeWorkbook(workbook)));
  }
  while (undoWorkbookCommand(session)) verifyRender(workbook);
  expect(serializeWorkbook(workbook)).toEqual(original);
});

test("explicit bounds and major unit remain document-owned at short native dimensions", async () => {
  const workbook = await nativeWorkbook("auto-axis-short.xlsx");
  const { drawing } = content(workbook);
  drawing.chart.format!.valueAxis = {
    ...drawing.chart.format!.valueAxis,
    min: -20,
    max: 160,
    majorUnit: 30,
  };
  const option = verifyRender(workbook);
  expect(option.yAxis).toMatchObject({ min: -20, max: 160, interval: 30 });
  const restored = deserializeWorkbook(serializeWorkbook(workbook));
  expect(verifyRender(restored).yAxis).toMatchObject({ min: -20, max: 160, interval: 30 });
});
