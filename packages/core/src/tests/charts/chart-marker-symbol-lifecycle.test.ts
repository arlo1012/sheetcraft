import { describe, expect, test } from "vitest";
import { planChartColumnLineCombo } from "../../chart-combo.js";
import type { ChartFormatSettings } from "../../chart-format.js";
import { ensureChartRangeSeriesIdentity } from "../../chart-range-series.js";
import { planChartSeriesVisibility } from "../../chart-series-filter.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createInsertSheetAxisCommand } from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeSheetChart } from "../../sheet-charts.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementChart } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

const format: ChartFormatSettings = {
  series: [
    { id: "apple", markerSymbol: "square", markerSizePt: 9, color: "#112233", markers: false },
    { id: "dormant", markerSymbol: "circle" },
  ],
};

describe("marker symbol stable identity and lifecycle", () => {
  test("source reorder/removal, visibility and family changes retain latent shapes", () => {
    const chart = sourceDrawing().chart;
    chart.type = "line";
    chart.format = structuredClone(format);
    chart.source!.series.reverse();
    expect(normalizeSheetChart(chart).format).toEqual(format);
    const hidden = planChartSeriesVisibility(chart, [{ seriesId: "apple", visible: false }]);
    expect(hidden.format).toEqual(format);
    expect(
      planChartSeriesVisibility(hidden, [{ seriesId: "apple", visible: true }]).format,
    ).toEqual(format);
    chart.source!.series = chart.source!.series.filter((series) => series.id !== "apple");
    expect(normalizeSheetChart(chart).format).toEqual(format);
    for (const type of ["column", "bar", "area", "radar"] as const)
      expect(normalizeSheetChart({ ...chart, type }).format).toEqual(format);
    const combo = planChartColumnLineCombo(sourceDrawing().chart, [
      { seriesId: "apple", drawType: "line", axis: "primary", markers: true },
    ]);
    combo.format!.series![0]!.markerSymbol = "square";
    combo.format!.series![0]!.markerSizePt = 9;
    const resetRouting = planChartColumnLineCombo(combo, [
      { seriesId: "apple", drawType: "column", axis: "primary", markers: false },
    ]);
    expect(resetRouting.format!.series![0]).toEqual({
      id: "apple",
      markerSymbol: "square",
      markerSizePt: 9,
    });
  });

  test("physical range identity retains shapes across series visibility changes", () => {
    const band = { seriesBy: "columns", index: 1 } as const;
    const { chart, id } = ensureChartRangeSeriesIdentity(elementChart(), band);
    chart.format = { series: [{ id, markerSymbol: "square", markerSizePt: 9 }] };
    const hidden = planChartSeriesVisibility(chart, [{ rangeBand: band, visible: false }]);
    expect(hidden.format).toEqual(chart.format);
    expect(hidden.seriesFilter!.hiddenSeriesIds).toEqual([id]);
    expect(planChartSeriesVisibility(hidden, [{ rangeBand: band, visible: true }]).format).toEqual(
      chart.format,
    );
  });

  test("command capture, copy, marker visibility, leaf reset and history remain detached", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const drawing = sourceDrawing(sheet.id);
    drawing.chart.type = "line";
    sheet.drawings = [drawing];
    const before = serializeWorkbook(session.workbook);
    const input = normalizeSheetDrawings(sheet.drawings);
    (input[0]! as SheetChartDrawing).chart.format = structuredClone(format);
    const command = createSetSheetDrawingsCommand(sheet.id, input);
    (input[0]! as SheetChartDrawing).chart.format!.series![0]!.markerSymbol = "circle";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(93);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const copied = normalizeSheetDrawings(sheet.drawings);
    const series = (copied[0]! as SheetChartDrawing).chart.format!.series!;
    series[0]!.markers = true;
    series[0]!.color = "#abcdef";
    expect(series[0]!.markerSymbol).toBe("square");
    expect(series[0]!.markerSizePt).toBe(9);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, copied))).toBe(
      true,
    );
    const shown = serializeWorkbook(session.workbook);
    series[0]!.markers = false;
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, copied))).toBe(
      true,
    );
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format!.series![0]).toEqual({
      id: "apple",
      markerSymbol: "square",
      markerSizePt: 9,
      color: "#abcdef",
      markers: false,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(shown);
    expect(redoWorkbookCommand(session)).toBe(true);
    const hidden = serializeWorkbook(session.workbook);
    delete series[0]!.markerSymbol;
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, copied))).toBe(
      true,
    );
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format!.series).toEqual([
      { id: "apple", markerSizePt: 9, color: "#abcdef", markers: false },
      { id: "dormant", markerSymbol: "circle" },
    ]);
    expect(serializeWorkbook(session.workbook).version).toBe(93);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(hidden);
    expect(redoWorkbookCommand(session)).toBe(true);
    delete series[1]!.markerSymbol;
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, copied))).toBe(
      true,
    );
    expect(serializeWorkbook(session.workbook).version).toBe(92);
  });

  test("structural source maintenance preserves shapes and sizes with exact Undo/Redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const drawing = sourceDrawing(sheet.id);
    drawing.chart.format = structuredClone(format);
    sheet.drawings = [drawing];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 2, 1)),
    ).toBe(true);
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format).toEqual(format);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
