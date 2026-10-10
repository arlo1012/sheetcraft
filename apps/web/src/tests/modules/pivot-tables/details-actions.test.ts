import { describe, expect, test, vi } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { getCellValue, setCellContent, type CellAddress } from "@sheetcraft/core/workbook";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
import { fixture } from "./fixture";

function setup() {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  f.actions.update({
    ...f.sheet.pivotTables![0]!,
    rowFields: [0],
    values: [{ field: 2, aggregate: "sum", caption: "Sales total" }],
  });
  const reportSheet = f.sheet;
  const table = reportSheet.pivotTables![0]!;
  let busy = false;
  let address: CellAddress = { row: table.anchor.row + 1, column: table.anchor.column + 1 };
  const execute = vi.fn((command: WorkbookCommand) => f.execute(command));
  const flush = vi.fn(() => true);
  const activateDetails = vi.fn();
  const onDetailsError = vi.fn();
  const actions = usePivotActions({
    getWorkbook: () => f.workbook,
    getSheet: () => reportSheet,
    getRange: () => ({ start: address, end: address }),
    isBusy: () => busy,
    flush,
    execute,
    name: () => "Sales",
    total: () => "Grand Total",
    empty: () => "(blank)",
    sumCaption: (field) => `Sum ${field}`,
    onError: vi.fn(),
    activateDetails,
    onDetailsError,
  });
  return {
    ...f,
    actions,
    execute,
    flush,
    activateDetails,
    onDetailsError,
    reportSheet,
    table,
    setBusy(value: boolean) {
      busy = value;
    },
    select(value: CellAddress) {
      address = value;
    },
  };
}

describe("pivot Show Details actions", () => {
  test("details use the last refresh cache and create one undoable sheet with headers", () => {
    const f = setup();
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 999 });
    setCellContent(f.source, { row: 2, column: 0 }, { kind: "literal", value: "Moved" });
    const size = f.workbook.sheets.size;
    const history = f.session.history.undoStack.length;
    expect(f.actions.showDetails()).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.workbook.sheets.size).toBe(size + 1);
    expect(f.session.history.undoStack).toHaveLength(history + 1);
    const id = f.activateDetails.mock.calls[0]![0] as string;
    const details = f.workbook.sheets.get(id)!;
    expect([0, 1, 2].map((column) => getCellValue(details, { row: 0, column }))).toEqual([
      "Region",
      "Quarter",
      "Amount",
    ]);
    expect([0, 1, 2].map((column) => getCellValue(details, { row: 1, column }))).toEqual([
      "East",
      "Q1",
      10,
    ]);
    expect([0, 1, 2].map((column) => getCellValue(details, { row: 2, column }))).toEqual([
      "East",
      "Q2",
      20,
    ]);
    expect(getCellValue(details, { row: 3, column: 0 })).toBeNull();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.workbook.sheets.has(id)).toBe(false);
    expect(f.workbook.sheets.size).toBe(size);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(getCellValue(f.workbook.sheets.get(id)!, { row: 1, column: 2 })).toBe(10);
    expect(f.onDetailsError).not.toHaveBeenCalled();
  });
  test("explicit report id and address override the selected cell", () => {
    const f = setup();
    f.select({ row: 0, column: 0 });
    expect(f.actions.showDetails(f.table.id, { row: 4, column: 1 })).toBe(true);
    const details = f.workbook.sheets.get(f.activateDetails.mock.calls[0]![0] as string)!;
    expect(getCellValue(details, { row: 1, column: 0 })).toBe("West");
    expect(getCellValue(details, { row: 1, column: 2 })).toBe(40);
  });
  test("execution failure creates no sheet and never activates a destination", () => {
    const f = setup();
    const size = f.workbook.sheets.size;
    f.execute.mockReturnValueOnce(false);
    expect(f.actions.showDetails()).toBe(false);
    expect(f.workbook.sheets.size).toBe(size);
    expect(f.activateDetails).not.toHaveBeenCalled();
  });
  test.each(["busy", "flush"] as const)("%s guard blocks execution and activation", (guard) => {
    const f = setup();
    if (guard === "busy") f.setBusy(true);
    else f.flush.mockReturnValueOnce(false);
    expect(f.actions.showDetails()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.activateDetails).not.toHaveBeenCalled();
  });
  test.each(["workbook", "sheet"] as const)(
    "%s protection reports the specific reason and creates no sheet",
    (kind) => {
      const f = setup();
      if (kind === "workbook") f.workbook.structureProtected = true;
      else {
        f.reportSheet.properties.protected = true;
        f.reportSheet.protection = { editableRanges: [] };
      }
      expect(f.actions.showDetails()).toBe(false);
      expect(f.onDetailsError).toHaveBeenCalledWith("protected");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.activateDetails).not.toHaveBeenCalled();
    },
  );
  test("legacy reports without a refresh cache request refresh instead of inventing live details", () => {
    const f = setup();
    delete f.table.dataCache;
    expect(f.actions.showDetails()).toBe(false);
    expect(f.onDetailsError).toHaveBeenCalledWith("cache");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.activateDetails).not.toHaveBeenCalled();
  });
  test("sheet protection permits details when PivotTable permission is granted", () => {
    const f = setup();
    f.reportSheet.properties.protected = true;
    f.reportSheet.protection = { editableRanges: [], pivotTables: true };
    expect(f.actions.showDetails()).toBe(true);
    expect(f.activateDetails).toHaveBeenCalledTimes(1);
    expect(f.onDetailsError).not.toHaveBeenCalled();
  });
  test("row labels and report headers are not drill-through targets", () => {
    const f = setup();
    expect(f.actions.showDetails(f.table.id, { row: 3, column: 0 })).toBe(false);
    expect(f.actions.showDetails(f.table.id, { row: 2, column: 1 })).toBe(false);
    expect(f.onDetailsError).toHaveBeenCalledWith("invalid");
    expect(f.execute).not.toHaveBeenCalled();
  });
});
