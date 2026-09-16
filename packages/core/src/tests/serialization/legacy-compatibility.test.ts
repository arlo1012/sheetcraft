import { describe, expect, test } from "vitest";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  DEFAULT_COLUMN_WIDTH,
  getActiveSheet,
  getCellContent,
  getCellValue,
} from "../../workbook.js";

function legacySnapshot(version: number, dimensions: Record<string, unknown> = {}) {
  return {
    version,
    id: "legacy-book",
    activeSheetId: "legacy-sheet",
    ...(version >= 3 ? { dateSystem: "1900" } : {}),
    ...(version >= 8 ? { definedNames: [] } : {}),
    ...(version >= 9
      ? {
          calculation: {
            mode: "automatic",
            iterative: false,
            maxIterations: 100,
            maxChange: 0.001,
          },
        }
      : {}),
    sheets: [
      {
        id: "legacy-sheet",
        name: "Old data",
        cells: [
          {
            address: { row: 0, column: 0 },
            ...(version === 1
              ? { value: "keep me" }
              : { content: { kind: "literal", value: "keep me" } }),
          },
          ...(version >= 2
            ? [
                {
                  address: { row: 0, column: 1 },
                  content: { kind: "formula", formula: { source: "=1+2" } },
                },
              ]
            : []),
        ],
        rowHeights: [{ index: 2, size: 36 }],
        columnWidths: [{ index: 2, size: 140 }],
        ...(version >= 4 ? { floatingImages: [] } : {}),
        ...(version >= 7 ? { properties: { pinned: false, hidden: false, protected: false } } : {}),
        ...dimensions,
      },
    ],
  };
}

describe("legacy workbook compatibility", () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "opens V%s without later optional dimensions and preserves content",
    (version) => {
      const snapshot = legacySnapshot(version);
      const before = structuredClone(snapshot);
      const workbook = deserializeWorkbook(snapshot);
      const sheet = getActiveSheet(workbook);
      expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("keep me");
      if (version >= 2)
        expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
          kind: "formula",
          formula: { source: "=1+2" },
        });
      expect(sheet.rowHeights.get(2)).toBe(36);
      expect(sheet.columnWidths.get(2)).toBe(140);
      expect(sheet.defaultColumnWidth).toBe(DEFAULT_COLUMN_WIDTH);
      expect(snapshot).toEqual(before);
      expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(workbook)))).toEqual(
        serializeWorkbook(workbook),
      );
    },
  );

  test.each([1, 2, 3, 4, 5, 6, 7])(
    "defaults only missing optional dimension fields (combination %s)",
    (mask) => {
      const dimensions = {
        ...(mask & 1 ? { hiddenRows: [3] } : {}),
        ...(mask & 2 ? { hiddenColumns: [4] } : {}),
        ...(mask & 4 ? { defaultColumnWidth: 120 } : {}),
      };
      const sheet = getActiveSheet(deserializeWorkbook(legacySnapshot(9, dimensions)));
      expect(sheet.hiddenRows).toEqual(new Set(mask & 1 ? [3] : []));
      expect(sheet.hiddenColumns).toEqual(new Set(mask & 2 ? [4] : []));
      expect(sheet.defaultColumnWidth).toBe(mask & 4 ? 120 : DEFAULT_COLUMN_WIDTH);
      expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("keep me");
    },
  );

  test.each([
    { hiddenRows: null },
    { hiddenColumns: "bad" },
    { defaultColumnWidth: null },
    { hiddenRows: [-1] },
    { hiddenColumns: [1.5] },
    { defaultColumnWidth: 0 },
  ])("does not silently discard an invalid supplied setting: %j", (dimensions) => {
    expect(() => deserializeWorkbook(legacySnapshot(9, dimensions))).toThrow();
  });
});
