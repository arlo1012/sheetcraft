import { createWorkbook, getActiveSheet, createSheet } from "@sheetcraft/core/workbook";
import type { SheetConditionalFormatRule } from "@sheetcraft/core/conditional-formatting";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

function rule(id: string): SheetConditionalFormatRule {
  return {
    id,
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 12, column: 0 } }],
    anchor: { row: 0, column: 0 },
    condition: { kind: "cellValue", operator: "greaterThan", value: 10 },
    style: { fillColor: "#FEE2E2" },
  };
}

describe("conditional-format export compaction", () => {
  test("writes thirteen identical rules once without changing the editable document", async () => {
    const workbook = createWorkbook({ id: "duplicate-rules", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.conditionalFormats = Array.from({ length: 13 }, (_, index) => rule(`rule-${index}`));
    const before = JSON.stringify(sheet.conditionalFormats);
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!).match(/<cfRule\b/g)).toHaveLength(1);
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('<dxfs count="1">');
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats,
    ).toHaveLength(1);
    expect(JSON.stringify(sheet.conditionalFormats)).toBe(before);
  });

  test("shares differential styles across different conditions and worksheets", async () => {
    const workbook = createWorkbook({ id: "shared-dxf", sheetId: "sheet" });
    const other = createSheet("Other", "other");
    workbook.sheets.set(other.id, other);
    getActiveSheet(workbook).conditionalFormats = [
      rule("greater"),
      { ...rule("less"), condition: { kind: "cellValue", operator: "lessThan", value: 0 } },
    ];
    other.conditionalFormats = [{ ...rule("other"), style: { fillColor: "#fee2e2" } }];
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('<dxfs count="1">');
    for (const path of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"])
      expect(strFromU8(entries[path]!)).not.toMatch(/dxfId="[1-9]/);
    const decoded = await decodeXlsx(encoded.bytes);
    const restoredSheets = [...decoded.workbook.sheets.values()];
    expect(restoredSheets.map((sheet) => sheet.conditionalFormats?.length)).toEqual([2, 1]);
    expect(restoredSheets[1]?.conditionalFormats?.[0]?.style.fillColor).toBe("#FEE2E2");
  });

  test("removes duplicate x14 icon rules and emits no unused empty styles", async () => {
    const workbook = createWorkbook({ id: "compact-icons", sheetId: "sheet" });
    const icon: SheetConditionalFormatRule = {
      ...rule("star"),
      style: {},
      condition: {
        kind: "iconSet",
        iconSet: "threeStars",
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "percent", value: 67 },
        ],
      },
    };
    getActiveSheet(workbook).conditionalFormats = [
      icon,
      { ...icon, id: "duplicate" },
      { ...rule("stop"), style: {}, stopIfTrue: true },
    ];
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('<dxfs count="0"></dxfs>');
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!).match(/<x14:cfRule\b/g)).toHaveLength(1);
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).not.toContain("dxfId=");
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats,
    ).toHaveLength(2);
  });

  test("retains distinct statistics scopes, stop flags, and intervening rule priority", async () => {
    const workbook = createWorkbook({ id: "preserved-semantics", sheetId: "sheet" });
    const ranked: SheetConditionalFormatRule = {
      ...rule("rank"),
      condition: { kind: "rank", count: 1 },
    };
    const otherRange = {
      ...ranked,
      id: "other-range",
      ranges: [{ start: { row: 13, column: 0 }, end: { row: 25, column: 0 } }],
    };
    getActiveSheet(workbook).conditionalFormats = [
      ranked,
      { ...rule("stop"), stopIfTrue: true },
      { ...ranked, id: "duplicate" },
      otherRange,
      rule("plain"),
    ];
    const restored = getActiveSheet(
      (await decodeXlsx((await encodeXlsx(workbook)).bytes)).workbook,
    ).conditionalFormats!;
    expect(restored).toHaveLength(4);
    expect(restored.map((entry) => entry.condition.kind)).toEqual([
      "rank",
      "cellValue",
      "rank",
      "cellValue",
    ]);
    expect(restored[1]?.stopIfTrue).toBe(true);
    expect(restored[2]?.ranges).toEqual(otherRange.ranges);
    expect(restored[3]?.stopIfTrue).toBeUndefined();
  });

  test("retains formula rules and their anchors, including repeated volatile evaluations", async () => {
    const workbook = createWorkbook({ id: "formula-rules", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      { ...rule("formula-1"), condition: { kind: "formula", formula: "=A1>10" } },
      {
        ...rule("formula-2"),
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: "=A1>10" },
      },
      { ...rule("random-1"), condition: { kind: "formula", formula: "=RAND()>0.5" } },
      { ...rule("random-2"), condition: { kind: "formula", formula: "=RAND()>0.5" } },
    ];
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(xml.match(/<cfRule\b/g)).toHaveLength(4);
    expect(xml.match(/dxfId="0"/g)).toHaveLength(4);
  });
});
