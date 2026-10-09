import { strFromU8, unzipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } };

describe("XLSX conditional-format differential styles", () => {
  test("roundtrips number, font, pattern, and explicit border/font clears", async () => {
    const workbook = createWorkbook({ id: "conditional-dxf", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "complete-style",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: {
          numberFormat: { kind: "percent", fractionDigits: 2 },
          fontFamily: "Arial",
          fontSize: 14,
          bold: false,
          italic: true,
          underline: "double",
          strikethrough: false,
          fontScript: "superscript",
          textColor: "#112233",
          fillPattern: "darkGrid",
          fillColor: "#445566",
          fillPatternColor: "#778899",
          borderTop: { style: "thin", color: "#aabbcc" },
          borderRight: false,
          borderDiagonalUp: { style: "double", color: "#010203" },
          borderDiagonalDown: false,
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('formatCode="#,##0.00%"');
    expect(styles).toContain('<name val="Arial"/>');
    expect(styles).toContain('<b val="0"/>');
    expect(styles).toContain('<u val="double"/>');
    expect(styles).toContain('<strike val="0"/>');
    expect(styles).toContain('<vertAlign val="superscript"/>');
    expect(styles).toContain('<patternFill patternType="darkGrid">');
    expect(styles).toContain("<right/>");
    expect(styles).toContain('diagonalUp="1" diagonalDown="0"');

    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats?.[0],
    ).toMatchObject({
      style: {
        numberFormat: { kind: "percent", fractionDigits: 2 },
        fontFamily: "Arial",
        fontSize: 14,
        bold: false,
        italic: true,
        underline: "double",
        strikethrough: false,
        fontScript: "superscript",
        textColor: "#112233",
        fillPattern: "darkGrid",
        fillColor: "#445566",
        fillPatternColor: "#778899",
        borderTop: { style: "thin", color: "#aabbcc" },
        borderRight: false,
        borderDiagonalUp: { style: "double", color: "#010203" },
        borderDiagonalDown: false,
      },
    });
  });

  test("roundtrips differential gradients and clear fills", async () => {
    const workbook = createWorkbook({ id: "conditional-gradient", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "gradient",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "cellValue", operator: "lessThan", value: 0 },
        style: {
          fillGradient: {
            type: "path",
            left: 0.2,
            right: 0.7,
            top: 0.3,
            bottom: 0.8,
            stops: [
              { position: 0, color: "#123456" },
              { position: 1, color: "#654321" },
            ],
          },
        },
      },
      {
        id: "clear-fill",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "cellValue", operator: "equal", value: 0 },
        style: {
          numberFormat: false,
          underline: false,
          fontScript: false,
          textColor: false,
          fillColor: false,
          fillGradient: false,
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain(
      '<gradientFill type="path" left="0.2" right="0.7" top="0.3" bottom="0.8">',
    );
    expect(styles).toContain('<patternFill patternType="none"/>');
    expect(styles).toContain('formatCode="General"');
    expect(styles).toContain('<u val="none"/>');
    expect(styles).toContain('<vertAlign val="baseline"/>');
    expect(styles).toContain('<color auto="1"/>');
    const stylesByRule = getActiveSheet(
      (await decodeXlsx(encoded.bytes)).workbook,
    ).conditionalFormats;
    expect(stylesByRule?.[0]?.style.fillGradient).toMatchObject({
      type: "path",
      left: 0.2,
      right: 0.7,
    });
    expect(stylesByRule?.[1]?.style.fillPattern).toBe(false);
    expect(stylesByRule?.[1]?.style).toMatchObject({
      numberFormat: false,
      underline: false,
      fontScript: false,
      textColor: false,
      fillColor: false,
      fillPattern: false,
      fillGradient: false,
    });
  });

  test("reports an unrepresentable selective fill clear instead of clearing the whole base fill", async () => {
    const workbook = createWorkbook({ id: "conditional-selective-clear", sheetId: "sheet" });
    getActiveSheet(workbook).conditionalFormats = [
      {
        id: "gradient-only-clear",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "cellValue", operator: "equal", value: 0 },
        style: { fillGradient: false },
      },
    ];
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "style-omitted" })]),
    );
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles.match(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/)?.[1]).not.toContain("<fill>");
  });
});
