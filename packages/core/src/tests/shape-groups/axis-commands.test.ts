import { describe, expect, test } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { createDeleteCellsCommand, createInsertCellsCommand } from "../../commands/cell-shift.js";
import {
  createResizeSheetDimensionCommand,
  createSetSheetDimensionHiddenCommand,
} from "../../commands/dimensions.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { type ShapeFrameAnchor } from "../../shape-frame.js";
import {
  isShapeGroupDrawing,
  normalizeShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedGraphicDrawing,
} from "../../shape-group.js";
import { resolveShapeGroup } from "../../shape-group-layout.js";
import { assertShapeObjectsForSheet, getShapeObjectOriginCell } from "../../shape-object-sheet.js";
import { serializeWorkbook } from "../../serialization.js";
import { mapDrawingSource, type SheetDrawing } from "../../sheet-drawings.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getActiveSheet,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";

function point(column: number, row: number, offsetX = 0, offsetY = 0) {
  return { column: { index: column, offset: offsetX }, row: { index: row, offset: offsetY } };
}
function leaf(id: string): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = framedShapeDrawing();
  return {
    ...appearance,
    id,
    rotation: 23,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.2, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.5 },
    },
    shapeProperties: { locked: false, printObject: false, altTitle: id },
  };
}
function group(anchor: ShapeFrameAnchor, id = "root"): ShapeGroupDrawing {
  return normalizeShapeGroup({
    kind: "shapeGroup",
    id,
    name: "Axis ownership fixture",
    shapeFrame: { kind: "shape-frame-v1", anchor },
    rotation: 37,
    shapeProperties: { lockAspectRatio: true, altDescription: "Keep owned descendants" },
    members: [
      leaf(`${id}-first`),
      {
        kind: "shapeGroup",
        id: `${id}-nested`,
        name: "Nested owner",
        rotation: 343,
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.4, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.8 },
        },
        shapeProperties: { locked: false, altTitle: "Nested owner" },
        members: [{ ...leaf(`${id}-text`), kind: "textBox" }],
      },
    ],
  });
}
function moving(id = "moving") {
  return group(
    { mode: "move-only", origin: point(3, 4, 7, 9), size: { width: 180, height: 90 } },
    id,
  );
}
function fixed(id = "fixed") {
  return group({ mode: "fixed", x: 317, y: 107, size: { width: 180, height: 90 } }, id);
}
function stretching(id = "stretching") {
  return group({ mode: "move-and-size", start: point(3, 4), end: point(5, 8) }, id);
}
function requireGroup(value: SheetDrawing | undefined): ShapeGroupDrawing {
  if (!value || !isShapeGroupDrawing(value)) throw new Error("Expected a root shape group.");
  return value;
}
function nested(value: ShapeGroupDrawing): ShapeGroupedGroup {
  const child = value.members[1];
  if (!child || child.kind !== "shapeGroup") throw new Error("Expected a nested owner.");
  return child;
}
function layout(sheet: Sheet, index = 0) {
  return resolveShapeGroup(requireGroup(sheet.drawings?.[index]), createPictureSheetMetrics(sheet));
}
function expectRejectedWithoutMutation(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: WorkbookCommand,
) {
  const before = serializeWorkbook(session.workbook),
    history = structuredClone(session.history);
  expect(() => executeWorkbookCommand(session, command)).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history).toEqual(history);
}
function expectHistoryRoundTrip(
  session: ReturnType<typeof createTestWorkbookSession>,
  before: ReturnType<typeof serializeWorkbook>,
) {
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}

const axes = ["row", "column"] as const;

describe("durable shape-group axis ownership", () => {
  test.each(axes)("%s insertion and deletion transform roots with exact history", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setRowHeight(sheet, 4, 39);
    setColumnWidth(sheet, 3, 123);
    setSheetDimensionHidden(sheet, axis, axis === "row" ? 6 : 4, true);
    sheet.drawings = [moving(), fixed(), stretching()];
    const original = structuredClone(sheet.drawings),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 2, 2)),
    ).toBe(true);
    expect(requireGroup(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
      mode: "move-only",
      origin: { [axis]: { index: axis === "row" ? 6 : 5, offset: axis === "row" ? 9 : 7 } },
      size: { width: 180, height: 90 },
    });
    expect(requireGroup(sheet.drawings?.[2]).shapeFrame.anchor).toMatchObject({
      mode: "move-and-size",
      start: { [axis]: { index: axis === "row" ? 6 : 5, offset: 0 } },
      end: { [axis]: { index: axis === "row" ? 10 : 7, offset: 0 } },
    });
    expect(sheet.drawings?.[1]).toEqual(original[1]);
    for (let index = 0; index < original.length; index++) {
      const current = requireGroup(sheet.drawings?.[index]),
        previous = requireGroup(original[index]);
      expect(current.members).toEqual(previous.members);
      expect(current.rotation).toBe(previous.rotation);
      expect(current.shapeProperties).toEqual(previous.shapeProperties);
    }
    expectHistoryRoundTrip(session, before);
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, 2, 2)),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test.each(axes)("deleting a moving %s origin retains every descendant", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      original = moving(),
      index = axis === "row" ? 4 : 3;
    sheet.drawings = [original];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index)),
    ).toBe(true);
    const current = requireGroup(sheet.drawings?.[0]);
    expect(current.shapeFrame.anchor).toMatchObject({
      mode: "move-only",
      origin: { [axis]: { index, offset: 0 } },
      size: { width: 180, height: 90 },
    });
    expect(current.members).toEqual(original.members);
    expect(layout(sheet).layout.rect).toMatchObject({ width: 180, height: 90 });
    expectHistoryRoundTrip(session, before);
  });

  test.each(axes)("erasing the whole logical %s span removes its complete tree", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [fixed("first"), stretching(), moving("last")];
    const before = serializeWorkbook(session.workbook),
      index = axis === "row" ? 4 : 3,
      count = axis === "row" ? 4 : 2;
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index, count)),
    ).toBe(true);
    expect(sheet.drawings?.map((drawing) => drawing.id)).toEqual(["first", "last"]);
    expectHistoryRoundTrip(session, before);
  });

  test.each(axes)("partial %s deletion shrinks only the root placement", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      original = stretching();
    sheet.drawings = [original];
    const before = serializeWorkbook(session.workbook),
      previousRect = layout(sheet).layout.rect,
      index = axis === "row" ? 5 : 3,
      dimension = axis === "row" ? "height" : "width";
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index)),
    ).toBe(true);
    expect(requireGroup(sheet.drawings?.[0]).members).toEqual(original.members);
    expect(layout(sheet).layout.rect[dimension]).toBe(
      previousRect[dimension] - (axis === "row" ? 24 : 96),
    );
    expectHistoryRoundTrip(session, before);
  });

  test.each(axes)("hiding every %s in a stretch collapses without deleting ownership", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      original = stretching(),
      indexes = axis === "row" ? [4, 5, 6, 7] : [3, 4];
    sheet.drawings = [original];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionHiddenCommand(sheet.id, axis, indexes, true),
      ),
    ).toBe(true);
    expect(sheet.drawings).toEqual([original]);
    const resolved = layout(sheet);
    expect(resolved.layout.collapsed).toBe(true);
    expect(resolved.visible).toBe(false);
    expect(resolved.members[0]).toMatchObject({ visible: false, layout: null });
    expect(resolved.members[1]).toMatchObject({
      visible: false,
      layout: null,
      members: [{ visible: false, layout: null }],
    });
    expectHistoryRoundTrip(session, before);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionHiddenCommand(sheet.id, axis, indexes, false),
      ),
    ).toBe(true);
    expect(layout(sheet).visible).toBe(true);
    expect(sheet.drawings).toEqual([original]);
  });

  test.each(axes)(
    "dimension resizing reprojects nested %s geometry without local rewrites",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook),
        original = stretching();
      sheet.drawings = [original];
      const before = serializeWorkbook(session.workbook),
        oldLayout = layout(sheet),
        dimension = axis === "row" ? "height" : "width";
      expect(
        executeWorkbookCommand(
          session,
          createResizeSheetDimensionCommand(sheet.id, axis, axis === "row" ? 4 : 3, 120),
        ),
      ).toBe(true);
      const resolved = layout(sheet);
      expect(resolved.layout.rect[dimension]).not.toBe(oldLayout.layout.rect[dimension]);
      expect(resolved.members[1]!.layout!.rect[dimension]).not.toBe(
        oldLayout.members[1]!.layout!.rect[dimension],
      );
      expect(sheet.drawings).toEqual([original]);
      expectHistoryRoundTrip(session, before);
    },
  );
});

describe("durable shape-group unsupported partial geometry is atomic", () => {
  test.each(["move-only", "move-and-size"] as const)(
    "%s root groups reject every partial-shift direction and whole-axis reorder",
    (mode) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [mode === "move-only" ? moving() : stretching()];
      setCellValue(sheet, { row: 0, column: 0 }, "keep");
      const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
      for (const command of [
        createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
        createMoveSheetAxisCommand(sheet.id, "column", 0, 1, 2),
        createInsertCellsCommand(sheet.id, range, "right"),
        createInsertCellsCommand(sheet.id, range, "down"),
        createDeleteCellsCommand(sheet.id, range, "left"),
        createDeleteCellsCommand(sheet.id, range, "up"),
      ])
        expectRejectedWithoutMutation(session, command);
    },
  );

  test("fixed groups survive every partial shift and both reorders with exact history", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      original = fixed();
    sheet.drawings = [original];
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    for (const command of [
      createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
      createMoveSheetAxisCommand(sheet.id, "column", 0, 1, 2),
      createInsertCellsCommand(sheet.id, range, "right"),
      createInsertCellsCommand(sheet.id, range, "down"),
      createDeleteCellsCommand(sheet.id, range, "left"),
      createDeleteCellsCommand(sheet.id, range, "up"),
    ]) {
      setCellValue(sheet, { row: 0, column: 0 }, "move");
      const before = serializeWorkbook(session.workbook);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([original]);
      expectHistoryRoundTrip(session, before);
    }
  });

  test("source mapping has no group range and leaves root and owned descendants untouched", () => {
    const original = fixed();
    expect(
      mapDrawingSource(original, () => {
        throw new Error("Shape groups have no external cell source to remap.");
      }),
    ).toBe(original);
  });
});

describe("shape-group worksheet geometry preflight and navigation", () => {
  test("dimension preflight resolves a nested leaf instead of accepting only the root", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      value = group({ mode: "move-and-size", start: point(0, 0), end: point(1, 1) });
    value.rotation = 0;
    const owner = nested(value);
    owner.rotation = 0;
    owner.groupFrame.rect = { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 };
    const descendant = owner.members[0]!;
    descendant.rotation = 0;
    // Valid at the initial column size; resizing still fits the root but exceeds
    // the shape-owned descendant's 16,384px span budget.
    descendant.groupFrame.rect = { xRatio: 0, yRatio: 0, widthRatio: 100, heightRatio: 1 };
    sheet.drawings = [value];
    expect(() => assertShapeObjectsForSheet(sheet.drawings, sheet)).not.toThrow();
    expectRejectedWithoutMutation(
      session,
      createResizeSheetDimensionCommand(sheet.id, "column", 0, 640),
    );
  });

  test("collapsed owners still validate canonical data of every descendant", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      value = stretching();
    for (const column of [3, 4]) setSheetDimensionHidden(sheet, "column", column, true);
    nested(value).members[0]!.groupFrame.rect.widthRatio = Number.NaN;
    expect(() => assertShapeObjectsForSheet([value], sheet)).toThrow();
  });

  test("navigation projects the root origin without using a descendant or rotation bounds", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      value = moving();
    value.members[0]!.groupFrame.rect.xRatio = -20;
    value.members[0]!.groupFrame.rect.yRatio = -20;
    expect(getShapeObjectOriginCell(value, sheet)).toEqual({ row: 4, column: 3 });
    expect(getShapeObjectOriginCell(stretching(), sheet)).toEqual({ row: 4, column: 3 });
    expect(getShapeObjectOriginCell(fixed(), sheet)).toEqual({ row: 4, column: 3 });
    setSheetDimensionHidden(sheet, "row", 0, true);
    setSheetDimensionHidden(sheet, "column", 0, true);
    expect(getShapeObjectOriginCell(fixed(), sheet)).toEqual({ row: 5, column: 4 });
  });

  test("terminal root markers clamp navigation to the final visible sheet address", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      value = group({
        mode: "move-only",
        origin: point(MAX_SHEET_COLUMNS, MAX_SHEET_ROWS),
        size: { width: 12, height: 10 },
      });
    expect(getShapeObjectOriginCell(value, sheet)).toEqual({
      row: MAX_SHEET_ROWS - 1,
      column: MAX_SHEET_COLUMNS - 1,
    });
  });
});
