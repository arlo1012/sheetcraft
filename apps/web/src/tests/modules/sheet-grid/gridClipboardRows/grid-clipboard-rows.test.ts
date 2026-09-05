import { describe, expect, test } from "vitest";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createWorkbook,
  getActiveSheet,
  setCellValue,
} from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createGridClipboardRowVisibility,
  createVisibleGridPastePlan,
  getVisibleClipboardRows,
  rangeIntersectsMergedCells,
} from "../../../../modules/sheet-grid/gridClipboardRows";

function createFilteredSheet(hiddenRows: { start: number; end: number }) {
  const sheet = createSheet();
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: hiddenRows.end, column: 0 } },
    columns: [{ column: 0, allowedValues: [] }],
  };
  return sheet;
}

function createSheet() {
  return getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
}

describe("grid clipboard rows", () => {
  test("normalizes a reverse selection and returns only its visible physical rows", () => {
    const sheet = createFilteredSheet({ start: 0, end: 4 });
    setCellValue(sheet, { row: 1, column: 0 }, "visible");
    setCellValue(sheet, { row: 2, column: 0 }, "hidden");
    setCellValue(sheet, { row: 3, column: 0 }, "visible");
    setCellValue(sheet, { row: 4, column: 0 }, "visible");
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "visible" }] }],
    };
    const visibility = createGridClipboardRowVisibility(sheet);

    expect(
      getVisibleClipboardRows(visibility, {
        start: { row: 4, column: 2 },
        end: { row: 1, column: 1 },
      }),
    ).toEqual([1, 3, 4]);
  });

  test("returns an empty row set when every selected data row is hidden", () => {
    const sheet = createFilteredSheet({ start: 0, end: 3 });
    const visibility = createGridClipboardRowVisibility(sheet);

    expect(
      getVisibleClipboardRows(visibility, {
        start: { row: 1, column: 0 },
        end: { row: 3, column: 0 },
      }),
    ).toEqual([]);
  });

  test("rejects invalid or oversized ranges before allocating clipboard rows", () => {
    const visibility = createGridClipboardRowVisibility(createSheet());

    expect(
      getVisibleClipboardRows(visibility, {
        start: { row: -1, column: 0 },
        end: { row: 0, column: 0 },
      }),
    ).toBeNull();
    expect(
      getVisibleClipboardRows(visibility, {
        start: { row: 0, column: 0 },
        end: { row: 10, column: 10_000 },
      }),
    ).toBeNull();
  });

  test("uses the visibility index across a million-row hidden interval without materializing it", () => {
    const sheet = createFilteredSheet({ start: 0, end: MAX_SHEET_ROWS - 2 });
    const visibility = createGridClipboardRowVisibility(sheet);

    expect(visibility.visibleRowCount).toBe(2);
    expect(
      getVisibleClipboardRows(visibility, {
        start: { row: 0, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      }),
    ).toEqual([0, MAX_SHEET_ROWS - 1]);
  });

  test("tiles a single value over current visible destination rows", () => {
    const sheet = createFilteredSheet({ start: 0, end: 4 });
    setCellValue(sheet, { row: 1, column: 0 }, "visible");
    setCellValue(sheet, { row: 2, column: 0 }, "hidden");
    setCellValue(sheet, { row: 3, column: 0 }, "visible");
    setCellValue(sheet, { row: 4, column: 0 }, "visible");
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "visible" }] }],
    };
    const visibility = createGridClipboardRowVisibility(sheet);

    const plan = createVisibleGridPastePlan(
      [[7]],
      { start: { row: 1, column: 2 }, end: { row: 4, column: 2 } },
      { row: 1, column: 2 },
      visibility,
    );

    expect(plan).toEqual({
      anchor: { row: 1, column: 2 },
      range: { start: { row: 1, column: 2 }, end: { row: 4, column: 2 } },
      values: [[7], [7], [7]],
      rows: [1, 3, 4],
      preserveHiddenRows: true,
    });
  });

  test("rejects filtered single-cell and cut targets that overflow the final row or column", () => {
    const sheet = createFilteredSheet({ start: 0, end: 1 });
    const visibility = createGridClipboardRowVisibility(sheet);

    expect(
      createVisibleGridPastePlan(
        [[1], [2]],
        {
          start: { row: MAX_SHEET_ROWS - 1, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: 0 },
        },
        { row: MAX_SHEET_ROWS - 1, column: 0 },
        visibility,
      ),
    ).toBeNull();
    expect(
      createVisibleGridPastePlan(
        [[1, 2]],
        {
          start: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        },
        { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        visibility,
        { pasteFromActiveCell: true },
      ),
    ).toBeNull();
  });

  test("delegates unchanged plans when no rows are hidden and detects merge intersections", () => {
    const sheet = createSheet();
    const visibility = createGridClipboardRowVisibility(sheet);
    sheet.mergedCells = [{ start: { row: 2, column: 2 }, end: { row: 3, column: 3 } }];

    expect(
      createVisibleGridPastePlan(
        [[1]],
        { start: { row: 4, column: 4 }, end: { row: 4, column: 4 } },
        { row: 4, column: 4 },
        visibility,
      ),
    ).toEqual({
      anchor: { row: 4, column: 4 },
      range: { start: { row: 4, column: 4 }, end: { row: 4, column: 4 } },
      values: [[1]],
    });
    expect(
      rangeIntersectsMergedCells(sheet, {
        start: { row: 1, column: 1 },
        end: { row: 2, column: 2 },
      }),
    ).toBe(true);
  });
});
