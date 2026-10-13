import { describe, expect, test, vi } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
} from "../../commands/structure.js";
import {
  createResizeSheetDimensionCommand,
  createSetSheetDefaultColumnWidthCommand,
  createSetSheetDimensionHiddenCommand,
} from "../../commands/dimensions.js";
import type { WorkbookCommand } from "../../commands/contracts.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import { groupShapeRoots } from "../../shape-group-planning.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeSheetDrawings, type SheetFramedGraphicDrawing } from "../../sheet-drawings.js";
import {
  MAX_SHEET_COLUMNS,
  createSheet,
  getActiveSheet,
  setCellContent,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
  type SheetDimensionAxis,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

function spanning(
  drawing: SheetFramedGraphicDrawing,
  axis: SheetDimensionAxis,
  start: number,
  end: number,
): SheetFramedGraphicDrawing {
  drawing.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 2, offset: 0 }, row: { index: 2, offset: 0 } },
    end: { column: { index: 4, offset: 0 }, row: { index: 4, offset: 0 } },
  };
  drawing.shapeFrame.anchor.start[axis].index = start;
  drawing.shapeFrame.anchor.end[axis].index = end;
  return drawing;
}

function fixture(axis: SheetDimensionAxis, start = 4, end = 6, hidden = false) {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook),
    observer = createSheet("Observer", "observer");
  session.workbook.sheets.set(observer.id, observer);
  setCellValue(sheet, { row: 3, column: 3 }, "retain");
  setCellValue(
    sheet,
    { row: axis === "row" ? start : 2, column: axis === "column" ? start : 2 },
    "inside",
  );
  setCellValue(
    sheet,
    {
      row: axis === "row" ? end : 7,
      column: axis === "column" ? Math.min(end, MAX_SHEET_COLUMNS - 1) : 7,
    },
    "shift",
  );
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=D4" } });
  setCellContent(
    observer,
    { row: 0, column: 0 },
    {
      kind: "formula",
      formula: { source: `='${sheet.name}'!D4` },
    },
  );
  setRowHeight(sheet, 3, 39);
  setColumnWidth(sheet, 3, 123);
  if (axis === "row") setRowHeight(sheet, start, 45);
  else setColumnWidth(sheet, start, 140);
  setSheetDimensionHidden(sheet, axis, 8, true);
  if (hidden)
    for (let index = start; index < end; index++) setSheetDimensionHidden(sheet, axis, index, true);
  const tailX =
    axis === "column" && start > 100
      ? createPictureSheetMetrics(sheet).columns.visiblePrefix(start)
      : 0;
  const line = connectorShape();
  line.shapeFrame.anchor = {
    mode: "fixed",
    x: tailX + 110,
    y: 50,
    size: { width: 100, height: 60 },
  };
  sheet.drawings = normalizeSheetDrawings([
    spanning(framedShape("rect"), axis, start, end),
    framedShape("ellipse", "ellipse", tailX + 210, 110),
    line,
  ]);
  executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 0, 41));
  executeWorkbookCommand(session, createResizeSheetDimensionCommand(sheet.id, "row", 0, 42));
  undoWorkbookCommand(session);
  expect(session.history.undoStack).toHaveLength(1);
  expect(session.history.redoStack).toHaveLength(1);
  const relation = resolveSheetShapeConnections(
    sheet.drawings,
    createPictureSheetMetrics(sheet),
  ).getConnector("connector")!;
  expect(relation.begin.status).toBe(hidden ? "suspended" : "ready");
  return { session, sheet };
}

function expectAtomicRejection(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: WorkbookCommand,
  error = /target.*missing/i,
): void {
  const snapshot = serializeWorkbook(session.workbook),
    workbook = structuredClone(session.workbook),
    history = structuredClone(session.history),
    sheet = getActiveSheet(session.workbook),
    drawings = sheet.drawings;
  // Core history has no host notification API. Check the underlying writes too,
  // so a failed command cannot hide a mutation behind an unchanged revision.
  const writes = [
    vi.spyOn(sheet.cells, "set"),
    vi.spyOn(sheet.cells, "delete"),
    vi.spyOn(sheet.rowHeights, "set"),
    vi.spyOn(sheet.rowHeights, "delete"),
    vi.spyOn(sheet.columnWidths, "set"),
    vi.spyOn(sheet.columnWidths, "delete"),
    vi.spyOn(sheet.hiddenRows!, "add"),
    vi.spyOn(sheet.hiddenRows!, "delete"),
    vi.spyOn(sheet.hiddenColumns!, "add"),
    vi.spyOn(sheet.hiddenColumns!, "delete"),
  ];
  try {
    expect.soft(() => executeWorkbookCommand(session, command)).toThrow(error);
    for (const write of writes) expect.soft(write).not.toHaveBeenCalled();
  } finally {
    for (const write of writes) write.mockRestore();
  }
  expect.soft(serializeWorkbook(session.workbook)).toEqual(snapshot);
  expect.soft(session.workbook).toEqual(workbook);
  expect.soft(sheet.drawings).toBe(drawings);
  expect.soft(session.history).toEqual(history);
}

function expectHistoryRoundTrip(
  session: ReturnType<typeof createTestWorkbookSession>,
  before: ReturnType<typeof serializeWorkbook>,
): void {
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}

const axes = ["row", "column"] as const;

describe("connector axis deletion and tail clipping are atomic", () => {
  test.each([false, true])(
    "default column width rejects a next-metrics route overflow before any write (owned=%s)",
    (owned) => {
      const { session, sheet } = fixture("column");
      const target = framedShape("ellipse", "ellipse");
      target.shapeFrame.anchor = {
        mode: "move-only",
        origin: { column: { index: 30, offset: 0 }, row: { index: 4, offset: 0 } },
        size: { width: 100, height: 60 },
      };
      sheet.drawings = normalizeSheetDrawings([framedShape("rect"), target, connectorShape()]);
      if (owned)
        sheet.drawings = groupShapeRoots(
          sheet.drawings,
          ["rect", "connector"],
          { id: "owner", name: "Owned connector" },
          createPictureSheetMetrics(sheet),
        );
      expect(
        resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet)).getConnector(
          "connector",
        )!.status,
      ).toBe("ready");
      expectAtomicRejection(
        session,
        createSetSheetDefaultColumnWidthCommand(sheet.id, 640),
        /route.*budget/i,
      );
    },
  );

  test("hiding leading columns rejects a newly oversized route before changing hidden metrics", () => {
    const { session, sheet } = fixture("column");
    const target = framedShape("ellipse", "ellipse");
    target.shapeFrame.anchor = {
      mode: "move-only",
      origin: { column: { index: 180, offset: 0 }, row: { index: 4, offset: 0 } },
      size: { width: 100, height: 60 },
    };
    const line = connectorShape();
    line.shapeFrame.anchor = { mode: "fixed", x: 17_110, y: 50, size: { width: 100, height: 60 } };
    sheet.drawings = normalizeSheetDrawings([framedShape("rect", "rect", 17_000), target, line]);
    expect(
      resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet)).getConnector(
        "connector",
      )!.status,
    ).toBe("ready");
    expectAtomicRejection(
      session,
      createSetSheetDimensionHiddenCommand(
        sheet.id,
        "column",
        Array.from({ length: 180 }, (_, index) => index),
        true,
      ),
      /route.*budget/i,
    );
  });

  test("default column width keeps its legacy behavior when the forest has no connector", () => {
    const { session, sheet } = fixture("column");
    sheet.drawings = [framedShape("rect")];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createSetSheetDefaultColumnWidthCommand(sheet.id, 640)),
    ).toBe(true);
    expect(sheet.defaultColumnWidth).toBe(640);
    expectHistoryRoundTrip(session, before);
  });

  for (const axis of axes)
    test.each([false, true])(
      `${axis} deletion rejects a removed referenced target before any write (hidden=%s)`,
      (hidden) => {
        const { session, sheet } = fixture(axis, 4, 6, hidden);
        expectAtomicRejection(session, createDeleteSheetAxisCommand(sheet.id, axis, 4, 2));
      },
    );

  test.each([false, true])(
    "tail column insertion rejects a clipped referenced target before any write (hidden=%s)",
    (hidden) => {
      const { session, sheet } = fixture(
        "column",
        MAX_SHEET_COLUMNS - 1,
        MAX_SHEET_COLUMNS,
        hidden,
      );
      expectAtomicRejection(
        session,
        createInsertSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1),
      );
    },
  );

  test.each(axes)(
    "deleting a %s target and its connector together remains valid with exact undo",
    (axis) => {
      const { session, sheet } = fixture(axis);
      sheet.drawings = normalizeSheetDrawings([
        spanning(framedShape("rect"), axis, 4, 6),
        framedShape("ellipse", "ellipse", 210, 110),
        spanning(connectorShape(), axis, 4, 6),
      ]);
      const before = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, 4, 2)),
      ).toBe(true);
      expect(sheet.drawings?.map((drawing) => drawing.id)).toEqual(["ellipse"]);
      expectHistoryRoundTrip(session, before);
    },
  );

  test.each(axes)(
    "ordinary %s target movement and shrink retain connector relations and exact undo",
    (axis) => {
      const { session, sheet } = fixture(axis),
        original = structuredClone(sheet.drawings),
        relation = original?.[2];
      for (const command of [
        createInsertSheetAxisCommand(sheet.id, axis, 3),
        createDeleteSheetAxisCommand(sheet.id, axis, 4),
      ]) {
        const before = serializeWorkbook(session.workbook),
          target = structuredClone(sheet.drawings?.[0]);
        expect(executeWorkbookCommand(session, command)).toBe(true);
        expect(sheet.drawings?.[0]).not.toEqual(target);
        expect(sheet.drawings?.[2]).toEqual(relation);
        expect(
          resolveSheetShapeConnections(
            sheet.drawings!,
            createPictureSheetMetrics(sheet),
          ).getConnector("connector")!.begin.status,
        ).toBe("ready");
        expectHistoryRoundTrip(session, before);
      }
    },
  );

  test.each(axes)("hidden %s target collapse remains suspended and recoverable", (axis) => {
    const { session, sheet } = fixture(axis),
      original = structuredClone(sheet.drawings),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionHiddenCommand(sheet.id, axis, [4, 5], true),
      ),
    ).toBe(true);
    expect(sheet.drawings).toEqual(original);
    expect(
      resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)).getConnector(
        "connector",
      )!.begin,
    ).toMatchObject({ status: "suspended", reason: "target-collapsed" });
    expectHistoryRoundTrip(session, before);
    const collapsed = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 3))).toBe(
      true,
    );
    expect(
      resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)).getConnector(
        "connector",
      )!.begin.status,
    ).toBe("suspended");
    expectHistoryRoundTrip(session, collapsed);
  });

  test.each(axes)(
    "without connector relations, removing a %s target preserves existing behavior",
    (axis) => {
      const { session, sheet } = fixture(axis);
      sheet.drawings = [spanning(framedShape("rect"), axis, 4, 6)];
      const before = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, 4, 2)),
      ).toBe(true);
      expect(sheet.drawings).toEqual([]);
      expectHistoryRoundTrip(session, before);
    },
  );
});
