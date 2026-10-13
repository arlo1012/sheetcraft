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
import { materializeShapeConnectorTargets } from "../../shape-connector-materialize.js";
import { transformShapeFrameAxis } from "../../shape-frame.js";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupChild,
} from "../../shape-group.js";
import { groupShapeRoots } from "../../shape-group-planning.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
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
  const after = serializeWorkbook(session.workbook),
    undoCount = session.history.undoStack.length,
    revision = session.history.revision;
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history.undoStack).toHaveLength(undoCount - 1);
  expect(session.history.redoStack).toHaveLength(1);
  expect(session.history.revision).toBe(revision + 1);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
  expect(session.history.undoStack).toHaveLength(undoCount);
  expect(session.history.redoStack).toHaveLength(0);
  expect(session.history.revision).toBe(revision + 2);
}

function executeSingleHistoryCommand(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: WorkbookCommand,
): ReturnType<typeof serializeWorkbook> {
  const before = serializeWorkbook(session.workbook),
    undo = structuredClone(session.history.undoStack),
    revision = session.history.revision;
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect(session.history.undoStack).toHaveLength(undo.length + 1);
  expect(session.history.undoStack.slice(0, -1)).toEqual(undo);
  expect(session.history.redoStack).toHaveLength(0);
  expect(session.history.revision).toBe(revision + 1);
  return before;
}

function shapeNode(drawings: readonly SheetDrawing[], id: string) {
  const node = drawings
    .flatMap<SheetDrawing | ShapeGroupChild>((root) =>
      isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node) : [root],
    )
    .find((node) => node.id === id);
  if (!node || node.kind !== "shape" || !("shapeFrame" in node || "groupFrame" in node))
    throw new Error(`Expected connector fixture ${id}`);
  return node;
}

function rootShape(drawings: readonly SheetDrawing[], id: string): SheetFramedGraphicDrawing {
  const node = drawings.find((node) => node.id === id);
  if (!node || !isFramedShapeDrawing(node) || node.kind !== "shape")
    throw new Error(`Expected framed fixture ${id}`);
  return node;
}

function protectAxisDeletion(sheet: ReturnType<typeof getActiveSheet>): void {
  sheet.properties.protected = true;
  sheet.protection = {
    deleteRows: true,
    deleteColumns: true,
    insertColumns: true,
    editableRanges: [
      {
        name: "Structural test range",
        range: {
          start: { row: 0, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        },
      },
    ],
  };
}

function expectTipPreserved(
  before: ReturnType<typeof resolveSheetShapeConnections>,
  after: ReturnType<typeof resolveSheetShapeConnections>,
  connectorId: string,
  endName: "begin" | "end",
): void {
  const original = before.getConnector(connectorId)![endName],
    next = after.getConnector(connectorId)![endName];
  expect(original.status).toBe("ready");
  expect(next.status).toBe("ready");
  if (original.status === "ready" && next.status === "ready") {
    expect(next.position.x).toBeCloseTo(original.position.x, 9);
    expect(next.position.y).toBeCloseTo(original.position.y, 9);
  }
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

  test.each(axes)("%s deletion captures the disappearing target tip at old metrics", (axis) => {
    const { session, sheet } = fixture(axis),
      originalLine = structuredClone(rootShape(sheet.drawings!, "connector")),
      original = resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet));
    const before = executeSingleHistoryCommand(
      session,
      createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
    );
    expect(sheet.drawings!.map((drawing) => drawing.id)).toEqual(["ellipse", "connector"]);
    const nextLine = rootShape(sheet.drawings!, "connector");
    expect(nextLine).toEqual({
      ...originalLine,
      shapeConnector: { ...originalLine.shapeConnector!, begin: nextLine.shapeConnector!.begin },
    });
    expect(nextLine.shapeConnector!.begin.kind).toBe("free");
    expect(nextLine.shapeConnector!.end).toEqual(originalLine.shapeConnector!.end);
    const after = resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet));
    expectTipPreserved(original, after, "connector", "begin");
    expectTipPreserved(original, after, "connector", "end");
    expectHistoryRoundTrip(session, before);
  });

  test.each(axes)("hidden %s deletion refuses unavailable capture before any write", (axis) => {
    const { session, sheet } = fixture(axis, 4, 6, true);
    expectAtomicRejection(
      session,
      createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
      /unavailable|collapsed/i,
    );
  });

  test("tail column insertion detaches a clipped target and preserves its old visible point", () => {
    const { session, sheet } = fixture("column", MAX_SHEET_COLUMNS - 1, MAX_SHEET_COLUMNS),
      original = resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)),
      originalLine = structuredClone(rootShape(sheet.drawings!, "connector"));
    const before = executeSingleHistoryCommand(
      session,
      createInsertSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1),
    );
    const nextLine = rootShape(sheet.drawings!, "connector");
    expect(nextLine.shapeConnector!.begin.kind).toBe("free");
    expect(nextLine.shapeConnector!.end).toEqual(originalLine.shapeConnector!.end);
    expect(nextLine.shapeFrame).toEqual(originalLine.shapeFrame);
    expectTipPreserved(
      original,
      resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)),
      "connector",
      "begin",
    );
    expectHistoryRoundTrip(session, before);
  });

  test("hidden tail insertion refuses unavailable capture before any write", () => {
    const { session, sheet } = fixture("column", MAX_SHEET_COLUMNS - 1, MAX_SHEET_COLUMNS, true);
    expectAtomicRejection(
      session,
      createInsertSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1),
      /unavailable|collapsed/i,
    );
  });

  for (const axis of axes) {
    test.each(["fixed", "move-only", "move-and-size"] as const)(
      `${axis} disappearance preserves a %s carrier's existing axis-transform semantics`,
      (mode) => {
        const { session, sheet } = fixture(axis),
          line = rootShape(sheet.drawings!, "connector");
        if (mode === "move-only") {
          line.shapeFrame.anchor = {
            mode,
            origin: { column: { index: 9, offset: 3 }, row: { index: 9, offset: 5 } },
            size: { width: 100, height: 60 },
          };
        } else if (mode === "move-and-size") spanning(line, axis, 2, 10);
        line.rotation = 90;
        line.shapeFlipX = true;
        line.shapeFlipY = true;
        sheet.drawings = normalizeSheetDrawings(sheet.drawings);
        const captured = materializeShapeConnectorTargets(
          sheet.drawings,
          ["rect"],
          createPictureSheetMetrics(sheet),
          { connectorIds: ["connector"] },
        );
        const before = executeSingleHistoryCommand(
          session,
          createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
        );
        const expectedLine = rootShape(captured, "connector");
        expectedLine.shapeFrame = transformShapeFrameAxis(
          expectedLine.shapeFrame,
          { axis, operation: "delete", index: 4, count: 2 },
          createPictureSheetMetrics(sheet),
        )!;
        expect(rootShape(sheet.drawings!, "connector")).toEqual(expectedLine);
        if (mode !== "fixed") expect(expectedLine.shapeFrame).not.toEqual(line.shapeFrame);
        expectHistoryRoundTrip(session, before);
      },
    );

    test(`${axis} disappearance detaches every surviving connector sharing a target`, () => {
      const { session, sheet } = fixture(axis);
      const both = connectorShape("both");
      both.shapeConnector!.end = { kind: "site", targetId: "rect", preset: "rect", siteIndex: 1 };
      const unrelated = connectorShape("unrelated", "ellipse");
      unrelated.shapeConnector!.begin = {
        kind: "site",
        targetId: "ellipse",
        preset: "ellipse",
        siteIndex: 0,
      };
      unrelated.hidden = true;
      sheet.drawings = normalizeSheetDrawings([
        ...sheet.drawings!,
        connectorShape("shared"),
        both,
        unrelated,
      ]);
      const original = resolveSheetShapeConnections(
          sheet.drawings,
          createPictureSheetMetrics(sheet),
        ),
        unchanged = structuredClone(shapeNode(sheet.drawings, "unrelated"));
      const before = executeSingleHistoryCommand(
        session,
        createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
      );
      const after = resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet));
      for (const id of ["connector", "shared", "both"]) {
        expect(shapeNode(sheet.drawings!, id).shapeConnector!.begin.kind).toBe("free");
        expectTipPreserved(original, after, id, "begin");
      }
      expect(shapeNode(sheet.drawings!, "both").shapeConnector!.end.kind).toBe("free");
      expectTipPreserved(original, after, "both", "end");
      expect(shapeNode(sheet.drawings!, "shared").shapeConnector!.end.kind).toBe("site");
      expect(shapeNode(sheet.drawings!, "unrelated")).toEqual(unchanged);
      expectHistoryRoundTrip(session, before);
    });

    test(`${axis} disappearance includes nested target descendants of a removed owner`, () => {
      const { session, sheet } = fixture(axis),
        targetFrame = structuredClone(rootShape(sheet.drawings!, "rect").shapeFrame);
      sheet.drawings = groupShapeRoots(
        [...sheet.drawings!, framedShape("sibling"), framedShape("outer-sibling")],
        ["rect", "sibling"],
        { id: "inner", name: "Inner target owner" },
        createPictureSheetMetrics(sheet),
      );
      sheet.drawings = groupShapeRoots(
        sheet.drawings,
        ["inner", "outer-sibling"],
        { id: "target-owner", name: "Removed target owner" },
        createPictureSheetMetrics(sheet),
      );
      const owner = sheet.drawings.find((root) => root.id === "target-owner")!;
      if (!isShapeGroupDrawing(owner)) throw new Error("Expected target owner");
      owner.shapeFrame = targetFrame;
      sheet.drawings = normalizeSheetDrawings(sheet.drawings);
      const original = resolveSheetShapeConnections(
        sheet.drawings,
        createPictureSheetMetrics(sheet),
      );
      const before = executeSingleHistoryCommand(
        session,
        createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
      );
      expect(sheet.drawings!.map((root) => root.id)).toEqual(["ellipse", "connector"]);
      expect(shapeNode(sheet.drawings!, "connector").shapeConnector!.begin.kind).toBe("free");
      expectTipPreserved(
        original,
        resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)),
        "connector",
        "begin",
      );
      expectHistoryRoundTrip(session, before);
    });

    test.each([false, true])(
      `${axis} owned detachment follows the old outer owner's lock (locked=%s)`,
      (locked) => {
        const { session, sheet } = fixture(axis);
        sheet.drawings = groupShapeRoots(
          [...sheet.drawings!, framedShape("companion", "rect", 110, 50)],
          ["connector", "companion"],
          { id: "owner", name: "Connector owner" },
          createPictureSheetMetrics(sheet),
        );
        const owner = sheet.drawings.find((root) => root.id === "owner")!;
        if (!isShapeGroupDrawing(owner)) throw new Error("Expected connector owner");
        owner.shapeProperties = locked ? undefined : { locked: false };
        // Opposite leaf permission must never substitute for the actual owner.
        shapeNode(sheet.drawings, "connector").shapeProperties = locked
          ? { locked: false }
          : undefined;
        sheet.drawings = normalizeSheetDrawings(sheet.drawings);
        protectAxisDeletion(sheet);
        const command = createDeleteSheetAxisCommand(sheet.id, axis, 4, 2);
        if (locked) {
          expectAtomicRejection(session, command, /protected/i);
          return;
        }
        const originalOwner = structuredClone(sheet.drawings.find((root) => root.id === "owner")!),
          original = resolveSheetShapeConnections(sheet.drawings, createPictureSheetMetrics(sheet)),
          before = executeSingleHistoryCommand(session, command);
        const next = shapeNode(sheet.drawings!, "connector").shapeConnector!;
        expect(next.begin.kind).toBe("free");
        expect(next.end.kind).toBe("site");
        shapeNode([originalOwner], "connector").shapeConnector = next;
        expect(sheet.drawings!.find((root) => root.id === "owner")).toEqual(originalOwner);
        expectTipPreserved(
          original,
          resolveSheetShapeConnections(sheet.drawings!, createPictureSheetMetrics(sheet)),
          "connector",
          "begin",
        );
        expectHistoryRoundTrip(session, before);
      },
    );

    test.each(["rect", "connector"])(
      `${axis} hidden ancestor refuses capture for an affected %s`,
      (id) => {
        const { session, sheet } = fixture(axis),
          targetFrame = structuredClone(rootShape(sheet.drawings!, "rect").shapeFrame);
        sheet.drawings = groupShapeRoots(
          [...sheet.drawings!, framedShape("visibility-companion")],
          [id, "visibility-companion"],
          { id: "hidden-owner", name: "Hidden capture owner" },
          createPictureSheetMetrics(sheet),
        );
        const owner = sheet.drawings.find((root) => root.id === "hidden-owner")!;
        if (!isShapeGroupDrawing(owner)) throw new Error("Expected visibility owner");
        if (id === "rect") owner.shapeFrame = targetFrame;
        owner.hidden = true;
        sheet.drawings = normalizeSheetDrawings(sheet.drawings);
        expectAtomicRejection(
          session,
          createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
          /unavailable.*hidden/i,
        );
      },
    );

    test(`${axis} detachment does not forbid unrelated locked anchored movement`, () => {
      const { session, sheet } = fixture(axis);
      rootShape(sheet.drawings!, "connector").shapeProperties = { locked: false };
      const locked = spanning(framedShape("locked-unrelated"), axis, 6, 10);
      sheet.drawings = normalizeSheetDrawings([...sheet.drawings!, locked]);
      protectAxisDeletion(sheet);
      const before = executeSingleHistoryCommand(
        session,
        createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
      );
      expect(rootShape(sheet.drawings!, "locked-unrelated").shapeFrame.anchor).toMatchObject({
        mode: "move-and-size",
        start: { [axis]: { index: 4 } },
        end: { [axis]: { index: 8 } },
      });
      expect(rootShape(sheet.drawings!, "connector").shapeConnector!.begin.kind).toBe("free");
      expectHistoryRoundTrip(session, before);
    });

    test.each(["target-hidden", "connector-hidden", "carrier-collapsed", "ratio-overflow"])(
      `${axis} unavailable or unrepresentable disappearance is atomic (%s)`,
      (reason) => {
        const { session, sheet } = fixture(axis),
          line = rootShape(sheet.drawings!, "connector");
        if (reason === "target-hidden") rootShape(sheet.drawings!, "rect").hidden = true;
        else if (reason === "connector-hidden") line.hidden = true;
        else if (reason === "carrier-collapsed") {
          spanning(line, axis, 8, 9);
        } else {
          line.shapeFrame.anchor = {
            mode: "fixed",
            x: -1_500_000,
            y: 50,
            size: { width: 1, height: 60 },
          };
        }
        sheet.drawings = normalizeSheetDrawings(sheet.drawings);
        expectAtomicRejection(
          session,
          createDeleteSheetAxisCommand(sheet.id, axis, 4, 2),
          /unavailable|collapsed|budget/i,
        );
      },
    );
  }

  test.each(axes.flatMap((axis) => [false, true].map((hidden) => [axis, hidden] as const)))(
    "deleting a %s target and its connector together skips capture (hidden=%s)",
    (axis, hidden) => {
      const { session, sheet } = fixture(axis, 4, 6, hidden);
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

  test.each([false, true])(
    "tail detachment respects a protected locked source and Edit objects (allowed=%s)",
    (allowed) => {
      const { session, sheet } = fixture("column", MAX_SHEET_COLUMNS - 1, MAX_SHEET_COLUMNS);
      protectAxisDeletion(sheet);
      if (allowed) sheet.protection!.editObjects = true;
      const command = createInsertSheetAxisCommand(sheet.id, "column", MAX_SHEET_COLUMNS - 1);
      if (!allowed) {
        expectAtomicRejection(session, command, /protected/i);
        return;
      }
      const before = executeSingleHistoryCommand(session, command);
      expect(rootShape(sheet.drawings!, "connector").shapeConnector!.begin.kind).toBe("free");
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
