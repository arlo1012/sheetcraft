// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellSparkline,
  setCellContent,
  setCellSparkline,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../index.js";
import { readXlsxSparklines } from "../sparklines.js";

const part = "xl/worksheets/sheet1.xml";
const target = { row: 1, column: 5 };
const location = "worksheet1.sparkline:F2";

function definition(type: CellSparkline["type"] = "line"): CellSparkline {
  return {
    type,
    source: { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
    color: "#123456",
    negativeColor: "#654321",
    markerColor: "#556688",
    markers: true,
    negativePoints: false,
    axis: true,
    showHidden: false,
    empty: "gap",
    firstPoint: { show: true, color: "#112244" },
    lastPoint: { show: false, color: "#223355" },
    highPoint: { show: true, color: "#334466" },
    lowPoint: { show: false, color: "#445577" },
  };
}

async function fixture(value: CellSparkline) {
  const workbook = createWorkbook({
    id: "sparkline-points",
    sheetId: "sheet",
    sheetName: "Native",
  });
  const sheet = getActiveSheet(workbook);
  [10, -4, 8, 2].forEach((number, column) =>
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value: number }),
  );
  setCellSparkline(sheet, target, value);
  return { workbook, sheet };
}

async function nativeArchive(flags: string, colorTags: string) {
  const workbook = createWorkbook({
    id: "native-sparkline",
    sheetId: "sheet",
    sheetName: "Native",
  });
  const entries = unzipSync((await encodeXlsx(workbook)).bytes);
  const extension = `<extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="line" displayEmptyCellsAs="gap" markers="0" displayXAxis="0" displayHidden="0" ${flags}>${colorTags}<x14:sparklines><x14:sparkline><xm:f>'Native'!A1:D1</xm:f><xm:sqref>F2</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext></extLst>`;
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace("</worksheet>", `${extension}</worksheet>`),
  );
  return entries;
}

function omissionLocations(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  return result.report.issues
    .filter(({ code }) => code === "feature-omitted")
    .flatMap(({ locations }) => locations);
}

describe("native XLSX sparkline point styles", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "round trips independent %s point colors and explicit disabled flags through native XML",
    async (type) => {
      const value = definition(type);
      const f = await fixture(value);
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      const entries = unzipSync(encoded.bytes);
      const xml = strFromU8(entries[part]!);
      const group = /<x14:sparklineGroup\b([^>]*)>([\s\S]*?)<\/x14:sparklineGroup>/.exec(xml)!;

      expect(group[1]).toContain(`type="${type === "winLoss" ? "stacked" : type}"`);
      for (const attribute of ['negative="0"', 'first="1"', 'last="0"', 'high="1"', 'low="0"'])
        expect(group[1]).toContain(attribute);
      expect([...group[2]!.matchAll(/<x14:(color\w+)\b/g)].map((match) => match[1])).toEqual([
        "colorSeries",
        "colorNegative",
        "colorAxis",
        "colorMarkers",
        "colorFirst",
        "colorLast",
        "colorHigh",
        "colorLow",
      ]);
      expect(group[2]).toContain('<x14:colorMarkers rgb="FF556688"/>');
      expect(group[2]).toContain('<x14:colorNegative rgb="FF654321"/>');
      expect(group[2]).toContain('<x14:colorLast rgb="FF223355"/>');
      expect(group[2]).toContain('<x14:colorLow rgb="FF445577"/>');
      const omitted = vi.fn();
      expect(readXlsxSparklines(entries, [f.sheet.name], omitted)[0]?.get("F2")).toEqual(value);
      expect(omitted).not.toHaveBeenCalled();
      const decoded = await decodeXlsx(encoded.bytes);
      expect(getCellSparkline(getActiveSheet(decoded.workbook), target)).toEqual(value);
      expect(omissionLocations(decoded)).not.toContain(location);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test.each([
    { type: "line" as const, markers: false, explicit: undefined, negative: false },
    { type: "line" as const, markers: true, explicit: undefined, negative: true },
    { type: "column" as const, markers: false, explicit: undefined, negative: true },
    { type: "winLoss" as const, markers: false, explicit: undefined, negative: true },
    { type: "line" as const, markers: false, explicit: true, negative: true },
    { type: "line" as const, markers: true, explicit: false, negative: false },
    { type: "column" as const, markers: false, explicit: false, negative: false },
    { type: "winLoss" as const, markers: false, explicit: false, negative: false },
  ])(
    "writes effective negative=$negative for $type markers=$markers explicit=$explicit",
    async ({ type, markers, explicit, negative }) => {
      const value: CellSparkline = {
        type,
        source: { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
        color: "#123456",
        negativeColor: "#654321",
        markerColor: "#556688",
        markers,
        axis: false,
        showHidden: false,
        empty: "gap",
        ...(explicit === undefined ? {} : { negativePoints: explicit }),
      };
      const f = await fixture(value);
      const encoded = await encodeXlsx(f.workbook);
      const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
      expect(xml).toContain(`negative="${Number(negative)}"`);
      const imported = getCellSparkline(
        getActiveSheet((await decodeXlsx(encoded.bytes)).workbook),
        target,
      )!;
      expect(imported.negativePoints).toBe(negative);
      expect(imported.negativeColor).toBe("#654321");
      expect(imported.markerColor).toBe("#556688");
      expect(imported.color).toBe("#123456");
    },
  );

  test("reads flag-only and color-only point settings from hand-authored native XML without custom metadata", async () => {
    const entries = await nativeArchive(
      'negative="false" high="true" last="false"',
      '<x14:colorSeries rgb="FF123456"/><x14:colorNegative rgb="FF654321"/><x14:colorFirst rgb="FF112244"/>',
    );
    const omitted = vi.fn();
    const value = readXlsxSparklines(entries, ["Native"], omitted)[0]!.get("F2")!;

    expect(value.negativePoints).toBe(false);
    expect(value.negativeColor).toBe("#654321");
    expect(value.markerColor).toBeUndefined();
    expect(value.firstPoint).toEqual({ show: false, color: "#112244" });
    expect(value.highPoint?.show).toBe(true);
    expect(value.highPoint?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(value.lastPoint?.show).toBe(false);
    expect(value.lastPoint?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(value.lowPoint).toBeUndefined();
    expect(omitted).not.toHaveBeenCalled();
    const decoded = await decodeXlsx(zipSync(entries));
    expect(getCellSparkline(getActiveSheet(decoded.workbook), target)).toEqual(value);
    expect(omissionLocations(decoded)).not.toContain(location);
  });

  test.each(['dateAxis="1"'])(
    "still reports unsupported %s while retaining supported point styles",
    async (axisAttribute) => {
      const entries = await nativeArchive(
        `negative="0" high="1" low="0" ${axisAttribute}`,
        '<x14:colorSeries rgb="FF123456"/><x14:colorNegative rgb="FF654321"/><x14:colorHigh rgb="FF334466"/><x14:colorLow rgb="FF445577"/>',
      );
      const omitted = vi.fn();
      const value = readXlsxSparklines(entries, ["Native"], omitted)[0]!.get("F2")!;

      expect(value.highPoint).toEqual({ show: true, color: "#334466" });
      expect(value.lowPoint).toEqual({ show: false, color: "#445577" });
      expect(omitted.mock.calls).toEqual([[0, "F2"]]);
      const decoded = await decodeXlsx(zipSync(entries));
      expect(getCellSparkline(getActiveSheet(decoded.workbook), target)?.highPoint).toEqual(
        value.highPoint,
      );
      expect(omissionLocations(decoded)).toContain(location);
    },
  );
});
