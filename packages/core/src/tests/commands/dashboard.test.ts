// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createDashboardSheetCommand,
  createSetDashboardCommand,
} from "../../commands/dashboard.js";
import {
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createRenameSheetCommand,
} from "../../commands/sheets.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
} from "../../commands/structure.js";
import type { WorkbookCommand } from "../../commands/contracts.js";
import {
  dashboardKinds,
  emptyDashboard,
  newDashboardWidget,
  normalizeDashboard,
  type DashboardWidget,
  type SheetDashboard,
} from "../../dashboard.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { createSequentialIdFactory } from "../../runtime.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setActiveSheet,
  setCellContent,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function widget(id: string, sheetId: string): DashboardWidget {
  return {
    ...newDashboardWidget(id, "column", "Sales overview"),
    text: "Source note",
    source: {
      sheetId,
      range: { start: { row: 1, column: 1 }, end: { row: 4, column: 4 } },
    },
    category: 1,
    measures: [
      { column: 2, stat: "sum" },
      { column: 4, stat: "average" },
      { column: null, stat: "records" },
    ],
    sort: "value",
    descending: true,
    labels: true,
    width: 2,
    height: 2,
  };
}

function fixture() {
  const session = createTestWorkbookSession();
  const source = getActiveSheet(session.workbook);
  source.name = "Source";
  const owner = createSheet("Overview", "dashboard");
  const other = createSheet("Other source", "other");
  insertSheet(session.workbook, owner);
  insertSheet(session.workbook, other);
  owner.dashboard = {
    ...emptyDashboard(false),
    title: "销售仪表盘 📊",
    showTitle: true,
    theme: "blue",
    widgets: [
      widget("sales", source.id),
      widget("unrelated", other.id),
      { ...newDashboardWidget("note", "text", "Notes"), text: "Keep this note" },
    ],
  };
  setCellContent(source, { row: 1, column: 1 }, { kind: "literal", value: "Region" });
  setCellContent(source, { row: 2, column: 2 }, { kind: "literal", value: 10 });
  setCellContent(source, { row: 4, column: 4 }, { kind: "literal", value: 25 });
  return { session, source, owner, other };
}

function roundtrip(session: WorkbookSession, command: WorkbookCommand, check: () => void) {
  const before = serializeWorkbook(session.workbook);
  expect(executeWorkbookCommand(session, command)).toBe(true);
  check();
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}

describe("dashboard worksheet commands", () => {
  test.each([false, true])(
    "creates and activates an independent dashboard sheet with snapshot=%s",
    (snapshot) => {
      const session = createTestWorkbookSession();
      const source = getActiveSheet(session.workbook);
      source.name = "Dashboard";
      const sourceBefore = serializeWorkbook(session.workbook).sheets[0];
      const command = createDashboardSheetCommand(
        session.workbook,
        "dashboard",
        snapshot,
        createSequentialIdFactory(100),
      );
      const id = command.sheet.id;
      roundtrip(session, command, () => {
        const dashboard = session.workbook.sheets.get(id)!;
        expect(id).not.toBe(source.id);
        expect(dashboard.name).toBe("dashboard 2");
        expect(dashboard.dashboard).toEqual(emptyDashboard(snapshot));
        expect(dashboard.cells.size).toBe(0);
        expect(dashboard.drawings ?? []).toEqual([]);
        expect(session.workbook.activeSheetId).toBe(id);
        expect(source.dashboard).toBeUndefined();
        expect(serializeWorkbook(session.workbook).sheets[0]).toEqual(sourceBefore);
      });
      setActiveSheet(session.workbook, source.id);
      expect(session.workbook.activeSheetId).toBe(source.id);
      setActiveSheet(session.workbook, id);
      expect(getActiveSheet(session.workbook).dashboard).toEqual(emptyDashboard(snapshot));
    },
  );

  test("sets all widget kinds through detached commands and reloads snapshot version 99", () => {
    const f = fixture();
    const dashboard: SheetDashboard = {
      ...emptyDashboard(false),
      title: "Updated board 🚀",
      showTitle: true,
      theme: "dark",
      widgets: dashboardKinds.map((kind) => ({ ...widget(kind, f.source.id), kind })),
    };
    const before = structuredClone(dashboard);
    const command = createSetDashboardCommand(f.owner.id, dashboard);
    dashboard.widgets[0]!.title = "Changed after creating command";
    roundtrip(f.session, command, () => {
      expect(f.owner.dashboard).toEqual(before);
      expect(f.owner.drawings ?? []).toEqual([]);
      const snapshot = serializeWorkbook(f.session.workbook);
      expect(snapshot.version).toBe(99);
      const reloaded = deserializeWorkbook(snapshot);
      expect(reloaded.sheets.get(f.owner.id)!.dashboard).toEqual(before);
      expect(serializeWorkbook(reloaded)).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 98 })).toThrow();
    });
  });

  test("an unchanged dashboard does not add history and an ordinary sheet rejects dashboard updates", () => {
    const f = fixture();
    expect(
      executeWorkbookCommand(f.session, createSetDashboardCommand(f.owner.id, f.owner.dashboard!)),
    ).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      executeWorkbookCommand(f.session, createSetDashboardCommand(f.source.id, emptyDashboard())),
    ).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each([
    { kind: "unknown" },
    { width: 4 },
    { height: 3 },
    { group: "true" },
    { sort: "unknown" },
    { category: -1 },
    { category: MAX_SHEET_COLUMNS },
    { measures: [] },
    { measures: [{ column: 2, stat: "median" }] },
    { measures: [{ column: 1.5, stat: "sum" }] },
  ])("rejects malformed widget types or fields %j without changing the workbook", (patch) => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const invalid = {
      ...f.owner.dashboard!,
      widgets: [{ ...widget("invalid", f.source.id), ...patch }],
    };
    expect(() => normalizeDashboard(invalid)).toThrow();
    expect(() => createSetDashboardCommand(f.owner.id, invalid as SheetDashboard)).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each([
    { start: { row: -1, column: 0 }, end: { row: 1, column: 1 } },
    { start: { row: 0, column: 0 }, end: { row: MAX_SHEET_ROWS, column: 1 } },
    { start: { row: 0, column: 0 }, end: { row: 1, column: MAX_SHEET_COLUMNS } },
    { start: { row: 5, column: 1 }, end: { row: 4, column: 4 } },
    { start: { row: 1, column: 5 }, end: { row: 4, column: 4 } },
    { start: { row: 0.5, column: 0 }, end: { row: 1, column: 1 } },
    { start: { row: 0, column: 0 }, end: { row: Infinity, column: 1 } },
    { start: { row: 0, column: 0 }, end: { row: 1000, column: 100 } },
  ])("rejects invalid or oversized source ranges %j", (range) => {
    const f = fixture();
    const invalid = {
      ...f.owner.dashboard!,
      widgets: [{ ...widget("invalid", f.source.id), source: { sheetId: f.source.id, range } }],
    };
    expect(() => createSetDashboardCommand(f.owner.id, invalid)).toThrow();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("copies dashboard state independently while retaining its external source identities", () => {
    const f = fixture();
    const before = structuredClone(f.owner.dashboard);
    roundtrip(
      f.session,
      createDuplicateSheetCommand(f.session.workbook, f.owner.id, {
        id: "dashboard-copy",
        name: "Dashboard copy",
      }),
      () => {
        const copy = f.session.workbook.sheets.get("dashboard-copy")!;
        expect(copy.dashboard).toEqual(before);
        expect(copy.dashboard).not.toBe(f.owner.dashboard);
        expect(copy.dashboard!.widgets[0]!.source!.range).not.toBe(
          f.owner.dashboard!.widgets[0]!.source!.range,
        );
        expect(copy.dashboard!.widgets[0]!.measures).not.toBe(
          f.owner.dashboard!.widgets[0]!.measures,
        );
        expect(copy.dashboard!.widgets[0]!.source!.sheetId).toBe(f.source.id);
        expect(f.owner.dashboard).toEqual(before);
      },
    );
  });

  test("copying or renaming the source sheet preserves the dashboard's source ID, range, and fields", () => {
    const f = fixture();
    const before = structuredClone(f.owner.dashboard);
    roundtrip(
      f.session,
      createDuplicateSheetCommand(f.session.workbook, f.source.id, {
        id: "source-copy",
        name: "Source copy",
      }),
      () => {
        expect(f.owner.dashboard).toEqual(before);
        expect(f.session.workbook.sheets.get("source-copy")!.dashboard).toBeUndefined();
      },
    );
    roundtrip(f.session, createRenameSheetCommand(f.source.id, "Renamed source"), () => {
      expect(f.session.workbook.sheets.get(f.source.id)!.name).toBe("Renamed source");
      expect(f.owner.dashboard).toEqual(before);
    });
  });

  test.each([
    { index: 0, start: 3, end: 6, category: 3, first: 4 },
    { index: 3, start: 1, end: 6, category: 1, first: 2 },
  ])(
    "inserting columns at $index remaps the source range and selected fields",
    ({ index, start, end, category, first }) => {
      const f = fixture();
      const before = structuredClone(f.owner.dashboard!);
      roundtrip(f.session, createInsertSheetAxisCommand(f.source.id, "column", index, 2), () => {
        expect(f.owner.dashboard!.widgets[0]).toEqual({
          ...before.widgets[0],
          source: {
            sheetId: f.source.id,
            range: { start: { row: 1, column: start }, end: { row: 4, column: end } },
          },
          category,
          measures: [
            { column: first, stat: "sum" },
            { column: 6, stat: "average" },
            { column: null, stat: "records" },
          ],
        });
        expect(f.owner.dashboard!.widgets.slice(1)).toEqual(before.widgets.slice(1));
      });
    },
  );

  test.each([
    { index: 1, category: null, first: 1 },
    { index: 2, category: 1, first: null },
  ])(
    "deleting selected column $index clears that field and remaps retained fields",
    ({ index, category, first }) => {
      const f = fixture();
      const before = structuredClone(f.owner.dashboard!);
      roundtrip(f.session, createDeleteSheetAxisCommand(f.source.id, "column", index, 1), () => {
        expect(f.owner.dashboard!.widgets[0]).toEqual({
          ...before.widgets[0],
          source: {
            sheetId: f.source.id,
            range: { start: { row: 1, column: 1 }, end: { row: 4, column: 3 } },
          },
          category,
          measures: [
            { column: first, stat: "sum" },
            { column: 3, stat: "average" },
            { column: null, stat: "records" },
          ],
        });
        expect(f.owner.dashboard!.widgets.slice(1)).toEqual(before.widgets.slice(1));
      });
    },
  );

  test.each(["all source columns", "source worksheet"] as const)(
    "invalidates deleted %s and restores the exact range and fields on undo",
    (deletion) => {
      const f = fixture();
      const before = structuredClone(f.owner.dashboard!);
      const command =
        deletion === "source worksheet"
          ? createDeleteSheetCommand(f.session.workbook, f.source.id)
          : createDeleteSheetAxisCommand(f.source.id, "column", 1, 4);
      roundtrip(f.session, command, () => {
        expect(f.owner.dashboard!.widgets[0]).toEqual({
          ...before.widgets[0],
          source: { sheetId: f.source.id, range: null },
          category: null,
          measures: [
            { column: null, stat: "sum" },
            { column: null, stat: "average" },
            { column: null, stat: "records" },
          ],
        });
        expect(f.owner.dashboard!.widgets.slice(1)).toEqual(before.widgets.slice(1));
        if (deletion === "source worksheet")
          expect(f.session.workbook.sheets.has(f.source.id)).toBe(false);
      });
    },
  );
});
