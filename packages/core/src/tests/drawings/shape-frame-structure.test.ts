import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { createDeleteCellsCommand, createInsertCellsCommand } from "../../commands/cell-shift.js";
import {
  createResetSheetDimensionSizesCommand,
  createResizeSheetDimensionCommand,
  createResizeSheetDimensionsCommand,
  createSetSheetDefaultColumnWidthCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetDimensionSizesCommand,
} from "../../commands/dimensions.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolveShapeFrame, type ShapeFrameAnchor } from "../../shape-frame.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetSparseState,
  getActiveSheet,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";

function point(column: number, row: number, offsetX = 0, offsetY = 0) {
  return { column: { index: column, offset: offsetX }, row: { index: row, offset: offsetY } };
}
function framed(anchor: ShapeFrameAnchor, id = "framed"): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...body
  } = legacyShapeDrawing();
  return { ...body, kind: "shape", id, shapeFrame: { kind: "shape-frame-v1", anchor } };
}
function moving(id = "moving") {
  return framed(
    { mode: "move-only", origin: point(3, 4, 7, 9), size: { width: 180, height: 90 } },
    id,
  );
}
function fixed(id = "fixed") {
  return framed({ mode: "fixed", x: 317, y: 107, size: { width: 180, height: 90 } }, id);
}
function stretching(id = "stretching") {
  return framed({ mode: "move-and-size", start: point(3, 4), end: point(5, 8) }, id);
}
function requireFrame(drawing: SheetDrawing | undefined): SheetFramedGraphicDrawing {
  if (!drawing || !isFramedShapeDrawing(drawing)) throw new Error("Expected a framed shape.");
  return drawing;
}
function rect(sheet: Sheet, index = 0) {
  const drawing = requireFrame(sheet.drawings?.[index]);
  return resolveShapeFrame(drawing.shapeFrame, createPictureSheetMetrics(sheet), drawing.rotation)
    .rect;
}
function expectRejectedWithoutMutation(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: WorkbookCommand,
) {
  const before = serializeWorkbook(session.workbook);
  const history = structuredClone(session.history);
  expect(() => executeWorkbookCommand(session, command)).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history).toEqual(history);
}

const axes = ["row", "column"] as const;

describe("canonical shape-frame structure and dimension commands", () => {
  test.each(axes)("%s insert/delete use logical frames and exact snapshot history", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setRowHeight(sheet, 4, 39);
    setColumnWidth(sheet, 3, 123);
    setSheetDimensionHidden(sheet, axis, axis === "row" ? 6 : 4, true);
    sheet.drawings = [moving(), fixed(), stretching(), { ...legacyShapeDrawing(), id: "legacy" }];
    const before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 2, 2)),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(requireFrame(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
      origin: { [axis]: { index: axis === "row" ? 6 : 5, offset: axis === "row" ? 9 : 7 } },
      size: { width: 180, height: 90 },
    });
    expect(sheet.drawings?.[1]).toEqual(fixed());
    expect(getActiveSheet(deserializeWorkbook(after)).drawings).toEqual(sheet.drawings);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, 2, 2)),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test.each(axes)(
    "deleting a moving %s origin preserves size and resets only the erased inset",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [
        moving(),
        fixed(),
        { ...legacyShapeDrawing(), id: "legacy", anchor: { row: 4, column: 3 } },
      ];
      const before = serializeWorkbook(session.workbook),
        index = axis === "row" ? 4 : 3;
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index)),
      ).toBe(true);
      expect(sheet.drawings?.map((drawing) => drawing.id)).toEqual(["moving", "fixed"]);
      expect(requireFrame(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
        mode: "move-only",
        origin: { [axis]: { index, offset: 0 } },
        size: { width: 180, height: 90 },
      });
      expect(rect(sheet).width).toBe(180);
      expect(rect(sheet).height).toBe(90);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  test.each(axes)(
    "a fully erased logical %s span removes only that shape and restores order",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [fixed("first"), stretching(), moving("last")];
      const before = serializeWorkbook(session.workbook);
      const index = axis === "row" ? 4 : 3,
        count = axis === "row" ? 4 : 2;
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index, count)),
      ).toBe(true);
      expect(sheet.drawings?.map((drawing) => drawing.id)).toEqual(["first", "last"]);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  test.each(axes)("partial %s deletion shrinks a stretch without deleting its object", (axis) => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [stretching()];
    const before = serializeWorkbook(session.workbook),
      previousRect = rect(sheet);
    const index = axis === "row" ? 5 : 3;
    expect(
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, index)),
    ).toBe(true);
    expect(sheet.drawings).toHaveLength(1);
    expect(rect(sheet)[axis === "row" ? "height" : "width"]).toBe(
      previousRect[axis === "row" ? "height" : "width"] - (axis === "row" ? 24 : 96),
    );
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test.each(axes)(
    "hidden %s collapse retains endpoints and unhide restores the original span",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [stretching()];
      const before = serializeWorkbook(session.workbook),
        shape = structuredClone(sheet.drawings[0]);
      const indexes = axis === "row" ? [4, 5, 6, 7] : [3, 4];
      expect(
        executeWorkbookCommand(
          session,
          createSetSheetDimensionHiddenCommand(sheet.id, axis, indexes, true),
        ),
      ).toBe(true);
      expect(sheet.drawings).toEqual([shape]);
      expect(rect(sheet)[axis === "row" ? "height" : "width"]).toBe(0);
      const hidden = serializeWorkbook(session.workbook);
      expect(serializeWorkbook(deserializeWorkbook(hidden))).toEqual(hidden);
      expect(
        executeWorkbookCommand(
          session,
          createSetSheetDimensionHiddenCommand(sheet.id, axis, indexes, false),
        ),
      ).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(hidden);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
    },
  );

  test.each(axes)(
    "terminal %s tails use post-edit metrics and undo restores captured hidden dimensions",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
      const start = point(1, 1),
        end = point(2, 2);
      start[axis] = { index: maximum - 2, offset: 5 };
      end[axis] = { index: maximum, offset: 30 };
      if (axis === "row") {
        setRowHeight(sheet, maximum - 2, 300);
        setRowHeight(sheet, maximum - 1, 40);
      } else {
        setColumnWidth(sheet, maximum - 2, 300);
        setColumnWidth(sheet, maximum - 1, 40);
      }
      setSheetDimensionHidden(sheet, axis, maximum - 1, true);
      sheet.drawings = [framed({ mode: "move-and-size", start, end })];
      const before = serializeWorkbook(session.workbook);
      expect(
        executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, axis, maximum - 1)),
      ).toBe(true);
      const after = serializeWorkbook(session.workbook);
      expect(rect(sheet)[axis === "row" ? "height" : "width"]).toBe(325);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  test.each(axes)(
    "inserting through the terminal %s origin retains a moving frame and exact inverse",
    (axis) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS,
        origin = point(2, 3);
      origin[axis] = { index: maximum - 1, offset: 8 };
      sheet.drawings = [framed({ mode: "move-only", origin, size: { width: 12, height: 10 } })];
      const before = serializeWorkbook(session.workbook);
      expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, axis, 0))).toBe(
        true,
      );
      expect(requireFrame(sheet.drawings?.[0]).shapeFrame.anchor).toMatchObject({
        mode: "move-only",
        origin: { [axis]: { index: maximum, offset: 0 } },
      });
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  const dimensionChanges: [string, (id: string) => WorkbookCommand][] = [
    ["single resize", (id) => createResizeSheetDimensionCommand(id, "row", 4, 32)],
    ["multiple resize", (id) => createResizeSheetDimensionsCommand(id, "column", [3, 4], 110)],
    [
      "individual sizes",
      (id) =>
        createSetSheetDimensionSizesCommand(id, "row", [
          { index: 4, size: 32 },
          { index: 5, size: 35 },
        ]),
    ],
    ["reset sizes", (id) => createResetSheetDimensionSizesCommand(id, "column", [3])],
    ["default width", (id) => createSetSheetDefaultColumnWidthCommand(id, 108)],
  ];
  test.each(dimensionChanges)(
    "%s changes derived extents in one history entry without storing a size cache",
    (_name, command) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      setRowHeight(sheet, 4, 40);
      setColumnWidth(sheet, 3, 120);
      sheet.drawings = [stretching(), moving(), fixed()];
      const before = serializeWorkbook(session.workbook),
        drawings = structuredClone(sheet.drawings),
        oldRect = rect(sheet);
      expect(executeWorkbookCommand(session, command(sheet.id))).toBe(true);
      expect(rect(sheet)).not.toEqual(oldRect);
      expect(sheet.drawings).toEqual(drawings);
      expect(requireFrame(sheet.drawings?.[0])).not.toHaveProperty("width");
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );

  const unsafeDimensions: [string, (id: string) => WorkbookCommand][] = [
    ["single resize", (id) => createResizeSheetDimensionCommand(id, "column", 1, 97)],
    ["multiple resize", (id) => createResizeSheetDimensionsCommand(id, "column", [1, 2], 97)],
    [
      "individual sizes",
      (id) => createSetSheetDimensionSizesCommand(id, "column", [{ index: 1, size: 97 }]),
    ],
    ["reset sizes", (id) => createResetSheetDimensionSizesCommand(id, "column", [0])],
    ["default width", (id) => createSetSheetDefaultColumnWidthCommand(id, 97)],
    ["whole-axis insert", (id) => createInsertSheetAxisCommand(id, "column", 1)],
  ];
  test.each(unsafeDimensions)(
    "%s rejects an extent over 16384 before mutation or history",
    (_name, command) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      setColumnWidth(sheet, 0, 95);
      setCellValue(sheet, { row: 2, column: 2 }, "keep");
      sheet.drawings = [
        framed({ mode: "move-and-size", start: point(0, 0), end: point(170, 1, 65) }),
      ];
      expect(rect(sheet).width).toBe(16384);
      expectRejectedWithoutMutation(session, command(sheet.id));
    },
  );

  test("unhiding a logical span over the budget fails without losing hidden endpoints", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setSheetDimensionHidden(sheet, "column", 0, true);
    sheet.drawings = [framed({ mode: "move-and-size", start: point(0, 0), end: point(171, 1) })];
    expect(rect(sheet).width).toBe(16320);
    expectRejectedWithoutMutation(
      session,
      createSetSheetDimensionHiddenCommand(sheet.id, "column", [0], false),
    );
  });

  test("inverse validation rejects restored dimensions that would make an original frame oversized", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [
      framed({ mode: "move-and-size", start: point(0, 0), end: point(170, 1, 64) }),
    ];
    const inverse = applyWorkbookCommand(
      session.workbook,
      createDeleteSheetAxisCommand(sheet.id, "column", 1),
    );
    if (!inverse || inverse.type !== "restoreSheetState" || !("slice" in inverse))
      throw new Error("Expected axis inverse.");
    inverse.slice.dimensions.push({ index: 1, size: 640 });
    expectRejectedWithoutMutation(session, inverse);
  });

  test("a forged original frame is rejected by structural inverse association before mutation", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [moving()];
    const inverse = applyWorkbookCommand(
      session.workbook,
      createInsertSheetAxisCommand(sheet.id, "row", 2),
    );
    if (!inverse || inverse.type !== "restoreSheetState" || !("slice" in inverse))
      throw new Error("Expected axis inverse.");
    const drawing = requireFrame(inverse.slice.metadata.drawings?.[0]);
    if (drawing.shapeFrame.anchor.mode !== "move-only") throw new Error("Expected moving anchor.");
    drawing.shapeFrame.anchor.origin.row.offset = 10;
    expectRejectedWithoutMutation(session, inverse);
  });

  test.each(["move-only", "move-and-size"] as const)(
    "unsupported %s reorder and partial shifts reject atomically",
    (mode) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [mode === "move-only" ? moving() : stretching()];
      setCellValue(sheet, { row: 0, column: 0 }, "keep");
      const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
      for (const command of [
        createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
        createMoveSheetAxisCommand(sheet.id, "column", 0, 1, 2),
        createInsertCellsCommand(sheet.id, range, "down"),
        createDeleteCellsCommand(sheet.id, range, "up"),
      ])
        expectRejectedWithoutMutation(session, command);
    },
  );

  test("fixed frames survive axis reorder and partial insertion/deletion with exact history", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [fixed()];
    setCellValue(sheet, { row: 0, column: 0 }, "move");
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    for (const command of [
      createMoveSheetAxisCommand(sheet.id, "row", 0, 1, 2),
      createInsertCellsCommand(sheet.id, range, "right"),
      createDeleteCellsCommand(sheet.id, range, "left"),
    ]) {
      // Ensure each shift changes cells as well as exercising the frame branch.
      setCellValue(sheet, { row: 0, column: 0 }, "move");
      const before = createSheetSparseState(sheet);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(sheet.drawings).toEqual([fixed()]);
      const after = serializeWorkbook(session.workbook);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(createSheetSparseState(sheet)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });
});
