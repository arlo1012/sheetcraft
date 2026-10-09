import type { ConditionalFormatIconSet } from "@sheetcraft/core/conditional-formatting";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

// Fixed external names from MS-XLSX ST_IconSetType; deliberately independent
// of the adapter's mapping so symmetric import/export mistakes cannot pass.
const BASE_ICON_SETS = [
  ["threeArrows", "3Arrows", 3],
  ["threeArrowsGray", "3ArrowsGray", 3],
  ["threeFlags", "3Flags", 3],
  ["threeTrafficLights", "3TrafficLights1", 3],
  ["threeTrafficLightsRimmed", "3TrafficLights2", 3],
  ["threeSigns", "3Signs", 3],
  ["threeSymbolsCircled", "3Symbols", 3],
  ["threeSymbols", "3Symbols2", 3],
  ["fourArrows", "4Arrows", 4],
  ["fourArrowsGray", "4ArrowsGray", 4],
  ["fourRedToBlack", "4RedToBlack", 4],
  ["fourRatings", "4Rating", 4],
  ["fourTrafficLights", "4TrafficLights", 4],
  ["fiveArrows", "5Arrows", 5],
  ["fiveArrowsGray", "5ArrowsGray", 5],
  ["fiveRatings", "5Rating", 5],
  ["fiveQuarters", "5Quarters", 5],
] as const satisfies readonly (readonly [ConditionalFormatIconSet, string, number])[];

describe("standard XLSX icon-set identities", () => {
  test.each(BASE_ICON_SETS)(
    "exports %s as %s without changing its levels",
    async (iconSet, name, count) => {
      for (const reverse of [false, true]) {
        const workbook = createWorkbook({ id: "icon-export", sheetId: "sheet" });
        const thresholds = Array.from({ length: count }, (_, value) => ({
          kind: "num" as const,
          value,
        }));
        getActiveSheet(workbook).conditionalFormats = [
          {
            id: "icons",
            ranges: [{ start: { row: 0, column: 0 }, end: { row: count - 1, column: 0 } }],
            anchor: { row: 0, column: 0 },
            condition: { kind: "iconSet", iconSet, thresholds, reverse, showValue: false },
            style: {},
          },
        ];
        const encoded = await encodeXlsx(workbook);
        const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
        expect(xml).toContain(
          `<iconSet iconSet="${name}"${reverse ? ' reverse="1"' : ""} showValue="0">${thresholds.map(({ value }) => `<cfvo type="num" val="${value}"/>`).join("")}</iconSet>`,
        );
        expect(encoded.report.issues).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
        );
      }
    },
  );

  test.each(BASE_ICON_SETS)(
    "imports external %s / %s rules with XML boolean attributes",
    async (iconSet, name, count) => {
      const workbook = createWorkbook({ id: "icon-import", sheetId: "sheet" });
      const entries = unzipSync((await encodeXlsx(workbook)).bytes);
      const thresholds = Array.from({ length: count }, (_, value) => ({
        kind: "num" as const,
        value,
      }));
      entries["xl/worksheets/sheet1.xml"] = strToU8(
        strFromU8(entries["xl/worksheets/sheet1.xml"]!).replace(
          "</worksheet>",
          `<conditionalFormatting sqref="A1:A${count}"><cfRule type="iconSet" priority="1"><iconSet iconSet="${name}" reverse="true" showValue="false">${thresholds.map(({ value }) => `<cfvo type="num" val="${value}"/>`).join("")}</iconSet></cfRule></conditionalFormatting></worksheet>`,
        ),
      );
      const restored = getActiveSheet(
        (await decodeXlsx(zipSync(entries))).workbook,
      ).conditionalFormats;
      expect(restored).toHaveLength(1);
      expect(restored?.[0]?.condition).toEqual({
        kind: "iconSet",
        iconSet,
        thresholds,
        reverse: true,
        showValue: false,
      });
    },
  );
});
