import { expect, test } from "vitest";
import { normalizeShapeFrameAnchor, resolveShapeAnchorRect } from "../../shape-frame.js";
import { normalizePictureFrame, normalizePictureFrameAnchor } from "../../picture-frame.js";
import {
  canReuseFixedDrawingExportEncoding,
  normalizeFixedDrawingExportEncoding,
} from "../../drawing-export-encoding.js";
import { createWorkbook, getActiveSheet, setColumnWidth } from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { clonePictureRootsForClipboard } from "../../picture-group-copy.js";

const rect = { x: 32, y: 120, width: 300, height: 100 };
const hint = () => ({
  kind: "two-cell-absolute-v1" as const,
  start: { column: { index: 0, offset: 32 }, row: { index: 5, offset: 0 } },
  end: { column: { index: 3, offset: 44 }, row: { index: 9, offset: 4 } },
  referenceRect: { ...rect },
});
const anchor = () => ({
  mode: "fixed" as const,
  x: 32,
  y: 120,
  size: { width: 300, height: 100 },
  exportEncoding: hint(),
});
function setup() {
  const book = createWorkbook({ id: "w", sheetId: "s" });
  const sheet = getActiveSheet(book);
  sheet.defaultColumnWidth = 96;
  sheet.defaultRowHeight = 24;
  return { book, sheet };
}
const frame = () => ({
  kind: "object-frame-v1" as const,
  anchor: anchor(),
  source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  angleDeg: 0,
});
test("encoding is deeply detached, never affects fixed layout, and grid reuse is guarded", () => {
  const { sheet } = setup();
  const original = anchor();
  const normalized = normalizeShapeFrameAnchor(original);
  expect(normalized).toEqual(original);
  expect(normalized).not.toBe(original);
  if (normalized.mode !== "fixed") throw Error();
  expect(normalized.exportEncoding!.start).not.toBe(original.exportEncoding.start);
  expect(resolveShapeAnchorRect(normalized, createPictureSheetMetrics(sheet))).toEqual(rect);
  expect(
    canReuseFixedDrawingExportEncoding(
      normalized.exportEncoding,
      rect,
      createPictureSheetMetrics(sheet),
    ),
  ).toBe(true);
  setColumnWidth(sheet, 0, 120);
  expect(resolveShapeAnchorRect(normalized, createPictureSheetMetrics(sheet))).toEqual(rect);
  expect(
    canReuseFixedDrawingExportEncoding(
      normalized.exportEncoding,
      rect,
      createPictureSheetMetrics(sheet),
    ),
  ).toBe(false);
  sheet.columnWidths.clear();
  sheet.hiddenRows = new Set([5]);
  expect(
    canReuseFixedDrawingExportEncoding(
      normalized.exportEncoding,
      rect,
      createPictureSheetMetrics(sheet),
    ),
  ).toBe(false);
});
test("moves and resizes strip stale hints; one EMU is a change", () => {
  for (const normalize of [normalizeShapeFrameAnchor, normalizePictureFrameAnchor]) {
    expect(normalize({ ...anchor(), x: 32 + 1 / 9525 })).not.toHaveProperty("exportEncoding");
    expect(normalize({ ...anchor(), size: { width: 301, height: 100 } })).not.toHaveProperty(
      "exportEncoding",
    );
  }
  expect(normalizePictureFrame({ ...frame(), angleDeg: 1 }).anchor).not.toHaveProperty(
    "exportEncoding",
  );
  expect(
    normalizePictureFrame({ ...frame(), source: { ...frame().source, widthRatio: 0.5 } }).anchor,
  ).not.toHaveProperty("exportEncoding");
});
test("malformed encoding fails closed, including hidden getters and nonintegral EMUs", () => {
  const bad: unknown[] = [
    undefined,
    null,
    { ...hint(), extra: 1 },
    { ...hint(), kind: "other" },
    { ...hint(), referenceRect: { ...rect, width: 0 } },
    { ...hint(), referenceRect: { ...rect, x: NaN } },
    { ...hint(), referenceRect: { ...rect, x: Infinity } },
    { ...hint(), referenceRect: { ...rect, x: 1 / 19050 } },
    { ...hint(), end: hint().start },
    { ...hint(), start: { ...hint().start, column: { index: -1, offset: 0 } } },
    { ...hint(), start: { ...hint().start, column: { index: 16384, offset: 0 } } },
  ];
  for (const axis of ["column", "row"] as const) {
    const terminal = hint();
    terminal.end[axis].index = axis === "column" ? 16384 : 1048576;
    terminal.start[axis].index = terminal.end[axis].index - 1;
    bad.push(terminal);
  }
  const getter = { ...hint() };
  Object.defineProperty(getter, "start", {
    get() {
      throw Error("must not invoke");
    },
  });
  bad.push(getter);
  const cyclic = hint();
  cyclic.referenceRect = cyclic as never;
  bad.push(cyclic);
  for (const value of bad) expect(() => normalizeFixedDrawingExportEncoding(value)).toThrow();
  const valid = hint();
  valid.start.column.offset = 32 + 1 / 9525;
  expect(normalizeFixedDrawingExportEncoding(valid)).toEqual(valid);
});
test("V89 survives JSON; old payloads cannot hide the feature; clipboard copies drop it", () => {
  const { book, sheet } = setup();
  const oldVersion = serializeWorkbook(book).version;
  sheet.floatingImages.push({ id: "pic", assetId: "a", altText: "", frame: frame() });
  const snapshot = serializeWorkbook(book);
  expect(snapshot.version).toBe(89);
  const restored = deserializeWorkbook(JSON.parse(JSON.stringify(snapshot)));
  expect(serializeWorkbook(restored)).toEqual(snapshot);
  for (const version of [43, 86, 87, 88])
    expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow();
  const copy = clonePictureRootsForClipboard(sheet.floatingImages, { createId: () => "new" });
  expect(copy[0]).not.toHaveProperty("frame.anchor.exportEncoding");
  expect(sheet.floatingImages[0]).toHaveProperty("frame.anchor.exportEncoding");
  sheet.floatingImages = [];
  expect(serializeWorkbook(book).version).toBe(oldVersion);
});

test("history restores the source hint on Undo and clears it again on Redo", async () => {
  const { createTestWorkbookSession } = await import("../helpers.js");
  const { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } =
    await import("../../history.js");
  const { createSetFloatingImageCommand } = await import("../../commands/images.js");
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.defaultColumnWidth = 96;
  sheet.defaultRowHeight = 24;
  const image = { id: "pic", assetId: "a", altText: "", frame: frame() };
  sheet.floatingImages = [image];
  const moved = { ...image, frame: { ...image.frame, anchor: { ...image.frame.anchor, x: 33 } } };
  executeWorkbookCommand(session, createSetFloatingImageCommand(sheet.id, moved));
  expect(sheet.floatingImages[0]).not.toHaveProperty("frame.anchor.exportEncoding");
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(sheet.floatingImages[0]).toHaveProperty("frame.anchor.exportEncoding");
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(sheet.floatingImages[0]).not.toHaveProperty("frame.anchor.exportEncoding");
});
test("new hints cannot enter relative modes or old snapshots through raw undefined/getter fields", () => {
  for (const normalize of [normalizeShapeFrameAnchor, normalizePictureFrameAnchor])
    expect(() =>
      normalize({
        mode: "move-only",
        origin: hint().start,
        size: anchor().size,
        exportEncoding: hint(),
      } as never),
    ).toThrow();
  const { book, sheet } = setup();
  sheet.floatingImages = [{ id: "pic", assetId: "a", altText: "", frame: frame() }];
  const snapshot = serializeWorkbook(book);
  for (const value of [
    undefined,
    {
      get kind() {
        throw Error("getter executed");
      },
    },
  ]) {
    const copy = JSON.parse(JSON.stringify(snapshot));
    copy.version = 88;
    copy.sheets[0].floatingImages[0].frame.anchor.exportEncoding = value;
    expect(() => deserializeWorkbook(copy)).toThrow(/version 89/);
  }
  const copy = JSON.parse(JSON.stringify(snapshot));
  copy.version = 88;
  let called = false;
  Object.defineProperty(copy.sheets[0].floatingImages[0].frame.anchor, "exportEncoding", {
    get() {
      called = true;
      throw Error();
    },
  });
  expect(() => deserializeWorkbook(copy)).toThrow(/version 89/);
  expect(called).toBe(false);
});

test.each(["insert", "delete", "reorder"] as const)(
  "%s with nonuniform rows invalidates export reuse while keeping fixed geometry",
  async (operation) => {
    const { createTestWorkbookSession } = await import("../helpers.js");
    const { executeWorkbookCommand, undoWorkbookCommand } = await import("../../history.js");
    const {
      createInsertSheetAxisCommand,
      createDeleteSheetAxisCommand,
      createMoveSheetAxisCommand,
    } = await import("../../commands/index.js");
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.defaultColumnWidth = 96;
    sheet.defaultRowHeight = 24;
    sheet.floatingImages = [{ id: "pic", assetId: "a", altText: "", frame: frame() }];
    if (operation === "insert") {
      sheet.rowHeights.set(3, 16);
      sheet.rowHeights.set(4, 32);
    } else sheet.rowHeights.set(10, 48);
    expect(canReuseFixedDrawingExportEncoding(hint(), rect, createPictureSheetMetrics(sheet))).toBe(
      true,
    );
    const command =
      operation === "insert"
        ? createInsertSheetAxisCommand(sheet.id, "row", 4, 1)
        : operation === "delete"
          ? createDeleteSheetAxisCommand(sheet.id, "row", 0, 2)
          : createMoveSheetAxisCommand(sheet.id, "row", 10, 1, 4);
    executeWorkbookCommand(session, command);
    const image = sheet.floatingImages[0]!;
    if (!("frame" in image) || image.frame.anchor.mode !== "fixed") throw Error();
    expect({
      x: image.frame.anchor.x,
      y: image.frame.anchor.y,
      ...image.frame.anchor.size,
    }).toEqual(rect);
    expect(
      canReuseFixedDrawingExportEncoding(
        image.frame.anchor.exportEncoding,
        rect,
        createPictureSheetMetrics(sheet),
      ),
    ).toBe(false);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(canReuseFixedDrawingExportEncoding(hint(), rect, createPictureSheetMetrics(sheet))).toBe(
      true,
    );
  },
);
