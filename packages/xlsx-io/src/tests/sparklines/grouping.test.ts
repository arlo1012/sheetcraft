// 未执行：按用户要求仅补写，待全部功能完成后统一运行。
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, type Unzipped } from "fflate/browser";
import { createWorkbook, getActiveSheet, setCellSparkline } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { encodeXlsx } from "../../index.js";
import { readXlsxSparklines } from "../../sparklines.js";

function sparkline(row: number, groupId?: string): CellSparkline {
  return {
    type: "line",
    source: { start: { row, column: 0 }, end: { row, column: 2 } },
    color: "#2563eb",
    negativeColor: "#ef4444",
    markers: true,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...(groupId === undefined ? {} : { groupId }),
  };
}
function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.name = "Data";
  return { workbook, sheet };
}
function groupMembers(xml: string): string[][] {
  return [...xml.matchAll(/<x14:sparklineGroup\b[^>]*>([\s\S]*?)<\/x14:sparklineGroup>/g)].map(
    (group) =>
      [...group[1]!.matchAll(/<xm:sqref>([^<]+)<\/xm:sqref>/g)].map((member) => member[1]!),
  );
}
function nativeEntries(worksheet: string): Unzipped {
  return {
    "xl/workbook.xml": strToU8(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  };
}
const nativeMember = (source: string, target: string) =>
  `<x14:sparkline><xm:f>Data!${source}</xm:f><xm:sqref>${target}</xm:sqref></x14:sparkline>`;
const nativeGroup = (...members: string[]) =>
  `<x14:sparklineGroup type="line" displayEmptyCellsAs="gap"><x14:colorSeries rgb="FF2563EB"/><x14:sparklines>${members.join("")}</x14:sparklines></x14:sparklineGroup>`;
const nativeWorksheet = (...groups: string[]) =>
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groups.join("")}</x14:sparklineGroups></ext></extLst></worksheet>`;

describe("native XLSX sparkline grouping", () => {
  test("stores one group-level date range separately from each member's distinct data source", async () => {
    const { workbook, sheet } = fixture();
    const dateRange: NonNullable<CellSparkline["dateRange"]> = {
      start: { row: 4, column: 0, rowAbsolute: true, columnAbsolute: true },
      end: { row: 4, column: 2, rowAbsolute: true, columnAbsolute: true },
    };
    for (const row of [0, 1])
      setCellSparkline(
        sheet,
        { row, column: 4 },
        {
          ...sparkline(row, "dated"),
          dateRange,
        },
      );
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    const groups = [
      ...xml.matchAll(/<x14:sparklineGroup\b([^>]*)>([\s\S]*?)<\/x14:sparklineGroup>/g),
    ];
    expect(groups).toHaveLength(1);
    expect(groups[0]![1]).toContain('dateAxis="1"');
    const body = groups[0]![2]!;
    const split = body.indexOf("<x14:sparklines>");
    const groupSettings = body.slice(0, split);
    expect(groupSettings).toContain("$A$5:$C$5");
    expect([...groupSettings.matchAll(/<xm:f>/g)]).toHaveLength(1);
    const members = [...body.slice(split).matchAll(/<x14:sparkline>([\s\S]*?)<\/x14:sparkline>/g)];
    expect(members).toHaveLength(2);
    expect(members[0]![1]).toContain("A1:C1");
    expect(members[1]![1]).toContain("A2:C2");
    expect(members.every((member) => !member[1]!.includes("$A$5:$C$5"))).toBe(true);
    const restored = readXlsxSparklines(nativeEntries(xml), [sheet.name])[0]!;
    expect(restored.get("E1")?.dateRange).toEqual(dateRange);
    expect(restored.get("E2")?.dateRange).toEqual(dateRange);
    expect(restored.get("E1")?.source).toEqual(sparkline(0).source);
    expect(restored.get("E2")?.source).toEqual(sparkline(1).source);
    expect(restored.get("E1")?.groupId).toBe(restored.get("E2")?.groupId);
  });

  test("a broken group date reference round trips without breaking the member data range", async () => {
    const { workbook, sheet } = fixture();
    setCellSparkline(sheet, { row: 0, column: 4 }, { ...sparkline(0), dateRange: null });
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('dateAxis="1"');
    expect(xml).toMatch(/<xm:f>#REF!<\/xm:f>\s*<x14:sparklines>/);
    const restored = readXlsxSparklines(nativeEntries(xml), [sheet.name])[0]!.get("E1")!;
    expect(restored.dateRange).toBeNull();
    expect(restored.source).toEqual(sparkline(0).source);
  });

  test("one group writes multiple members and round-trips their distinct sources through native XML", async () => {
    const { workbook, sheet } = fixture();
    setCellSparkline(sheet, { row: 0, column: 4 }, sparkline(0, "sales"));
    setCellSparkline(sheet, { row: 1, column: 4 }, sparkline(1, "sales"));
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(groupMembers(xml)).toEqual([["E1", "E2"]]);
    const restored = readXlsxSparklines(nativeEntries(xml), [sheet.name])[0]!;
    expect(restored.get("E1")?.groupId).toBeTruthy();
    expect(restored.get("E2")?.groupId).toBe(restored.get("E1")?.groupId);
    expect(restored.get("E1")?.source).toEqual(sparkline(0).source);
    expect(restored.get("E2")?.source).toEqual(sparkline(1).source);
  });

  test("independent sparklines with identical styles remain separate native groups", async () => {
    const { workbook, sheet } = fixture();
    setCellSparkline(sheet, { row: 0, column: 4 }, sparkline(0));
    setCellSparkline(sheet, { row: 1, column: 4 }, sparkline(1));
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(groupMembers(xml)).toEqual([["E1"], ["E2"]]);
    const restored = readXlsxSparklines(nativeEntries(xml), [sheet.name])[0]!;
    expect(restored.get("E1")?.groupId).toBeUndefined();
    expect(restored.get("E2")?.groupId).toBeUndefined();
  });

  test("different group identities are not merged merely because their styles match", async () => {
    const { workbook, sheet } = fixture();
    for (const [row, groupId] of [
      [0, "first"],
      [1, "first"],
      [2, "second"],
      [3, "second"],
    ] as const)
      setCellSparkline(sheet, { row, column: 4 }, sparkline(row, groupId));
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(groupMembers(xml)).toEqual([
      ["E1", "E2"],
      ["E3", "E4"],
    ]);
    const restored = readXlsxSparklines(nativeEntries(xml), [sheet.name])[0]!;
    expect(restored.get("E1")?.groupId).toBe(restored.get("E2")?.groupId);
    expect(restored.get("E3")?.groupId).toBe(restored.get("E4")?.groupId);
    expect(restored.get("E1")?.groupId).not.toBe(restored.get("E3")?.groupId);
  });

  test("native-only worksheet XML restores shared identity without any private metadata", () => {
    const entries = nativeEntries(
      nativeWorksheet(
        nativeGroup(nativeMember("A1:C1", "E1"), nativeMember("A2:C2", "E2")),
        nativeGroup(nativeMember("A3:C3", "E3")),
      ),
    );
    expect(Object.keys(entries)).toHaveLength(3);
    const restored = readXlsxSparklines(entries, ["Data"])[0]!;
    expect(restored.get("E1")?.groupId).toBeTruthy();
    expect(restored.get("E2")?.groupId).toBe(restored.get("E1")?.groupId);
    expect(restored.get("E3")?.groupId).toBeUndefined();
    expect(restored.get("E1")?.source).toEqual(sparkline(0).source);
    expect(restored.get("E2")?.source).toEqual(sparkline(1).source);
  });

  test("an explicit group ID equal to another cell key does not absorb that independent cell", async () => {
    const { workbook, sheet } = fixture();
    setCellSparkline(sheet, { row: 0, column: 3 }, sparkline(0, "0:4"));
    setCellSparkline(sheet, { row: 1, column: 3 }, sparkline(1, "0:4"));
    setCellSparkline(sheet, { row: 0, column: 4 }, sparkline(0));
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    expect(groupMembers(strFromU8(entries["xl/worksheets/sheet1.xml"]!))).toEqual([
      ["D1", "D2"],
      ["E1"],
    ]);
  });
});
