// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { normalizeCellSparkline, type CellSparkline } from "../../sparklines.js";
import { createSetCellSparklineCommand } from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, getCellSparkline, setCellSparkline } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function definition(): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 1, column: 0 }, end: { row: 1, column: 4 } },
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
}

function styled(): CellSparkline {
  return {
    ...definition(),
    highPoint: { show: true, color: "#aa0000" },
    lowPoint: { show: false, color: "#00aa00" },
    firstPoint: { show: true, color: "#0000aa" },
    lastPoint: { show: false, color: "#aaaa00" },
    negativePoints: false,
    markerColor: "#aa00aa",
  };
}

describe("sparkline point style definitions", () => {
  test("leaves optional point fields absent in a legacy definition", () => {
    const original = definition();
    const normalized = normalizeCellSparkline(original)!;

    expect(normalized).toEqual(original);
    for (const field of [
      "highPoint",
      "lowPoint",
      "firstPoint",
      "lastPoint",
      "negativePoints",
      "markerColor",
    ])
      expect(Object.hasOwn(normalized, field)).toBe(false);
  });

  test("deep clones every point style and retains explicit false values and disabled colors", () => {
    const original = styled();
    const normalized = normalizeCellSparkline(original)!;

    expect(normalized).toEqual(original);
    expect(normalized.negativePoints).toBe(false);
    for (const field of ["highPoint", "lowPoint", "firstPoint", "lastPoint"] as const) {
      expect(normalized[field]).not.toBe(original[field]);
      normalized[field]!.color = "#ffffff";
    }
    expect(original).toEqual(styled());
    expect(original.lowPoint).toEqual({ show: false, color: "#00aa00" });
    expect(original.lastPoint).toEqual({ show: false, color: "#aaaa00" });
  });

  test.each(["highPoint", "lowPoint", "firstPoint", "lastPoint"] as const)(
    "validates the boolean and full hexadecimal color of %s even when hidden",
    (field) => {
      for (const value of [
        null,
        { show: "yes", color: "#123456" },
        { show: true },
        { show: false, color: "red" },
        { show: false, color: "#123" },
      ]) {
        expect(() =>
          normalizeCellSparkline({ ...definition(), [field]: value } as unknown as CellSparkline),
        ).toThrow();
      }
    },
  );

  test.each([
    { negativePoints: 0 },
    { negativePoints: "false" },
    { markerColor: "red" },
    { markerColor: "#abc" },
  ])("rejects invalid optional marker fields %j", (patch) => {
    expect(() =>
      normalizeCellSparkline({ ...definition(), ...patch } as unknown as CellSparkline),
    ).toThrow();
  });

  test("keeps disabled point colors through command history and snapshot round trips", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 8, column: 8 };
    const original: CellSparkline = { ...styled(), negativePoints: true };
    setCellSparkline(sheet, address, original);
    const disabled: CellSparkline = {
      ...original,
      highPoint: { ...original.highPoint!, show: false },
      firstPoint: { ...original.firstPoint!, show: false },
      negativePoints: false,
    };

    expect(
      executeWorkbookCommand(
        session,
        createSetCellSparklineCommand(session.workbook, sheet.id, address, disabled),
      ),
    ).toBe(true);
    expect(getCellSparkline(sheet, address)).toEqual(disabled);
    const snapshot = serializeWorkbook(session.workbook);
    const restored = deserializeWorkbook(snapshot);
    expect(getCellSparkline(getActiveSheet(restored), address)).toEqual(disabled);
    expect(serializeWorkbook(restored)).toEqual(snapshot);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellSparkline(sheet, address)).toEqual(original);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellSparkline(sheet, address)).toEqual(disabled);
    expect(serializeWorkbook(session.workbook)).toEqual(snapshot);
  });
});
