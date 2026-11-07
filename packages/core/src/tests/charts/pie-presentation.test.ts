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

const presentations: ChartPresentationSettings[] = [
  { pieStyle: "threeD" },
  { pieStyle: "pieOfPie" },
  { pieStyle: "barOfPie" },
  ...(["threeD", "pieOfPie", "barOfPie"] as const).flatMap((pieStyle) =>
    (["percent", "categoryPercent"] as const).map((pieLabels) => ({
      pieStyle,
      pieLabels,
      pieExploded: true as const,
    })),
  ),
  { pieLabels: "percent" },
  { pieLabels: "categoryPercent" },
  { pieExploded: true },
];

describe("pie presentation V105 snapshots", () => {
  test.each(presentations)("saves and restores nondefault pie presentation %j", (presentation) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const drawing = elementDrawing();
    drawing.chart = { ...drawing.chart, type: "pie", presentation };
    const original = structuredClone(drawing);
    expect(normalizeChartPresentation(presentation)).toEqual(presentation);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing])),
    ).toBe(true);
    const saved = serializeWorkbook(session.workbook);
    expect(saved.version).toBe(105);
    const restored = deserializeWorkbook(saved);
    expect(restored.sheets.get(sheet.id)!.drawings).toEqual([original]);
    expect(serializeWorkbook(restored)).toEqual(saved);
    expect(() => deserializeWorkbook({ ...saved, version: 104 })).toThrow();
    expect(drawing).toEqual(original);
  });
});
