// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSparklineScaleResolver, type CellSparkline } from "@sheetcraft/core/sparklines";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  getCellSparkline,
  setCellContent,
  setCellSparkline,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readXlsxSparklines } from "../../sparklines.js";
import { appendNativeWorksheetExtension } from "../../native/worksheet-order.js";

const part = "xl/worksheets/sheet1.xml";
const target = { row: 1, column: 5 };
const location = "worksheet1.sparkline:F2";

function definition(patch: Partial<CellSparkline> = {}): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
    color: "#2563eb",
    negativeColor: "#ef4444",
    markerColor: "#2563eb",
    markers: false,
    negativePoints: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
}

function fixture(value: CellSparkline) {
  const workbook = createWorkbook({ id: "axis-scale", sheetId: "sheet", sheetName: "Native" });
  const sheet = getActiveSheet(workbook);
  [1, 2, 3, 4].forEach((value, column) =>
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value }),
  );
  setCellSparkline(sheet, target, value);
  return { workbook, sheet };
}

async function nativeArchive(axisAttributes: string) {
  const workbook = createWorkbook({
    id: "native-axis-scale",
    sheetId: "sheet",
    sheetName: "Native",
  });
  const entries = unzipSync((await encodeXlsx(workbook)).bytes);
  const extension = `<ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="line" displayEmptyCellsAs="gap" markers="0" negative="0" displayXAxis="0" displayHidden="0" ${axisAttributes}><x14:colorSeries rgb="FF2563EB"/><x14:colorNegative rgb="FFEF4444"/><x14:sparklines><x14:sparkline><xm:f>'Native'!A1:D1</xm:f><xm:sqref>F2</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext>`;
  entries[part] = strToU8(appendNativeWorksheetExtension(strFromU8(entries[part]!), extension));
  return entries;
}

function omissions(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  return result.report.issues
    .filter(({ code }) => code === "feature-omitted")
    .flatMap(({ locations }) => locations);
}

describe("native XLSX sparkline axis scales", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "round trips %s custom finite limits through manualMin/manualMax",
    async (type) => {
      const value = definition({
        type,
        minAxis: { type: "custom", value: -2.5 },
        maxAxis: { type: "custom", value: 10.25 },
      });
      const f = fixture(value);
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      const entries = unzipSync(encoded.bytes);
      const xml = strFromU8(entries[part]!);
      expect(xml).toContain('minAxisType="custom"');
      expect(xml).toContain('maxAxisType="custom"');
      expect(xml).toContain('manualMin="-2.5"');
      expect(xml).toContain('manualMax="10.25"');
      const omitted = vi.fn();
      const native = readXlsxSparklines(entries, [f.sheet.name], omitted)[0]!.get("F2")!;
      expect(native.minAxis).toEqual(value.minAxis);
      expect(native.maxAxis).toEqual(value.maxAxis);
      expect(omitted).not.toHaveBeenCalled();
      const decoded = await decodeXlsx(encoded.bytes);
      const restored = getCellSparkline(getActiveSheet(decoded.workbook), target)!;
      expect(restored.minAxis).toEqual(value.minAxis);
      expect(restored.maxAxis).toEqual(value.maxAxis);
      expect(omissions(decoded)).not.toContain(location);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test.each([
    { minAxis: { type: "individual" as const }, maxAxis: { type: "group" as const } },
    { minAxis: { type: "group" as const }, maxAxis: { type: "individual" as const } },
    { minAxis: { type: "custom" as const, value: 0 }, maxAxis: { type: "group" as const } },
    { minAxis: { type: "individual" as const }, maxAxis: { type: "custom" as const, value: 0 } },
  ])(
    "round trips independent minimum $minAxis and maximum $maxAxis modes",
    async ({ minAxis, maxAxis }) => {
      const f = fixture(definition({ minAxis, maxAxis }));
      const encoded = await encodeXlsx(f.workbook);
      const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
      expect(xml).toContain(`minAxisType="${minAxis.type}"`);
      expect(xml).toContain(`maxAxisType="${maxAxis.type}"`);
      if (minAxis.type === "custom") expect(xml).toContain('manualMin="0"');
      else expect(xml).not.toMatch(/\bmanualMin=/);
      if (maxAxis.type === "custom") expect(xml).toContain('manualMax="0"');
      else expect(xml).not.toMatch(/\bmanualMax=/);
      const restored = getCellSparkline(
        getActiveSheet((await decodeXlsx(encoded.bytes)).workbook),
        target,
      )!;
      expect(restored.minAxis).toEqual(minAxis);
      expect(restored.maxAxis).toEqual(maxAxis);
    },
  );

  test("retains native group axis settings and uses all imported member sources for a shared scale", async () => {
    const value = definition({
      type: "column",
      groupId: "shared",
      minAxis: { type: "group" },
      maxAxis: { type: "group" },
    });
    const f = fixture(value);
    [100, 200, 300, 400].forEach((number, column) =>
      setCellContent(f.sheet, { row: 1, column }, { kind: "literal", value: number }),
    );
    setCellSparkline(
      f.sheet,
      { row: 2, column: 5 },
      { ...value, source: { start: { row: 1, column: 0 }, end: { row: 1, column: 3 } } },
    );
    const encoded = await encodeXlsx(f.workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
    expect([...xml.matchAll(/<x14:sparklineGroup\b/g)]).toHaveLength(1);
    expect(xml).toContain('minAxisType="group"');
    expect(xml).toContain('maxAxisType="group"');
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    const first = getCellSparkline(restored, target)!;
    const second = getCellSparkline(restored, { row: 2, column: 5 })!;
    expect(first.groupId).toEqual(expect.any(String));
    expect(second.groupId).toBe(first.groupId);
    expect(first.minAxis).toEqual({ type: "group" });
    expect(first.maxAxis).toEqual({ type: "group" });
    expect(createSparklineScaleResolver(restored, createSheetEvaluator(restored))(first)).toEqual({
      min: 0,
      max: 400,
    });
  });

  test.each([
    {
      attributes: 'minAxisType="custom" manualMin="-7.25" maxAxisType="group"',
      minAxis: { type: "custom" as const, value: -7.25 },
      maxAxis: { type: "group" as const },
    },
    {
      attributes: 'minAxisType="group" maxAxisType="custom" manualMax="0"',
      minAxis: { type: "group" as const },
      maxAxis: { type: "custom" as const, value: 0 },
    },
    {
      attributes: 'minAxisType="individual" maxAxisType="individual"',
      minAxis: { type: "individual" as const },
      maxAxis: { type: "individual" as const },
    },
  ])(
    "reads supported axis modes directly from native XML: $attributes",
    async ({ attributes, minAxis, maxAxis }) => {
      const entries = await nativeArchive(attributes);
      const omitted = vi.fn();
      const native = readXlsxSparklines(entries, ["Native"], omitted)[0]!.get("F2")!;
      expect(native.minAxis).toEqual(minAxis);
      expect(native.maxAxis).toEqual(maxAxis);
      expect(omitted).not.toHaveBeenCalled();
      const decoded = await decodeXlsx(zipSync(entries));
      const restored = getCellSparkline(getActiveSheet(decoded.workbook), target)!;
      expect(restored.minAxis).toEqual(minAxis);
      expect(restored.maxAxis).toEqual(maxAxis);
      expect(omissions(decoded)).not.toContain(location);
    },
  );

  test("ignores isolated manual attributes when no corresponding custom axis type is present", async () => {
    const entries = await nativeArchive('manualMin="not-a-number" manualMax="Infinity"');
    const omitted = vi.fn();
    const native = readXlsxSparklines(entries, ["Native"], omitted)[0]!.get("F2")!;
    expect(native).toBeDefined();
    expect(native.minAxis?.type).not.toBe("custom");
    expect(native.maxAxis?.type).not.toBe("custom");
    expect(omitted).not.toHaveBeenCalled();
    const decoded = await decodeXlsx(zipSync(entries));
    expect(getCellSparkline(getActiveSheet(decoded.workbook), target)).toBeDefined();
    expect(omissions(decoded)).not.toContain(location);
  });
});

describe("native XLSX sparkline direction", () => {
  test.each([true, false])(
    "writes and imports explicit rightToLeft=%s without an omission",
    async (rightToLeft) => {
      const f = fixture(definition({ rightToLeft }));
      const encoded = await encodeXlsx(f.workbook);
      const entries = unzipSync(encoded.bytes);
      expect(strFromU8(entries[part]!)).toContain(`rightToLeft="${Number(rightToLeft)}"`);
      const omitted = vi.fn();
      expect(readXlsxSparklines(entries, [f.sheet.name], omitted)[0]!.get("F2")?.rightToLeft).toBe(
        rightToLeft,
      );
      expect(omitted).not.toHaveBeenCalled();
      const decoded = await decodeXlsx(encoded.bytes);
      const imported = getCellSparkline(getActiveSheet(decoded.workbook), target)!;
      expect(imported.rightToLeft).toBe(rightToLeft);
      expect(imported.source).toEqual(definition().source);
      expect(omissions(decoded)).not.toContain(location);

      const native = await nativeArchive(`rightToLeft="${String(rightToLeft)}"`);
      const nativeDecoded = await decodeXlsx(zipSync(native));
      expect(getCellSparkline(getActiveSheet(nativeDecoded.workbook), target)?.rightToLeft).toBe(
        rightToLeft,
      );
      expect(omissions(nativeDecoded)).not.toContain(location);
    },
  );
});
