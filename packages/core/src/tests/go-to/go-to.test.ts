import { describe, expect, test } from "vitest";
import { findSheetGoToTargets, type SheetGoToOptions } from "../../go-to.js";
import { createFormulaError } from "../../formula/types.js";
import { createTestWorkbook } from "../helpers.js";
import {
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setCellValue,
  type CellAddress,
  type CellRange,
} from "../../workbook.js";

const whole = (endRow: number, endColumn: number): CellRange => ({
  start: { row: 0, column: 0 },
  end: { row: endRow, column: endColumn },
});

function options(kind: SheetGoToOptions["kind"], overrides: Partial<SheetGoToOptions> = {}) {
  return {
    kind,
    constants: true,
    formulas: true,
    valueTypes: ["number", "text", "logical", "error"],
    ...overrides,
  } satisfies SheetGoToOptions;
}

function targets(
  sheet: ReturnType<typeof getActiveSheet>,
  targetOptions: SheetGoToOptions,
  selection = whole(10, 10),
  active: CellAddress = { row: 0, column: 0 },
) {
  return findSheetGoToTargets(sheet, targetOptions, { selection, active });
}

describe("sheet Go To Special targets", () => {
  test("matches constants and formulas by evaluated value type inside the selection", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellValue(sheet, { row: 0, column: 1 }, "text");
    setCellValue(sheet, { row: 0, column: 2 }, true);
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "error", error: createFormulaError("DIV0") },
    );
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=2" } });
    setCellContent(
      sheet,
      { row: 1, column: 1 },
      {
        kind: "image",
        image: { assetId: "cell-image", altText: "cell image" },
      },
    );

    expect(
      targets(sheet, options("data", { formulas: false, valueTypes: ["number", "error"] })).map(
        (item) => item.range.start,
      ),
    ).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 3 },
    ]);
    expect(
      targets(sheet, options("data", { constants: false, valueTypes: ["number"] })).map(
        (item) => item.range.start,
      ),
    ).toEqual([{ row: 1, column: 0 }]);
    expect(targets(sheet, options("data", { valueTypes: [] }))).toEqual([]);
  });

  test("uses sparse rectangular complements for blanks and includes style, merges, and objects in the used extent", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 1, column: 1 }, "one");
    setCellValue(sheet, { row: 3, column: 3 }, "two");
    setCellStyle(sheet, { row: 8, column: 5 }, { bold: true });
    sheet.mergedCells = [whole(6, 6)];
    sheet.floatingImages.push({
      id: "image-1",
      assetId: "asset-1",
      altText: "image",
      anchor: { row: 9, column: 7 },
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: 1,
    });

    expect(targets(sheet, options("blanks"), whole(4, 3)).map((item) => item.range)).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
      { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
      { start: { row: 1, column: 2 }, end: { row: 1, column: 3 } },
      { start: { row: 2, column: 0 }, end: { row: 2, column: 3 } },
      { start: { row: 3, column: 0 }, end: { row: 3, column: 2 } },
      { start: { row: 4, column: 0 }, end: { row: 4, column: 3 } },
    ]);
    expect(
      targets(sheet, options("last-cell"), {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      }),
    ).toEqual([{ range: { start: { row: 9, column: 7 }, end: { row: 9, column: 7 } } }]);

    const sparseSheet = getActiveSheet(createTestWorkbook());
    expect(targets(sparseSheet, options("blanks"), whole(800_000, 10_000))).toEqual([
      { range: { start: { row: 0, column: 0 }, end: { row: 800_000, column: 10_000 } } },
    ]);
  });

  test("compresses visible cells around manually hidden and filter-hidden axes", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    sheet.hiddenRows!.add(1);
    sheet.hiddenColumns!.add(1);
    sheet.filter = {
      range: whole(4, 2),
      columns: [],
      advanced: { uniqueOnly: false, hiddenRows: [{ start: 3, end: 3 }] },
    };

    expect(targets(sheet, options("visible"), whole(4, 2))).toEqual([
      { range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } } },
      { range: { start: { row: 0, column: 2 }, end: { row: 0, column: 2 } } },
      { range: { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } } },
      { range: { start: { row: 2, column: 2 }, end: { row: 2, column: 2 } } },
      { range: { start: { row: 4, column: 0 }, end: { row: 4, column: 0 } } },
      { range: { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } } },
    ]);
  });

  test("compares values against the active column or row and compresses blank differences", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 0, column: 0 }, "same");
    setCellValue(sheet, { row: 0, column: 1 }, "same");
    setCellValue(sheet, { row: 0, column: 2 }, "other");
    setCellValue(sheet, { row: 1, column: 1 }, "present");

    expect(targets(sheet, options("row-differences"), whole(1, 2))).toEqual([
      { range: { start: { row: 0, column: 2 }, end: { row: 0, column: 2 } } },
      { range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } } },
    ]);
    expect(targets(sheet, options("column-differences"), whole(1, 2))).toEqual([
      { range: { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } } },
      { range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } } },
      { range: { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } } },
    ]);
  });

  test("returns whole intersecting merges, current regions, and anchored floating objects", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 2, column: 2 }, "a");
    setCellValue(sheet, { row: 2, column: 3 }, "b");
    sheet.mergedCells = [
      { start: { row: 4, column: 4 }, end: { row: 5, column: 5 } },
      { start: { row: 8, column: 8 }, end: { row: 8, column: 9 } },
    ];
    sheet.floatingImages.push({
      id: "image-2",
      assetId: "asset-2",
      altText: "image",
      anchor: { row: 5, column: 4 },
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: 1,
    });

    expect(targets(sheet, options("current-region"), whole(10, 10), { row: 2, column: 2 })).toEqual(
      [{ range: { start: { row: 2, column: 2 }, end: { row: 2, column: 3 } } }],
    );
    expect(
      targets(sheet, options("merged"), {
        start: { row: 5, column: 5 },
        end: { row: 6, column: 6 },
      }),
    ).toEqual([{ range: { start: { row: 4, column: 4 }, end: { row: 5, column: 5 } } }]);
    expect(
      targets(sheet, options("objects"), {
        start: { row: 5, column: 4 },
        end: { row: 5, column: 4 },
      }),
    ).toEqual([
      { range: { start: { row: 5, column: 4 }, end: { row: 5, column: 4 } }, imageId: "image-2" },
    ]);
  });
});
