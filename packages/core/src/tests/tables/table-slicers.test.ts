// 未执行：按约定仅编写单测，待功能完成后统一验证。
import { describe, expect, test } from "vitest";
import { getTableSlicerState, createTableSlicerFilterCommand } from "../../table-slicers.js";
import {
  createSheetFilterHiddenRowIntervals,
  createSetSheetFilterCriteriaCommand,
} from "../../commands/filter.js";
import { createDuplicateSheetCommand } from "../../commands/sheets.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import { createCreateTableCommand, createUpdateTableCommand } from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import type { SheetSlicerDrawing } from "../../sheet-drawings.js";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  createWorkbookEvaluator,
  type SheetTable,
} from "../../workbook.js";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";

function fixture() {
  const workbook = createWorkbook({ id: "slicers", sheetId: "sales-sheet" }),
    sheet = getActiveSheet(workbook);
  [
    ["Region", "Channel"],
    ["North", "Retail"],
    ["South", "Retail"],
    ["East", "Online"],
    ["North", "Online"],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetTable = {
    id: "sales",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
    columns: [
      { id: "region", name: "Region" },
      { id: "channel", name: "Channel" },
    ],
    style: createBuiltinTableStyles("#4f81bd")[1]!,
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  const session = createWorkbookSession({ workbook, idFactory: () => "id" });
  executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
  executeWorkbookCommand(session, createUpdateTableCommand(sheet.id, table.id, { totalRow: true }));
  const source = { tableId: table.id, columnId: "region" };
  const state = () =>
    getTableSlicerState(sheet, source, createWorkbookEvaluator(workbook, sheet.id))!;
  const click = (value?: string, multi = false) => {
    const current = state();
    const key =
      value === undefined
        ? undefined
        : current.items.find((item) => item.value.kind === "string" && item.value.value === value)!
            .key;
    executeWorkbookCommand(session, createTableSlicerFilterCommand(current, key, multi));
  };
  const hidden = () =>
    createSheetFilterHiddenRowIntervals(sheet).flatMap((interval) =>
      Array.from({ length: interval.end - interval.start + 1 }, (_, i) => interval.start + i),
    );
  return { workbook, sheet, table, session, source, state, click, hidden };
}
function slicer(source: SheetSlicerDrawing["slicer"]): SheetSlicerDrawing {
  return {
    id: "slicer",
    kind: "slicer",
    name: "Region slicer",
    slicer: source,
    anchor: { row: 0, column: 4 },
    offsetX: 0,
    offsetY: 0,
    width: 180,
    height: 220,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
  };
}
describe("table slicers", () => {
  test("single, multiple and clear selections share the table filter and preserve totals", () => {
    const f = fixture();
    f.click("North");
    expect(f.hidden()).toEqual([2, 3]);
    f.click("South", true);
    expect(f.hidden()).toEqual([3]);
    expect(
      f
        .state()
        .items.filter((item) => item.selected)
        .map((item) => item.value),
    ).toEqual([
      { kind: "string", value: "North" },
      { kind: "string", value: "South" },
    ]);
    f.click();
    expect(f.hidden()).toEqual([]);
    expect(f.state().filtered).toBe(false);
    expect(f.sheet.tables![0]!.totalRow).toBe(true);
    expect(f.sheet.tables![0]!.range.end.row).toBe(5);
    undoWorkbookCommand(f.session);
    expect(f.hidden()).toEqual([3]);
    expect(f.hidden()).not.toContain(5);
  });
  test("other-column filtering controls availability and survives clearing the slicer", () => {
    const f = fixture();
    const range = f.state().filter.range;
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCriteriaCommand(f.sheet.id, range, [
        { column: 1, allowedValues: [{ kind: "string", value: "Retail" }] },
      ]),
    );
    expect(
      f.state().items.find((item) => item.value.kind === "string" && item.value.value === "East")
        ?.available,
    ).toBe(false);
    f.click("North");
    expect(f.hidden()).toEqual([2, 3, 4]);
    f.click();
    expect(f.hidden()).toEqual([3, 4]);
    expect(f.sheet.tables![0]!.filter!.columns).toEqual([
      { column: 1, allowedValues: [{ kind: "string", value: "Retail" }] },
    ]);
    expect(f.hidden()).not.toContain(5);
  });
  test("renaming the table and header keeps stable slicer identities and updates its caption", () => {
    const f = fixture();
    f.sheet.drawings = [slicer(f.source)];
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { name: "RenamedSales" }),
    );
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "Territory" },
      ),
    );
    expect((f.sheet.drawings[0] as SheetSlicerDrawing).slicer).toEqual(f.source);
    expect(f.state().caption).toBe("Territory");
    f.click("South");
    expect(f.hidden()).toEqual([1, 3, 4]);
  });
  test("V112 saves slicer identity and rejects V111 payloads", () => {
    const f = fixture();
    f.sheet.drawings = [slicer(f.source)];
    f.click("North");
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(112);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 111 })).toThrow();
  });
  test("duplicating the table worksheet binds its slicer to the copied table independently", () => {
    const f = fixture();
    f.sheet.drawings = [slicer(f.source)];
    f.click("North");
    executeWorkbookCommand(
      f.session,
      createDuplicateSheetCommand(f.workbook, f.sheet.id, { id: "copy", name: "Copy" }),
    );
    const copy = f.workbook.sheets.get("copy")!,
      copiedTable = copy.tables![0]!,
      copiedSlicer = copy.drawings![0] as SheetSlicerDrawing;
    expect(copiedTable.id).not.toBe(f.table.id);
    expect(copiedSlicer.slicer).toEqual({ tableId: copiedTable.id, columnId: "region" });
    const state = getTableSlicerState(
      copy,
      copiedSlicer.slicer,
      createWorkbookEvaluator(f.workbook, copy.id),
    )!;
    executeWorkbookCommand(f.session, createTableSlicerFilterCommand(state));
    expect(createSheetFilterHiddenRowIntervals(copy)).toEqual([]);
    expect(f.hidden()).toEqual([2, 3]);
    undoWorkbookCommand(f.session);
    undoWorkbookCommand(f.session);
    expect(f.workbook.sheets.has("copy")).toBe(false);
  });
});
