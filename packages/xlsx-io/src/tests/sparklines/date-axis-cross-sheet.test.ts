// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { createSparklineSeriesResolver, type CellSparkline } from "@sheetcraft/core/sparklines";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
  setCellContent,
  setCellSparkline,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readXlsxSparklines } from "../../sparklines.js";

function fixture() {
  const workbook = createWorkbook({
    id: "cross-date-xlsx",
    sheetId: "metrics-stable-id",
    sheetName: "Metrics & Data",
  });
  const owner = getActiveSheet(workbook);
  const dates = createSheet("O'Brien Dates", "calendar-stable-id");
  insertSheet(workbook, dates);
  [30, 10, 20].forEach((value, index) =>
    setCellContent(owner, { row: 5, column: index + 1 }, { kind: "literal", value }),
  );
  [45003, 45001, 45002].forEach((value, index) =>
    setCellContent(dates, { row: 1, column: index + 1 }, { kind: "literal", value }),
  );
  const sparkline: CellSparkline = {
    type: "line",
    source: { start: { row: 5, column: 1 }, end: { row: 5, column: 3 } },
    dateSheetId: dates.id,
    dateRange: {
      start: { row: 1, column: 1, rowAbsolute: true, columnAbsolute: true },
      end: { row: 1, column: 3, rowAbsolute: true, columnAbsolute: true },
    },
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
  setCellSparkline(owner, { row: 10, column: 5 }, sparkline);
  return { workbook, owner, dates, sparkline };
}
function decodedText(value: string) {
  return value.replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

describe("native XLSX cross-sheet sparkline dates", () => {
  test("writes distinct date/data formulas and remaps the external date sheet to its imported stable ID", async () => {
    const f = fixture();
    const encoded = await encodeXlsx(f.workbook);
    const entries = unzipSync(encoded.bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    const group = /<x14:sparklineGroup\b[^>]*>([\s\S]*?)<\/x14:sparklineGroup>/.exec(xml)![1]!;
    const formulas = [...group.matchAll(/<xm:f>([^<]+)<\/xm:f>/g)].map((match) =>
      decodedText(match[1]!),
    );
    expect(formulas).toEqual(["'O''Brien Dates'!$B$2:$D$2", "'Metrics & Data'!B6:D6"]);
    const omitted = vi.fn();
    const native = readXlsxSparklines(entries, [f.owner.name, f.dates.name], omitted)[0]!.get(
      "F11",
    )!;
    expect(native.dateSheetId).toBe("xlsx-sheet-2");
    expect(native.dateRange).toEqual(f.sparkline.dateRange);
    expect(native.source).toEqual(f.sparkline.source);
    expect(omitted).not.toHaveBeenCalled();

    const decoded = await decodeXlsx(encoded.bytes);
    const owner = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === f.owner.name,
    )!;
    const dates = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === f.dates.name,
    )!;
    const restored = getCellSparkline(owner, { row: 10, column: 5 })!;
    expect(restored.dateSheetId).toBe(dates.id);
    expect(restored.dateSheetId).not.toBe(f.dates.id);
    expect(restored.source).toEqual(f.sparkline.source);
    expect(restored.dateRange).toEqual(f.sparkline.dateRange);
    expect(
      createSparklineSeriesResolver(
        owner,
        createWorkbookEvaluator(decoded.workbook, owner.id),
      )(restored),
    ).toEqual({
      dates: [45001, 45002, 45003],
      values: [10, 20, 30],
    });
    expect(
      decoded.report.issues
        .filter((issue) => issue.code === "feature-omitted")
        .flatMap((issue) => issue.locations),
    ).not.toContain("worksheet1.sparkline:F11");
  });
});
