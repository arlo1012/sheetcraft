import { describe, expect, test } from "vitest";
import { createSheet, setRowHeight, setSheetDimensionHidden } from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { transformPictureFrameAxis } from "../../picture-frame-axis-edit.js";
import { resolvePictureFrame, type PictureFrame } from "../../picture-frame.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "../../sheet-limits.js";
function frame(): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: {
      mode: "move-and-size",
      start: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
      end: { column: { index: 6, offset: 2 }, row: { index: 14, offset: 2 } },
    },
    source: { widthRatio: 1.2, heightRatio: 1, offsetXRatio: 0.5, offsetYRatio: 0.25 },
    angleDeg: 37,
  };
}
const metrics = () => createPictureSheetMetrics(createSheet("Synthetic", "s"));
describe("prepared picture structural planner", () => {
  test("rejects finite fields whose changed source extent would overflow", () => {
    const original = frame(),
      m = metrics();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    original.anchor.start.column = { index: 0, offset: 0 };
    original.anchor.end.column = { index: 2, offset: 0 };
    original.source = { widthRatio: 5e305, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
    original.angleDeg = 0;
    const before = structuredClone(original);
    expect(resolvePictureFrame(original, m).sourceRect).not.toBeNull();
    expect(() =>
      transformPictureFrameAxis(
        original,
        { axis: "column", operation: "insert", index: 1, count: 5 },
        m,
      ),
    ).toThrow();
    expect(original).toEqual(before);
  });
  test.each(["row", "column"] as const)(
    "%s partial deletion retains a stretch and clamps only the removed inset",
    (axis) => {
      const original = frame(),
        before = structuredClone(original),
        m = metrics();
      const index = axis === "row" ? 4 : 2;
      const next = transformPictureFrameAxis(
        original,
        { axis, operation: "delete", index, count: 1 },
        m,
      )!;
      expect(next.anchor.mode).toBe("move-and-size");
      if (next.anchor.mode !== "move-and-size") throw Error("Wrong mode");
      expect(next.anchor.start[axis]).toEqual({ index, offset: 0 });
      expect(next.anchor.end[axis]).toEqual({ index: axis === "row" ? 13 : 5, offset: 2 });
      expect(next.source).toEqual(before.source);
      expect(next.angleDeg).toBe(37);
      expect(original).toEqual(before);
    },
  );
  test.each(["row", "column"] as const)(
    "%s complete deletion removes only logical move-size content",
    (axis) => {
      const original = frame(),
        index = axis === "row" ? 4 : 2;
      expect(
        transformPictureFrameAxis(
          original,
          { axis, operation: "delete", index, count: 12 },
          metrics(),
        ),
      ).toBeNull();
      original.anchor = {
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
        size: { width: 360, height: 240 },
      };
      const retained = transformPictureFrameAxis(
        original,
        { axis, operation: "delete", index, count: 12 },
        metrics(),
      )!;
      expect(retained.anchor.mode).toBe("move-only");
      if (retained.anchor.mode !== "move-only") throw Error("Wrong mode");
      expect(retained.anchor.origin[axis]).toEqual({ index, offset: 0 });
      expect(retained.anchor.size).toEqual({ width: 360, height: 240 });
    },
  );
  test("insertion before, inside, and exactly at the end use distinct endpoint affinity", () => {
    const original = frame(),
      m = metrics();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    original.anchor.end.row.offset = 0;
    const height = resolvePictureFrame(original, m).rect.height;
    const before = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 4, count: 1 },
      m,
    )!;
    expect(resolvePictureFrame(before, m).rect).toEqual({
      ...resolvePictureFrame(original, m).rect,
      y: 122,
    });
    const inside = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 9, count: 1 },
      m,
    )!;
    expect(resolvePictureFrame(inside, m).rect.height).toBe(height + 24);
    const end = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 14, count: 1 },
      m,
    )!;
    expect(end).toEqual(original);
  });
  test.each(["insert", "delete"] as const)("fixed positions do not follow %s", (operation) => {
    const original = frame();
    original.anchor = { mode: "fixed", x: 194, y: 98, size: { width: 360, height: 240 } };
    const next = transformPictureFrameAxis(
      original,
      { axis: "row", operation, index: 4, count: 2 },
      metrics(),
    )!;
    expect(next).toEqual(original);
    expect(next).not.toBe(original);
  });
  test("surviving raw endpoint insets are not clamped by current visible cell size", () => {
    const original = frame();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    original.anchor.start.row.offset = 400;
    const next = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 0, count: 1 },
      metrics(),
    )!;
    if (next.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    expect(next.anchor.start.row).toEqual({ index: 5, offset: 400 });
  });
  test.each(["row", "column"] as const)(
    "%s MAX truncation retains move-only at the terminal rail",
    (axis) => {
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
      const original = frame();
      original.anchor = {
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
        size: { width: 360, height: 240 },
      };
      original.anchor.origin[axis] = { index: maximum - 1, offset: 2 };
      const retained = transformPictureFrameAxis(
        original,
        { axis, operation: "insert", index: 0, count: 1 },
        metrics(),
      )!;
      if (retained.anchor.mode !== "move-only") throw Error("Wrong mode");
      expect(retained.anchor.origin[axis]).toEqual({ index: maximum, offset: 0 });
    },
  );
  test("a fully truncated stretch is removed, but a virtual terminal tail survives", () => {
    const original = frame();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    original.anchor.start.row = { index: MAX_SHEET_ROWS - 1, offset: 2 };
    original.anchor.end.row = { index: MAX_SHEET_ROWS, offset: 0 };
    expect(
      transformPictureFrameAxis(
        original,
        { axis: "row", operation: "insert", index: 0, count: 1 },
        metrics(),
      ),
    ).toBeNull();
    original.anchor.end.row.offset = 90;
    const retained = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 0, count: 1 },
      metrics(),
    )!;
    if (retained.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    expect(retained.anchor.start.row).toEqual({ index: MAX_SHEET_ROWS, offset: 0 });
    expect(retained.anchor.end.row).toEqual({ index: MAX_SHEET_ROWS, offset: 90 });
  });
  test.each([1, MAX_SHEET_ROWS])(
    "terminal pixels survive deletion of %s rows and are recaptured legally",
    (count) => {
      const original = frame(),
        m = metrics();
      original.anchor = {
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: MAX_SHEET_ROWS, offset: 90 } },
        size: { width: 360, height: 240 },
      };
      const retained = transformPictureFrameAxis(
        original,
        { axis: "row", operation: "delete", index: 0, count },
        m,
      )!;
      expect(resolvePictureFrame(retained, m).rect.y).toBe((MAX_SHEET_ROWS - count) * 24 + 90);
      if (retained.anchor.mode !== "move-only") throw Error("Wrong mode");
      expect(retained.anchor.origin.row.index).toBeLessThanOrEqual(MAX_SHEET_ROWS);
    },
  );
  test("tail deletion uses the new sparse hidden metrics and preserves an exact hidden boundary", () => {
    const sheet = createSheet("Synthetic", "s");
    setRowHeight(sheet, 2, 96);
    setSheetDimensionHidden(sheet, "row", 4, true);
    setSheetDimensionHidden(sheet, "row", MAX_SHEET_ROWS - 2, true);
    const m = createPictureSheetMetrics(sheet),
      original = frame();
    original.anchor = {
      mode: "move-only",
      origin: { column: { index: 2, offset: 2 }, row: { index: MAX_SHEET_ROWS, offset: 90 } },
      size: { width: 360, height: 240 },
    };
    const tail = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "delete", index: 0, count: 2 },
      m,
    )!;
    expect(resolvePictureFrame(tail, m).rect.y).toBe(m.rows.visiblePrefix(MAX_SHEET_ROWS - 2) + 90);
    original.anchor.origin.row.offset = 0;
    const boundary = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "delete", index: 0, count: 2 },
      m,
    )!;
    if (boundary.anchor.mode !== "move-only") throw Error("Wrong mode");
    expect(boundary.anchor.origin.row).toEqual({ index: MAX_SHEET_ROWS - 2, offset: 0 });
  });
  test.each([
    { index: 13, count: 3, end: { index: 13, offset: 0 } },
    { index: 8, count: 3, end: { index: 11, offset: 2 } },
  ])("partial deletion %j preserves the nondeleted start", ({ index, count, end }) => {
    const next = transformPictureFrameAxis(
      frame(),
      { axis: "row", operation: "delete", index, count },
      metrics(),
    )!;
    if (next.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    expect(next.anchor.start.row).toEqual({ index: 4, offset: 2 });
    expect(next.anchor.end.row).toEqual(end);
  });
  test("a visibly collapsed hidden stretch is retained until its logical interval is consumed", () => {
    const sheet = createSheet("Synthetic", "s"),
      original = frame();
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, true);
    const m = createPictureSheetMetrics(sheet);
    expect(resolvePictureFrame(original, m).collapsed).toBe(true);
    const partial = transformPictureFrameAxis(
      original,
      { axis: "row", operation: "delete", index: 8, count: 1 },
      m,
    )!;
    expect(partial).not.toBeNull();
    expect(resolvePictureFrame(partial, m).collapsed).toBe(true);
    expect(
      transformPictureFrameAxis(
        original,
        { axis: "row", operation: "delete", index: 4, count: 11 },
        m,
      ),
    ).toBeNull();
  });
  test.each(["insert", "delete"] as const)(
    "negative leading rail stays fixed through %s",
    (operation) => {
      const original = frame();
      original.anchor = {
        mode: "move-only",
        origin: { column: { index: 0, offset: -60 }, row: { index: 0, offset: -20 } },
        size: { width: 360, height: 240 },
      };
      expect(
        transformPictureFrameAxis(
          original,
          { axis: "row", operation, index: 0, count: 1 },
          metrics(),
        ),
      ).toEqual(original);
    },
  );
  test.each([
    { axis: "row", operation: "insert", index: -1, count: 1 },
    { axis: "row", operation: "delete", index: 0, count: 0 },
    { axis: "column", operation: "insert", index: MAX_SHEET_COLUMNS - 1, count: 2 },
  ])("rejects illegal edit %j before changing input", (edit) => {
    const original = frame(),
      before = structuredClone(original);
    expect(() =>
      transformPictureFrameAxis(
        original,
        edit as Parameters<typeof transformPictureFrameAxis>[1],
        metrics(),
      ),
    ).toThrow();
    expect(original).toEqual(before);
  });
});
