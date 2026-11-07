// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  normalizeChartPresentation,
  type ChartPresentationSettings,
} from "../../chart-presentation.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementDrawing } from "./chart-elements-fixture.js";

const formats: ChartPresentationSettings[] = [
  { pieLabelPlacement: "outside" },
  { pieLabelPlacement: "boxedInside" },
  { pieLabelPlacement: "boxedOutside" },
  { pieFill: "gradient" },
  { pieFill: "hatch" },
  { pieFill: "dots" },
  { pieFill: "checker" },
  { pieFill: "hatchGradient" },
  { pieFill: "outline" },
  { pieStroke: "light" },
  { pieStroke: "dark" },
  { doughnutHole: 25 },
  { doughnutHole: 10 },
  { doughnutHole: 90 },
  { pieFocusFirst: true },
  { doughnutRim: true },
  {
    pieLabelPlacement: "boxedOutside",
    pieFill: "hatchGradient",
    pieStroke: "dark",
    doughnutHole: 75,
    pieFocusFirst: true,
    doughnutRim: true,
  },
];

describe("pie gallery presentation V106", () => {
  test.each(formats)("normalizes and round-trips the gallery format %j", (presentation) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const drawing = elementDrawing();
    drawing.chart = { ...drawing.chart, type: "doughnut", presentation };
    const original = structuredClone(drawing);
    expect(normalizeChartPresentation(presentation)).toEqual(presentation);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(true);
    const saved = serializeWorkbook(session.workbook);
    expect(saved.version).toBe(106);
    const restored = deserializeWorkbook(saved);
    expect(restored.sheets.get(sheet.id)!.drawings).toEqual([original]);
    expect(serializeWorkbook(restored)).toEqual(saved);
    expect(() => deserializeWorkbook({ ...saved, version: 105 })).toThrow();
    expect(drawing).toEqual(original);
  });

  test.each([
    { pieLabelPlacement: "inside" },
    { pieFill: "unknown" },
    { pieStroke: "unknown" },
    { doughnutHole: 22.5 },
    { doughnutHole: 9 },
    { doughnutHole: 91 },
    { doughnutHole: NaN },
    { pieFocusFirst: false },
    { doughnutRim: false },
  ])("rejects an invalid gallery choice %j", (presentation) => {
    expect(() => normalizeChartPresentation(presentation)).toThrow();
  });
});
