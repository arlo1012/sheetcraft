import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type CellRange,
} from "@sheetcraft/core/workbook";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { vi } from "vitest";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
export function fixture() {
  let workbook = createWorkbook({ id: "pivots", sheetId: "source" });
  const source = getActiveSheet(workbook);
  source.name = "Source Data";
  [
    ["Region", "Quarter", "Amount"],
    ["East", "Q1", 10],
    ["East", "Q2", 20],
    ["West", "Q1", 40],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let range: CellRange = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const onError = vi.fn();
  const flush = vi.fn(() => true);
  const actions = usePivotActions({
    getWorkbook: () => workbook,
    getSheet: () => getActiveSheet(workbook),
    getRange: () => range,
    isBusy: () => false,
    flush,
    execute,
    name: () => "Sales",
    total: () => "Grand Total",
    empty: () => "(blank)",
    sumCaption: (field) => `Sum ${field}`,
    onError,
  });
  return {
    actions,
    source,
    session,
    execute,
    onError,
    flush,
    get workbook() {
      return workbook;
    },
    get sheet() {
      return getActiveSheet(workbook);
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: "source" });
    },
    selectOutput() {
      range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    },
  };
}
