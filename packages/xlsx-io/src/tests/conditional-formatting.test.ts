import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet } from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

describe("XLSX conditional formatting", () => {
  test.each([
    ["threeSymbols", "3Symbols2"],
    ["threeSymbolsCircled", "3Symbols"],
  ] as const)("exports %s using the standard %s icon set", async (iconSet, xlsxName) => {
    const workbook = createWorkbook({ id: "symbol-export", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "symbols",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: {
          kind: "iconSet",
          iconSet,
          thresholds: [
            { kind: "percent", value: 0 },
            { kind: "percent", value: 33 },
            { kind: "percent", value: 67 },
          ],
        },
        style: {},
      },
    ];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain(`iconSet="${xlsxName}"`);
  });

  test.each([
    ["3Symbols", "threeSymbolsCircled"],
    ["3Symbols2", "threeSymbols"],
  ] as const)("imports the standard %s icon set as %s", async (xlsxName, iconSet) => {
    const workbook = createWorkbook({ id: "symbol-import", sheetId: "sheet" });
    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
        /<\/worksheet>/i,
        `<conditionalFormatting sqref="A1:A3"><cfRule type="iconSet" priority="1"><iconSet iconSet="${xlsxName}"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting></worksheet>`,
      ),
    );
    const rules = getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).conditionalFormats;
    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.condition).toMatchObject({ kind: "iconSet", iconSet });
  });

  test("roundtrips rank, average, date and visual conditional-formatting rules", async () => {
    const workbook = createWorkbook({
      id: "extended-conditional-format",
      sheetId: "sheet",
    });
    const sheet = getActiveSheet(workbook);
    const range = { start: { row: 1, column: 0 }, end: { row: 20, column: 0 } };
    sheet.conditionalFormats = [
      {
        id: "rank",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "rank", count: 10, percent: true, bottom: true },
        style: { fillColor: "#FEE2E2" },
      },
      {
        id: "average",
        ranges: [range],
        anchor: range.start,
        condition: {
          kind: "average",
          above: false,
          equalAverage: true,
          stdDev: 2,
        },
        style: { fillColor: "#DBEAFE" },
      },
      {
        id: "today",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "date", period: "today" },
        style: { fillColor: "#DCFCE7" },
      },
      {
        id: "bar",
        ranges: [range],
        anchor: range.start,
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "percentile", value: 95 },
          color: "#638EC6",
          showValue: false,
        },
        style: {},
      },
      {
        id: "scale",
        ranges: [range],
        anchor: range.start,
        condition: {
          kind: "colorScale",
          stops: [
            { threshold: { kind: "min" }, color: "#F8696B" },
            { threshold: { kind: "percentile", value: 50 }, color: "#FFEB84" },
            { threshold: { kind: "max" }, color: "#63BE7B" },
          ],
        },
        style: {},
      },
      {
        id: "icons",
        ranges: [range],
        anchor: range.start,
        condition: {
          kind: "iconSet",
          iconSet: "threeArrows",
          thresholds: [
            { kind: "percent", value: 0 },
            { kind: "percent", value: 33 },
            { kind: "percent", value: 67 },
          ],
          reverse: true,
          showValue: false,
        },
        style: {},
      },
    ];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('type="top10"');
    expect(xml).toContain('aboveAverage="0"');
    expect(xml).toContain('timePeriod="today"');
    expect(xml).toContain('<dataBar showValue="0">');
    expect(xml).toContain("<colorScale>");
    expect(xml).toContain('iconSet="3Arrows" reverse="1" showValue="0"');
    const rules = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats;
    expect(rules?.map((rule) => rule.condition)).toEqual([
      { kind: "rank", count: 10, percent: true, bottom: true },
      { kind: "average", above: false, equalAverage: true, stdDev: 2 },
      { kind: "date", period: "today" },
      {
        kind: "dataBar",
        minimum: { kind: "min" },
        maximum: { kind: "percentile", value: 95 },
        color: "#638EC6",
        showValue: false,
      },
      {
        kind: "colorScale",
        stops: [
          { threshold: { kind: "min" }, color: "#F8696B" },
          { threshold: { kind: "percentile", value: 50 }, color: "#FFEB84" },
          { threshold: { kind: "max" }, color: "#63BE7B" },
        ],
      },
      {
        kind: "iconSet",
        iconSet: "threeArrows",
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "percent", value: 67 },
        ],
        reverse: true,
        showValue: false,
      },
    ]);
  });

  test("reports non-Core visual threshold and data-bar extension semantics", async () => {
    const workbook = createWorkbook({
      id: "unsupported-visual-conditional-format",
      sheetId: "sheet",
    });
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
        /<\/worksheet>/i,
        '<conditionalFormatting sqref="A1"><cfRule type="dataBar" priority="1"><dataBar minLength="10"><cfvo type="min" gte="0"/><cfvo type="max"/><color rgb="FF638EC6"/></dataBar></cfRule></conditionalFormatting></worksheet>',
      ),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(getActiveSheet(decoded.workbook).conditionalFormats).toHaveLength(0);
    expect(decoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
    );
  });

  test("reports data-bar extensions it cannot encode", async () => {
    const workbook = createWorkbook({
      id: "data-bar-extension",
      sheetId: "sheet",
    });
    const sheet = getActiveSheet(workbook);
    sheet.conditionalFormats = [
      {
        id: "bar",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#638EC6",
          negativeColor: "#FF0000",
          gradient: false,
        },
        style: {},
      },
    ];
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
    );
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).not.toContain("negativeFillColor");
    expect(xml).not.toContain('gradient="0"');
  });

  test.each([
    ["threeStars", "3Stars", 3],
    ["threeTriangles", "3Triangles", 3],
    ["fiveBoxes", "5Boxes", 5],
  ] as const)(
    "omits x14-only %s instead of writing it as a base icon set",
    async (iconSet, xlsxName, count) => {
      const workbook = createWorkbook({
        id: `${iconSet}-icon-set`,
        sheetId: "sheet",
      });
      const sheet = getActiveSheet(workbook);
      sheet.conditionalFormats = [
        {
          id: iconSet,
          ranges: [{ start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }],
          anchor: { row: 0, column: 0 },
          condition: {
            kind: "iconSet",
            iconSet,
            thresholds: Array.from({ length: count }, (_, index) => ({
              kind: "percent" as const,
              value: Math.round((index / (count - 1)) * 100),
            })),
          },
          style: {},
        },
      ];
      const encoded = await encodeXlsx(workbook);
      expect(encoded.report.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
      );
      expect(strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!)).not.toContain(
        `iconSet="${xlsxName}"`,
      );
    },
  );

  test("uses the standard 3TrafficLights1 default when an iconSet attribute is omitted", async () => {
    const workbook = createWorkbook({ id: "icon-default", sheetId: "sheet" });
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    entries["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
        /<\/worksheet>/i,
        '<conditionalFormatting sqref="A1:A3"><cfRule type="iconSet" priority="1"><iconSet><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting></worksheet>',
      ),
    );
    const rule = getActiveSheet((await decodeXlsx(zipSync(entries))).workbook)
      .conditionalFormats?.[0];
    expect(rule?.condition).toMatchObject({
      kind: "iconSet",
      iconSet: "threeTrafficLights",
    });
  });

  test("escapes literal SEARCH wildcards for text conditions", async () => {
    const workbook = createWorkbook({ id: "literal-text", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.conditionalFormats = [
      {
        id: "literal-search",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "text", operator: "contains", text: "A*?~" },
        style: { fillColor: "#FEE2E2" },
      },
    ];
    const xml = strFromU8(
      unzipSync((await encodeXlsx(workbook)).bytes)["xl/worksheets/sheet1.xml"]!,
    );
    expect(xml).toContain("SEARCH(&quot;A~*~?~~&quot;,A1)");
  });

  test("rebases a formula when a partial clear leaves its original Core anchor behind", async () => {
    const workbook = createWorkbook({ id: "cleared-format", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.conditionalFormats = [
      {
        id: "remaining-bottom",
        ranges: [{ start: { row: 3, column: 0 }, end: { row: 9, column: 4 } }],
        // This is the original source anchor; the remaining sqref begins at A4.
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: '=$D2="Overdue"' },
        style: { fillColor: "#FEE2E2" },
      },
    ];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain("<formula>$D4=&quot;Overdue&quot;</formula>");
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook)
      .conditionalFormats?.[0];
    expect(restored).toMatchObject({
      anchor: { row: 3, column: 0 },
      condition: { kind: "formula", formula: '=$D4="Overdue"' },
    });
  });

  test("roundtrips ordered rules, their ranges, differential style and formula source", async () => {
    const workbook = createWorkbook({
      id: "conditional-formatting",
      sheetId: "sheet",
    });
    const sheet = getActiveSheet(workbook);
    sheet.conditionalFormats = [
      {
        id: "overdue",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 10, column: 4 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "formula", formula: '=$D2="Overdue"' },
        style: { fillColor: "#FEE2E2", textColor: "#B91C1C", bold: true },
        stopIfTrue: true,
      },
      {
        id: "high-value",
        ranges: [{ start: { row: 1, column: 5 }, end: { row: 10, column: 5 } }],
        anchor: { row: 1, column: 5 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 100 },
        style: { italic: true },
      },
      {
        id: "completed",
        ranges: [{ start: { row: 1, column: 6 }, end: { row: 10, column: 6 } }],
        anchor: { row: 1, column: 6 },
        condition: { kind: "cellValue", operator: "equal", value: "Done" },
        style: { textColor: "#166534" },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const sheetXml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    const stylesXml = strFromU8(entries["xl/styles.xml"]!);
    expect(sheetXml).toContain('type="expression"');
    expect(sheetXml).toContain('stopIfTrue="1"');
    expect(sheetXml).toContain('priority="1"');
    expect(sheetXml).toContain('priority="2"');
    expect(sheetXml).toContain('priority="3"');
    expect(sheetXml).toContain("<formula>$D2=&quot;Overdue&quot;</formula>");
    expect(sheetXml).toContain("<formula>&quot;Done&quot;</formula>");
    expect(stylesXml).toContain('<dxfs count="3">');
    expect(stylesXml).toContain('rgb="FFFEE2E2"');

    const restored = await decodeXlsx(encoded.bytes);
    const rules = getActiveSheet(restored.workbook).conditionalFormats;
    expect(rules).toHaveLength(3);
    expect(rules?.[0]).toMatchObject({
      ranges: [{ start: { row: 1, column: 0 }, end: { row: 10, column: 4 } }],
      anchor: { row: 1, column: 0 },
      condition: { kind: "formula", formula: '=$D2="Overdue"' },
      style: { fillColor: "#FEE2E2", textColor: "#B91C1C", bold: true },
      stopIfTrue: true,
    });
    expect(rules?.[1]).toMatchObject({
      condition: { kind: "cellValue", operator: "greaterThan", value: 100 },
      style: { italic: true },
    });
    expect(rules?.[2]).toMatchObject({
      condition: { kind: "cellValue", operator: "equal", value: "Done" },
      style: { textColor: "#166534" },
    });
    expect(restored.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
    );
  });

  test("reports unsupported rule types and unsupported differential style fields", async () => {
    const workbook = createWorkbook({
      id: "unsupported-conditional-format",
      sheetId: "sheet",
    });
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const styles = strFromU8(entries["xl/styles.xml"]!).replace(
      /<dxfs\b[^>]*\/?\s*>/i,
      '<dxfs count="1"><dxf><border><left style="thin"/></border></dxf></dxfs>',
    );
    const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
      /<\/worksheet>/i,
      '<conditionalFormatting sqref="A1"><cfRule type="top10" dxfId="0" priority="1"/></conditionalFormatting><conditionalFormatting sqref="B1"><cfRule type="duplicateValues" dxfId="0" priority="2"/></conditionalFormatting></worksheet>',
    );
    entries["xl/styles.xml"] = strToU8(styles);
    entries["xl/worksheets/sheet1.xml"] = strToU8(sheet);
    const bytes = zipSync(entries);
    const decoded = await decodeXlsx(bytes);
    const rules = getActiveSheet(decoded.workbook).conditionalFormats;
    expect(rules).toHaveLength(0);
    expect(decoded.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "feature-omitted" }),
        expect.objectContaining({ code: "style-omitted" }),
      ]),
    );
  });

  test("preserves a styleless stop-if-true rule", async () => {
    const workbook = createWorkbook({ id: "stop-rule", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "stop",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "formula", formula: "=TRUE" },
        style: {},
        stopIfTrue: true,
      },
    ];
    const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    expect(getActiveSheet(decoded.workbook).conditionalFormats).toEqual([
      expect.objectContaining({
        condition: { kind: "formula", formula: "=TRUE" },
        style: {},
        stopIfTrue: true,
      }),
    ]);
  });
});
