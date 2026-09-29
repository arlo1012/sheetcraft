import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  createWorkbookEvaluator,
  setCellValue,
} from "@idea10/core/workbook";
import { createConditionalFormatVisualResolver } from "@idea10/core/conditional-formatting";
import type {
  ConditionalFormatIconSet,
  ConditionalFormatThreshold,
} from "@idea10/core/conditional-formatting";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";
import {
  readXlsxConditionalFormats,
  writeXlsxConditionalFormats,
} from "../conditional-formatting.js";
import { CompatibilityReportBuilder } from "../report.js";

const range = { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } };

function thresholds(count: number): ConditionalFormatThreshold[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "percent" as const,
    value: Math.round((index / (count - 1)) * 100),
  }));
}

function iconRule(id: string, iconSet: ConditionalFormatIconSet, reverse = false) {
  return {
    id,
    ranges: [range],
    anchor: range.start,
    condition: {
      kind: "iconSet" as const,
      iconSet,
      thresholds: thresholds(iconSet.startsWith("five") ? 5 : 3),
      ...(reverse ? { reverse: true } : {}),
      showValue: false,
    },
    style: {},
  };
}

describe("XLSX x14 visual conditional formatting", () => {
  test("imports an Excel-style linked data-bar extension that inherits base fields", () => {
    const report = new CompatibilityReportBuilder();
    const xml = `<worksheet><conditionalFormatting sqref="A1:A3"><cfRule type="dataBar" priority="1"><dataBar showValue="0"><cfvo type="min"/><cfvo type="max"/><color rgb="FF638EC6"/></dataBar><extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:id>{D0A6F76B-7C0B-4E89-A7A3-0DB2B85E7A1E}</x14:id></ext></extLst></cfRule></conditionalFormatting><extLst><ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:conditionalFormattings><x14:conditionalFormatting xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:cfRule type="dataBar" id="{D0A6F76B-7C0B-4E89-A7A3-0DB2B85E7A1E}"><x14:dataBar border="1" gradient="0" negativeBarColorSameAsPositive="1" axisPosition="none"><x14:borderColor rgb="FF2F5597"/></x14:dataBar></x14:cfRule><xm:sqref>A1:A3</xm:sqref></x14:conditionalFormatting></x14:conditionalFormattings></ext></extLst></worksheet>`;
    expect(readXlsxConditionalFormats(xml, undefined, 0, report).rules).toMatchObject([
      {
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#638EC6",
          borderColor: "#2F5597",
          gradient: false,
          showValue: false,
          axisPosition: "none",
        },
      },
    ]);
    expect(report.build().issues).toEqual([]);
  });

  test("roundtrips the complete Office 2010 data-bar appearance through its linked base rule", async () => {
    const workbook = createWorkbook({ id: "x14-data-bar", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "bar",
        ranges: [range],
        anchor: range.start,
        condition: {
          kind: "dataBar",
          minimum: { kind: "autoMin" },
          maximum: { kind: "autoMax" },
          color: "#638EC6",
          borderColor: "#2F5597",
          negativeColor: "#F8696B",
          negativeBorderColor: "#C00000",
          gradient: false,
          showValue: false,
          direction: "rightToLeft",
          axisPosition: "middle",
          axisColor: "#101010",
        },
        style: {},
      },
    ];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    const id = /<x14:id>(\{[^<]+\})<\/x14:id>/.exec(xml)?.[1];
    expect(id).toBeTruthy();
    expect(xml).toContain(`<x14:cfRule type="dataBar" id="${id}">`);
    expect(xml).toContain('<x14:cfvo type="autoMin"/>');
    expect(xml).toContain('<x14:cfvo type="autoMax"/>');
    expect(xml).toContain('border="1"');
    expect(xml).toContain('direction="rightToLeft"');
    expect(xml).toContain('axisPosition="middle"');
    expect(xml).toContain('<x14:negativeBorderColor rgb="FFC00000"/>');
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats;
    expect(restored).toHaveLength(1);
    expect(restored?.[0]).toMatchObject({
      condition: {
        kind: "dataBar",
        minimum: { kind: "autoMin" },
        maximum: { kind: "autoMax" },
        color: "#638EC6",
        borderColor: "#2F5597",
        negativeColor: "#F8696B",
        negativeBorderColor: "#C00000",
        gradient: false,
        showValue: false,
        direction: "rightToLeft",
        axisPosition: "middle",
        axisColor: "#101010",
      },
    });
  });

  test.each(["threeStars", "threeTriangles"] as const)(
    "keeps %s visible over a lower-priority ratings rule after export",
    async (iconSet) => {
      const workbook = createWorkbook({ id: "overlapping-icons", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      for (let row = 0; row < 5; row++) setCellValue(sheet, { row, column: 0 }, row + 1);
      sheet.conditionalFormats = [iconRule("top", iconSet), iconRule("underneath", "fiveRatings")];
      const restored = (await decodeXlsx((await encodeXlsx(workbook)).bytes)).workbook;
      const importedSheet = getActiveSheet(restored);
      const resolve = createConditionalFormatVisualResolver(
        importedSheet,
        createWorkbookEvaluator(restored, importedSheet.id),
      );
      expect(
        Array.from({ length: 5 }, (_, row) => resolve({ row, column: 0 })?.iconSet?.iconSet),
      ).toEqual(Array(5).fill(iconSet));
    },
  );

  test.each([
    "<extLst/>",
    '<extLst><ext uri="unrelated"><other:metadata xmlns:other="urn:other"/></ext></extLst>',
  ])("preserves one worksheet extension container: %s", (existing) => {
    const entries = {
      "xl/styles.xml": strToU8('<styleSheet><dxfs count="0"/><tableStyles/></styleSheet>'),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData/>${existing}</worksheet>`),
    };
    writeXlsxConditionalFormats(entries, [[iconRule("stars", "threeStars")]]);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]);
    expect(xml.match(/<extLst\b/g)).toHaveLength(1);
    expect(xml).toContain("<x14:conditionalFormattings>");
    if (existing.includes("unrelated"))
      expect(xml).toContain('<ext uri="unrelated"><other:metadata xmlns:other="urn:other"/></ext>');
  });

  test("encodes min/max as valid percentage thresholds and preserves stopping semantics", async () => {
    const workbook = createWorkbook({ id: "icon-min-max", sheetId: "sheet" });
    const rule = { ...iconRule("stars", "threeStars"), stopIfTrue: true };
    rule.condition.thresholds = [
      { kind: "min" },
      { kind: "percentile", value: 50 },
      { kind: "max" },
    ];
    getActiveSheet(workbook).conditionalFormats = [rule];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).not.toMatch(/<x14:cfvo type="(?:min|max)"/);
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats?.[0],
    ).toMatchObject({
      stopIfTrue: true,
      condition: {
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percentile", value: 50 },
          { kind: "percent", value: 100 },
        ],
      },
    });
  });

  test("roundtrips x14 formula thresholds with absolute references", async () => {
    const workbook = createWorkbook({ id: "x14-formula-thresholds", sheetId: "sheet" });
    const rule = iconRule("stars", "threeStars");
    rule.ranges = [{ start: { row: 3, column: 0 }, end: { row: 7, column: 0 } }];
    rule.anchor = { row: 1, column: 0 };
    rule.condition.thresholds = [
      { kind: "formula", formula: "=$B$2+$C$1" },
      { kind: "formula", formula: "=$D$2" },
      { kind: "formula", formula: "=$E$1" },
    ];
    getActiveSheet(workbook).conditionalFormats = [rule];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('<x14:cfvo type="formula"><xm:f>$B$2+$C$1</xm:f></x14:cfvo>');
    expect(xml).toContain('<x14:cfvo type="formula"><xm:f>$D$2</xm:f></x14:cfvo>');
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats?.[0],
    ).toMatchObject({
      condition: {
        thresholds: [
          { kind: "formula", formula: "=$B$2+$C$1" },
          { kind: "formula", formula: "=$D$2" },
          { kind: "formula", formula: "=$E$1" },
        ],
      },
    });
  });

  test.each(['custom="1"', 'activePresent="1"'])(
    "reports unsupported x14 icon behavior instead of silently changing it: %s",
    (attributes) => {
      const report = new CompatibilityReportBuilder();
      const xml = `<worksheet><x14:conditionalFormatting><x14:cfRule type="iconSet" priority="1" ${attributes}><x14:iconSet iconSet="3Stars" ${attributes}><x14:cfvo type="percent"><xm:f>0</xm:f></x14:cfvo><x14:cfvo type="percent"><xm:f>50</xm:f></x14:cfvo><x14:cfvo type="percent"><xm:f>100</xm:f></x14:cfvo></x14:iconSet></x14:cfRule><xm:sqref>A1:A3</xm:sqref></x14:conditionalFormatting></worksheet>`;
      expect(readXlsxConditionalFormats(xml, undefined, 0, report).rules).toHaveLength(0);
      expect(report.build().issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
      );
    },
  );

  test.each([
    ["threeStars", "3Stars"],
    ["threeTriangles", "3Triangles"],
    ["fiveBoxes", "5Boxes"],
  ] as const)("exports and imports x14-only %s", async (iconSet, xlsxName) => {
    const workbook = createWorkbook({ id: `${iconSet}-x14`, sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [iconRule(iconSet, iconSet, true)];

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain("x14:conditionalFormattings");
    expect(xml).toContain(`x14:iconSet iconSet="${xlsxName}" reverse="1" showValue="0"`);
    expect(xml).toContain("<xm:f>0</xm:f>");
    expect(encoded.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
    );

    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats?.[0],
    ).toMatchObject({
      condition: { kind: "iconSet", iconSet, reverse: true, showValue: false },
    });
  });

  test("keeps base and x14 icon rules in their shared priority order", async () => {
    const workbook = createWorkbook({ id: "mixed-icon-priority", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      iconRule("stars", "threeStars", true),
      iconRule("arrows", "threeArrows"),
      iconRule("triangles", "threeTriangles", true),
      // This mirrors the real overlap: the base ratings rule is lower priority.
      iconRule("ratings", "fiveRatings"),
    ];

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(
      [...xml.matchAll(/<(?:x14:)?cfRule type="iconSet" priority="(\d+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["2", "4", "1", "3"]);
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats?.map(
        (rule) => rule.condition.kind === "iconSet" && rule.condition.iconSet,
      ),
    ).toEqual(["threeStars", "threeArrows", "threeTriangles", "fiveRatings"]);
  });

  test("imports an external x14 icon rule with OOXML false booleans", async () => {
    const workbook = createWorkbook({ id: "external-x14", sheetId: "sheet" });
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
        /<\/worksheet>/i,
        '<extLst><ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:conditionalFormattings><x14:conditionalFormatting xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:cfRule type="iconSet" priority="1" id="{00000000-0000-0000-0000-000000000001}"><x14:iconSet iconSet="3Triangles" reverse="true" showValue="false"><x14:cfvo type="percent"><xm:f>0</xm:f></x14:cfvo><x14:cfvo type="percent"><xm:f>33</xm:f></x14:cfvo><x14:cfvo type="percent"><xm:f>67</xm:f></x14:cfvo></x14:iconSet></x14:cfRule><xm:sqref>A1:A3</xm:sqref></x14:conditionalFormatting></x14:conditionalFormattings></ext></extLst></worksheet>',
      ),
    );
    const rules = getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).conditionalFormats;
    expect(rules?.[0]).toMatchObject({
      condition: {
        kind: "iconSet",
        iconSet: "threeTriangles",
        reverse: true,
        showValue: false,
      },
    });
  });
});
