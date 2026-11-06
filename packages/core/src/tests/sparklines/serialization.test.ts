// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { CellSparkline } from "../../sparklines.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import {
  createWorkbook,
  getActiveSheet,
  getCellSparkline,
  setCellSparkline,
} from "../../workbook.js";

const address = { row: 4, column: 4 };
const pointFields = [
  "highPoint",
  "lowPoint",
  "firstPoint",
  "lastPoint",
  "negativePoints",
  "markerColor",
] as const;

function fixture(patch: Partial<CellSparkline> = {}) {
  const workbook = createWorkbook({ id: "sparkline-snapshot", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const sparkline: CellSparkline = {
    type: "line",
    source: { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
  setCellSparkline(sheet, address, sparkline);
  return { workbook, sheet, sparkline };
}

describe("sparkline point-style snapshot version 94", () => {
  test.each([
    { field: "highPoint", patch: { highPoint: { show: false, color: "#aa0000" } } },
    { field: "lowPoint", patch: { lowPoint: { show: false, color: "#00aa00" } } },
    { field: "firstPoint", patch: { firstPoint: { show: false, color: "#0000aa" } } },
    { field: "lastPoint", patch: { lastPoint: { show: false, color: "#aaaa00" } } },
    { field: "negativePoints", patch: { negativePoints: false } },
    { field: "markerColor", patch: { markerColor: "#aa00aa" } },
  ])("requires version 94 for explicit $field even when disabled", ({ patch }) => {
    const f = fixture(patch);
    const snapshot = serializeWorkbook(f.workbook);

    expect(snapshot.version).toBe(94);
    expect(getCellSparkline(getActiveSheet(deserializeWorkbook(snapshot)), address)).toEqual(
      f.sparkline,
    );
    expect(() => deserializeWorkbook({ ...snapshot, version: 93 })).toThrow(/version 94/);
  });

  test("round trips every point field including false values and disabled colors", () => {
    const f = fixture({
      highPoint: { show: false, color: "#aa0000" },
      lowPoint: { show: true, color: "#00aa00" },
      firstPoint: { show: false, color: "#0000aa" },
      lastPoint: { show: true, color: "#aaaa00" },
      negativePoints: false,
      markerColor: "#aa00aa",
    });
    const snapshot = serializeWorkbook(f.workbook);
    const restored = deserializeWorkbook(snapshot);

    expect(snapshot.version).toBe(94);
    expect(getCellSparkline(getActiveSheet(restored), address)).toEqual(f.sparkline);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
  });

  test("keeps a legacy basic sparkline at its previous protocol without adding optional fields", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.workbook);
    const restored = deserializeWorkbook({ ...snapshot, version: 93 });
    const sparkline = getCellSparkline(getActiveSheet(restored), address)!;

    expect(snapshot.version).toBeLessThan(94);
    expect(sparkline).toEqual(f.sparkline);
    for (const field of pointFields) expect(Object.hasOwn(sparkline, field)).toBe(false);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
  });

  test("infers point-style support when deserializing a standalone sheet without a version envelope", () => {
    const f = fixture({
      highPoint: { show: false, color: "#aa0000" },
      lowPoint: { show: true, color: "#00aa00" },
      firstPoint: { show: false, color: "#0000aa" },
      lastPoint: { show: true, color: "#aaaa00" },
      negativePoints: false,
      markerColor: "#aa00aa",
    });
    const standalone = serializeSheet(f.sheet);

    expect(Object.hasOwn(standalone, "version")).toBe(false);
    const restoredSheet = deserializeSheet(standalone);
    expect(getCellSparkline(restoredSheet, address)).toEqual(f.sparkline);
    expect(serializeSheet(restoredSheet)).toEqual(standalone);
    const rebuilt = createWorkbook({ id: "rebuilt", sheetId: restoredSheet.id });
    rebuilt.sheets.set(restoredSheet.id, restoredSheet);
    expect(serializeWorkbook(rebuilt).version).toBe(94);
  });
});
