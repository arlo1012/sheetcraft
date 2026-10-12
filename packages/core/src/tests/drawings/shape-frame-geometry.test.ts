import { describe, expect, test } from "vitest";
import {
  createSheet,
  setColumnWidth,
  setDefaultColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
} from "../../workbook.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "../../sheet-limits.js";
import {
  createPictureSheetMetrics,
  type PictureAxisMetrics,
  type PictureSheetMetrics,
} from "../../picture-axis-metrics.js";
import {
  MAX_SHAPE_FRAME_SIZE,
  MIN_SHAPE_FRAME_SIZE,
  anchorShapeFrameRect,
  areShapeFramesEqual,
  cloneShapeFrame,
  normalizeShapeFrame,
  normalizeShapeFrameAnchor,
  normalizeShapeFrameSize,
  reanchorShapeFrame,
  resizeShapeFrame,
  resolveShapeAnchorRect,
  resolveShapeFrame,
  shapeFrameLocalToWorld,
  shapeFrameWorldToLocal,
  transformShapeAnchorAxis,
  transformShapeFrameAxis,
  type ShapeFrame,
  type ShapeFrameAnchor,
} from "../../shape-frame.js";

const metrics = () => createPictureSheetMetrics(createSheet("Synthetic", "s"));
const modes = ["fixed", "move-only", "move-and-size"] as const;
function frame(anchor: ShapeFrameAnchor): ShapeFrame {
  return { kind: "shape-frame-v1", anchor };
}
function fixed(): ShapeFrame {
  return frame({ mode: "fixed", x: 100, y: 200, size: { width: 360, height: 240 } });
}
function stretch(): ShapeFrame {
  return frame({
    mode: "move-and-size",
    start: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
    end: { column: { index: 6, offset: 2 }, row: { index: 14, offset: 2 } },
  });
}

describe("source-free shape frame contract", () => {
  test("detaches every level without a duplicate source, size, or rotation", () => {
    const original = stretch();
    const copied = cloneShapeFrame(original);
    expect(areShapeFramesEqual(original, copied)).toBe(true);
    expect(copied).not.toBe(original);
    expect(copied.anchor).not.toBe(original.anchor);
    if (original.anchor.mode !== "move-and-size" || copied.anchor.mode !== "move-and-size")
      throw Error("Wrong mode");
    expect(copied.anchor.start).not.toBe(original.anchor.start);
    expect(copied.anchor.end).not.toBe(original.anchor.end);
    expect(copied.anchor.start.column).not.toBe(original.anchor.start.column);
    expect(copied.anchor.start.row).not.toBe(original.anchor.start.row);
    expect(copied.anchor.end.column).not.toBe(original.anchor.end.column);
    expect(copied.anchor.end.row).not.toBe(original.anchor.end.row);
    copied.anchor.start.column.offset = 3;
    expect(original.anchor.start.column.offset).toBe(2);
    expect(areShapeFramesEqual(original, copied)).toBe(false);
    expect(Object.keys(original)).toEqual(["kind", "anchor"]);
    expect(Object.keys(original.anchor)).toEqual(["mode", "start", "end"]);
    const sized = cloneShapeFrame(fixed());
    if (sized.anchor.mode !== "fixed") throw Error("Wrong mode");
    sized.anchor.size.width = 100;
    expect(resolveShapeFrame(fixed(), metrics()).rect.width).toBe(360);
  });

  test("accepts the shape budget above the picture budget and normalizes signed zero", () => {
    expect(MIN_SHAPE_FRAME_SIZE).toBe(1);
    expect(MAX_SHAPE_FRAME_SIZE).toBe(16384);
    const input = frame({ mode: "fixed", x: -0, y: -0, size: { width: 16384, height: 1 } });
    const output = normalizeShapeFrame(input);
    expect(output).toEqual(frame({ mode: "fixed", x: 0, y: 0, size: { width: 16384, height: 1 } }));
    if (output.anchor.mode !== "fixed") throw Error("Wrong mode");
    expect(Object.is(output.anchor.x, -0)).toBe(false);
    expect(resolveShapeFrame(output, metrics()).rect.width).toBe(16384);
    expect(normalizeShapeFrameSize({ width: 10000.5, height: 1.25 })).toEqual({
      width: 10000.5,
      height: 1.25,
    });
  });

  test.each([0, -1, 0.99, 16384.01, NaN, Infinity, -Infinity])(
    "rejects invalid explicit dimension %s",
    (dimension) => {
      for (const key of ["width", "height"] as const)
        expect(() =>
          normalizeShapeFrameSize({ width: 10, height: 10, [key]: dimension }),
        ).toThrow();
    },
  );

  test.each(["source", "angleDeg", "rotation", "width", "height", "cropShape", "future"])(
    "rejects a duplicate or unknown persisted field %s",
    (key) => {
      expect(() => normalizeShapeFrame({ ...fixed(), [key]: 1 })).toThrow(/Unknown/);
    },
  );

  test("requires mode-specific own fields and positive logical spans on both axes", () => {
    const invalid: unknown[] = [
      { ...fixed(), kind: "object-frame-v1" },
      { kind: "shape-frame-v1" },
      frame({ mode: "future" } as unknown as ShapeFrameAnchor),
      frame({
        mode: "fixed",
        x: 0,
        y: 0,
        size: { width: 10, height: 10 },
        origin: {},
      } as unknown as ShapeFrameAnchor),
      frame({
        mode: "move-only",
        origin: { row: { index: 0, offset: 0 } },
        size: { width: 10, height: 10 },
      } as unknown as ShapeFrameAnchor),
      frame({
        mode: "move-and-size",
        start: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
      }),
      frame({
        mode: "move-and-size",
        start: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
        end: { column: { index: 2, offset: 0 }, row: { index: 1, offset: 0 } },
      }),
    ];
    for (const value of invalid) expect(() => normalizeShapeFrame(value as ShapeFrame)).toThrow();
    expect(
      normalizeShapeFrame(
        frame({
          mode: "move-and-size",
          start: { column: { index: 1, offset: 0.125 }, row: { index: 1, offset: 0.25 } },
          end: { column: { index: 1, offset: 0.625 }, row: { index: 1, offset: 0.75 } },
        }),
      ).anchor.mode,
    ).toBe("move-and-size");
  });

  test("rejects inherited records, accessors, symbols, and nested unknowns without invoking getters", () => {
    let reads = 0;
    const getter = {
      get width() {
        reads++;
        return 10;
      },
      height: 10,
    };
    const original = stretch();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    const invalid: unknown[] = [
      Object.create(fixed()),
      { ...fixed(), anchor: Object.assign(Object.create({ future: 1 }), fixed().anchor) },
      { ...fixed(), anchor: { mode: "fixed", x: 0, y: 0, size: getter } },
      {
        kind: "shape-frame-v1",
        get anchor() {
          reads++;
          return fixed().anchor;
        },
      },
      { ...fixed(), [Symbol("future")]: 1 },
      { ...fixed(), anchor: { ...fixed().anchor, future: 1 } },
      {
        ...fixed(),
        anchor: { mode: "fixed", x: 0, y: 0, size: { width: 10, height: 10, future: 1 } },
      },
      { ...original, anchor: { ...original.anchor, start: Object.create(original.anchor.start) } },
      {
        ...original,
        anchor: {
          ...original.anchor,
          start: {
            ...original.anchor.start,
            column: {
              index: 2,
              get offset() {
                reads++;
                return 2;
              },
            },
          },
        },
      },
      {
        ...original,
        anchor: {
          ...original.anchor,
          end: { ...original.anchor.end, row: { index: 14, offset: 2, future: 1 } },
        },
      },
      [],
      null,
    ];
    for (const value of invalid) expect(() => normalizeShapeFrame(value as ShapeFrame)).toThrow();
    expect(reads).toBe(0);
  });

  test("null-prototype and non-enumerable own data normalize to canonical ordinary records", () => {
    const size = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(size, { width: { value: 10 }, height: { value: 20 } });
    const anchor = Object.assign(Object.create(null), { mode: "fixed", x: 0, y: 0, size });
    const value = Object.assign(Object.create(null), { kind: "shape-frame-v1", anchor });
    expect(normalizeShapeFrame(value)).toEqual(
      frame({ mode: "fixed", x: 0, y: 0, size: { width: 10, height: 20 } }),
    );
    expect(Object.getPrototypeOf(normalizeShapeFrame(value))).toBe(Object.prototype);
  });

  test.each([
    { index: -1, offset: 0 },
    { index: 1.5, offset: 0 },
    { index: MAX_SHEET_ROWS + 1, offset: 0 },
    { index: 1, offset: -1 },
    { index: 0, offset: Infinity },
  ])("rejects invalid logical row %j", (row) => {
    expect(() =>
      normalizeShapeFrameAnchor({
        mode: "move-only",
        origin: { column: { index: 0, offset: 0 }, row },
        size: { width: 10, height: 10 },
      }),
    ).toThrow();
  });
});

describe("shape display projection and inverse materialization", () => {
  test("moving follows sparse preceding size/default changes; fixed preserves its rectangle", () => {
    const sheet = createSheet("Synthetic", "s");
    const initial = createPictureSheetMetrics(sheet);
    const moving = frame(
      anchorShapeFrameRect("move-only", { x: 194, y: 98, width: 360, height: 240 }, initial),
    );
    setRowHeight(sheet, 0, 64);
    setColumnWidth(sheet, 0, 136);
    expect(resolveShapeFrame(moving, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 234,
      y: 138,
      width: 360,
      height: 240,
    });
    setDefaultColumnWidth(sheet, 88);
    expect(resolveShapeFrame(moving, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 226,
      y: 138,
      width: 360,
      height: 240,
    });
    expect(resolveShapeFrame(fixed(), createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 100,
      y: 200,
      width: 360,
      height: 240,
    });
    expect(sheet.columnWidths.size).toBe(1);
    expect(sheet.rowHeights.size).toBe(1);
  });

  test("move-size expands independently and preserves raw insets when cells resize or hide", () => {
    const sheet = createSheet("Synthetic", "s");
    const original = stretch(),
      before = structuredClone(original);
    setRowHeight(sheet, 4, 64);
    setColumnWidth(sheet, 2, 136);
    expect(resolveShapeFrame(original, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 194,
      y: 98,
      width: 424,
      height: 280,
    });
    setRowHeight(sheet, 4, 16);
    setSheetDimensionHidden(sheet, "column", 2, true);
    expect(resolveShapeFrame(original, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 192,
      y: 98,
      width: 290,
      height: 232,
    });
    expect(original).toEqual(before);
  });

  test("hiding the complete physical span retains markers and showing restores it", () => {
    const sheet = createSheet("Synthetic", "s");
    const original = stretch(),
      before = structuredClone(original);
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, true);
    const collapsed = resolveShapeFrame(original, createPictureSheetMetrics(sheet), 37);
    expect(collapsed.rect.height).toBe(0);
    expect(collapsed.collapsed).toBe(true);
    expect("sourceRect" in collapsed).toBe(false);
    expect(original).toEqual(before);
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, false);
    expect(resolveShapeFrame(original, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 194,
      y: 98,
      width: 384,
      height: 240,
    });
  });

  test("derived subpixel spans are valid but explicit sizes still require one pixel", () => {
    const original = frame({
      mode: "move-and-size",
      start: { column: { index: 1, offset: 0.125 }, row: { index: 1, offset: 0.125 } },
      end: { column: { index: 1, offset: 0.375 }, row: { index: 1, offset: 0.5 } },
    });
    expect(resolveShapeFrame(original, metrics()).rect).toEqual({
      x: 96.125,
      y: 24.125,
      width: 0.25,
      height: 0.375,
    });
    expect(resolveShapeFrame(original, metrics()).collapsed).toBe(false);
    expect(() =>
      reanchorShapeFrame(original, resolveShapeFrame(original, metrics()).rect, metrics()),
    ).toThrow();
  });

  test("large ordinary-cell insets clamp only display, without inheriting legacy offset budgets", () => {
    const original = frame({
      mode: "move-only",
      origin: { column: { index: 2, offset: 1e200 }, row: { index: 4, offset: 1000001 } },
      size: { width: 12000, height: 1 },
    });
    const before = structuredClone(original);
    expect(resolveShapeFrame(original, metrics()).rect).toEqual({
      x: 288,
      y: 120,
      width: 12000,
      height: 1,
    });
    expect(original).toEqual(before);
  });

  test.each(modes)("fractional inverse projection and reanchoring preserve %s mode", (mode) => {
    const m = metrics(),
      rect = { x: 194.125, y: 98.375, width: 12000.25, height: 240.625 };
    const original = frame(anchorShapeFrameRect(mode, rect, m));
    expect(resolveShapeAnchorRect(original.anchor, m)).toEqual(rect);
    const nextRect = { ...rect, x: rect.x + 0.125, y: rect.y + 0.25 };
    const next = reanchorShapeFrame(original, nextRect, m);
    expect(next.anchor.mode).toBe(mode);
    expect(resolveShapeAnchorRect(next.anchor, m)).toEqual(nextRect);
    expect(resolveShapeAnchorRect(original.anchor, m)).toEqual(rect);
  });

  test("preferred hidden and display-clamped logical markers survive an explicit reanchor", () => {
    const sheet = createSheet("Synthetic", "s");
    setSheetDimensionHidden(sheet, "row", 4, true);
    const m = createPictureSheetMetrics(sheet);
    const original = frame({
      mode: "move-only",
      origin: { column: { index: 2, offset: 400 }, row: { index: 4, offset: 20 } },
      size: { width: 10, height: 10 },
    });
    const rect = resolveShapeAnchorRect(original.anchor, m);
    expect(reanchorShapeFrame(original, rect, m)).toEqual(original);
    const converted = anchorShapeFrameRect("move-and-size", rect, m, original.anchor);
    if (converted.mode !== "move-and-size" || original.anchor.mode !== "move-only")
      throw Error("Wrong mode");
    expect(converted.start).toEqual(original.anchor.origin);
    expect(resolveShapeAnchorRect(converted, m)).toEqual(rect);
    const boundary = frame({
      mode: "move-and-size",
      start: { column: { index: 2, offset: 400 }, row: { index: 4, offset: 20 } },
      end: { column: { index: 4, offset: 400 }, row: { index: 8, offset: 40 } },
    });
    expect(reanchorShapeFrame(boundary, resolveShapeAnchorRect(boundary.anchor, m), m)).toEqual(
      boundary,
    );
  });

  test.each(modes)("explicit negative leading and terminal rails materialize for %s", (mode) => {
    const m = metrics();
    const leading = { x: -12.5, y: -20.25, width: 100, height: 40 };
    expect(resolveShapeAnchorRect(anchorShapeFrameRect(mode, leading, m), m)).toEqual(leading);
    const trailing = {
      x: m.columns.visiblePrefix(MAX_SHEET_COLUMNS) + 5.5,
      y: m.rows.visiblePrefix(MAX_SHEET_ROWS) + 6.25,
      width: 16384,
      height: 1,
    };
    const anchor = anchorShapeFrameRect(mode, trailing, m);
    expect(resolveShapeAnchorRect(anchor, m)).toEqual(trailing);
    if (anchor.mode === "move-only")
      expect(anchor.origin.row).toEqual({ index: MAX_SHEET_ROWS, offset: 6.25 });
    if (anchor.mode === "move-and-size")
      expect(anchor.end.column).toEqual({ index: MAX_SHEET_COLUMNS, offset: 16389.5 });
  });

  test("inverse projection uses bounded sparse metric queries across terminal-sized axes", () => {
    const sheet = createSheet("Synthetic", "s");
    setDefaultColumnWidth(sheet, 88);
    setColumnWidth(sheet, 2, 120);
    setSheetDimensionHidden(sheet, "row", 4, true);
    const initial = createPictureSheetMetrics(sheet);
    let queries = 0;
    function measured(axis: PictureAxisMetrics): PictureAxisMetrics {
      return {
        ...axis,
        visiblePrefix(index) {
          queries++;
          return axis.visiblePrefix(index);
        },
      };
    }
    const m: PictureSheetMetrics = {
      columns: measured(initial.columns),
      rows: measured(initial.rows),
    };
    const rect = {
      x: initial.columns.visiblePrefix(MAX_SHEET_COLUMNS - 2) + 0.25,
      y: initial.rows.visiblePrefix(MAX_SHEET_ROWS - 2) + 0.5,
      width: 50.5,
      height: 12.25,
    };
    expect(resolveShapeAnchorRect(anchorShapeFrameRect("move-and-size", rect, m), m)).toEqual(rect);
    expect(queries).toBeLessThan(100);
    expect(sheet.rowHeights.size).toBe(0);
    expect(sheet.columnWidths.size).toBe(1);
    expect(sheet.hiddenRows!.size).toBe(1);
  });

  test("normal derived spans are bounded before a caller can mutate the worksheet", () => {
    const sheet = createSheet("Synthetic", "s");
    const original = frame({
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 170, offset: 0 }, row: { index: 1, offset: 0 } },
    });
    const before = structuredClone(original),
      m = createPictureSheetMetrics(sheet);
    expect(resolveShapeFrame(original, m).rect.width).toBe(16320);
    expect(() =>
      transformShapeFrameAxis(
        original,
        { axis: "column", operation: "insert", index: 10, count: 1 },
        m,
      ),
    ).toThrow(/Resolved shape spans/);
    expect(original).toEqual(before);
    setColumnWidth(sheet, 0, 200);
    expect(() => resolveShapeFrame(original, createPictureSheetMetrics(sheet))).toThrow(
      /Resolved shape spans/,
    );
    expect(() =>
      anchorShapeFrameRect("move-and-size", { x: 0, y: 0, width: 16385, height: 1 }, m),
    ).toThrow();
  });

  test("finite extreme coordinates still reject unrepresentable extents and arithmetic overflow", () => {
    const m = metrics();
    expect(() =>
      normalizeShapeFrame(frame({ mode: "fixed", x: 1e200, y: 0, size: { width: 1, height: 1 } })),
    ).toThrow(/represented/);
    expect(() =>
      anchorShapeFrameRect("move-only", { x: -1e200, y: 0, width: 16384, height: 1 }, m),
    ).toThrow(/represented/);
    const tail = frame({
      mode: "move-only",
      origin: { column: { index: MAX_SHEET_COLUMNS, offset: 1e200 }, row: { index: 0, offset: 0 } },
      size: { width: 16384, height: 1 },
    });
    expect(() => resolveShapeFrame(tail, m)).toThrow(/represented/);
    const overflow = frame({
      mode: "move-and-size",
      start: { column: { index: 0, offset: -Number.MAX_VALUE }, row: { index: 0, offset: 0 } },
      end: {
        column: { index: MAX_SHEET_COLUMNS, offset: Number.MAX_VALUE },
        row: { index: 1, offset: 0 },
      },
    });
    expect(() => resolveShapeFrame(overflow, m)).toThrow(/finite/);
    for (const x of [NaN, Infinity, -Infinity])
      expect(() =>
        normalizeShapeFrame(frame({ mode: "fixed", x, y: 0, size: { width: 1, height: 1 } })),
      ).toThrow();
  });
});

describe("shape structural axis policy", () => {
  test.each(["row", "column"] as const)(
    "%s partial deletion rebases only consumed endpoints",
    (axis) => {
      const original = stretch(),
        before = structuredClone(original),
        index = axis === "row" ? 4 : 2;
      const next = transformShapeFrameAxis(
        original,
        { axis, operation: "delete", index, count: 1 },
        metrics(),
      )!;
      if (next.anchor.mode !== "move-and-size") throw Error("Wrong mode");
      expect(next.anchor.start[axis]).toEqual({ index, offset: 0 });
      expect(next.anchor.end[axis]).toEqual({ index: axis === "row" ? 13 : 5, offset: 2 });
      expect(original).toEqual(before);
    },
  );

  test.each(["row", "column"] as const)(
    "%s whole-span deletion removes move-size and retains move-only dimensions",
    (axis) => {
      const original = stretch(),
        index = axis === "row" ? 4 : 2;
      const edit = { axis, operation: "delete" as const, index, count: 12 };
      expect(transformShapeFrameAxis(original, edit, metrics())).toBeNull();
      const moving = frame({
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
        size: { width: 12000, height: 240 },
      });
      const next = transformShapeFrameAxis(moving, edit, metrics())!;
      if (next.anchor.mode !== "move-only") throw Error("Wrong mode");
      expect(next.anchor.origin[axis]).toEqual({ index, offset: 0 });
      expect(next.anchor.size).toEqual({ width: 12000, height: 240 });
    },
  );

  test.each(["row", "column"] as const)(
    "%s insertions distinguish before, inside, and exact end boundaries",
    (axis) => {
      const m = metrics(),
        original = stretch(),
        start = axis === "row" ? 4 : 2,
        end = axis === "row" ? 14 : 6;
      if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
      original.anchor.end[axis].offset = 0;
      const rect = resolveShapeFrame(original, m).rect,
        coordinate = axis === "row" ? "y" : "x",
        size = axis === "row" ? "height" : "width",
        amount = axis === "row" ? 24 : 96;
      const before = transformShapeFrameAxis(
        original,
        { axis, operation: "insert", index: start, count: 1 },
        m,
      )!;
      expect(resolveShapeFrame(before, m).rect).toEqual({
        ...rect,
        [coordinate]: rect[coordinate] + amount,
      });
      const inside = transformShapeFrameAxis(
        original,
        { axis, operation: "insert", index: start + 1, count: 1 },
        m,
      )!;
      expect(resolveShapeFrame(inside, m).rect).toEqual({ ...rect, [size]: rect[size] + amount });
      expect(
        transformShapeFrameAxis(original, { axis, operation: "insert", index: end, count: 1 }, m),
      ).toEqual(original);
    },
  );

  test.each(["insert", "delete"] as const)(
    "fixed anchors are unaffected by %s and remain detached",
    (operation) => {
      const original = fixed();
      const next = transformShapeFrameAxis(
        original,
        { axis: "row", operation, index: 4, count: 2 },
        metrics(),
      )!;
      expect(next).toEqual(original);
      expect(next.anchor).not.toBe(original.anchor);
      if (next.anchor.mode !== "fixed" || original.anchor.mode !== "fixed")
        throw Error("Wrong mode");
      expect(next.anchor.size).not.toBe(original.anchor.size);
    },
  );

  test("raw insets survive structural edits and hidden physical collapse survives partial deletion", () => {
    const sheet = createSheet("Synthetic", "s");
    const original = stretch();
    if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    original.anchor.start.row.offset = 400;
    const moved = transformShapeFrameAxis(
      original,
      { axis: "row", operation: "insert", index: 0, count: 1 },
      createPictureSheetMetrics(sheet),
    )!;
    if (moved.anchor.mode !== "move-and-size") throw Error("Wrong mode");
    expect(moved.anchor.start.row).toEqual({ index: 5, offset: 400 });
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, true);
    const m = createPictureSheetMetrics(sheet);
    expect(resolveShapeFrame(original, m).collapsed).toBe(true);
    const retained = transformShapeFrameAxis(
      original,
      { axis: "row", operation: "delete", index: 8, count: 1 },
      m,
    )!;
    expect(retained).not.toBeNull();
    expect(resolveShapeFrame(retained, m).collapsed).toBe(true);
    expect(
      transformShapeFrameAxis(
        original,
        { axis: "row", operation: "delete", index: 4, count: 11 },
        m,
      ),
    ).toBeNull();
  });

  test.each(["row", "column"] as const)(
    "%s MAX truncation removes a stretch but retains move-only and terminal tails",
    (axis) => {
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
      const original = stretch(),
        m = metrics(),
        edit = { axis, operation: "insert" as const, index: 0, count: 1 };
      if (original.anchor.mode !== "move-and-size") throw Error("Wrong mode");
      original.anchor.start[axis] = { index: maximum - 1, offset: 2 };
      original.anchor.end[axis] = { index: maximum, offset: 0 };
      expect(transformShapeFrameAxis(original, edit, m)).toBeNull();
      original.anchor.end[axis].offset = 90;
      const retained = transformShapeFrameAxis(original, edit, m)!;
      if (retained.anchor.mode !== "move-and-size") throw Error("Wrong mode");
      expect(retained.anchor.start[axis]).toEqual({ index: maximum, offset: 0 });
      expect(retained.anchor.end[axis]).toEqual({ index: maximum, offset: 90 });
      const moving = frame({
        mode: "move-only",
        origin: original.anchor.start,
        size: { width: 360, height: 240 },
      });
      const next = transformShapeFrameAxis(moving, edit, m)!;
      if (next.anchor.mode !== "move-only") throw Error("Wrong mode");
      expect(next.anchor.origin[axis]).toEqual({ index: maximum, offset: 0 });
    },
  );

  test.each([1, MAX_SHEET_ROWS])("terminal pixel tails survive deletion of %s rows", (count) => {
    const m = metrics(),
      original = frame({
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: MAX_SHEET_ROWS, offset: 90 } },
        size: { width: 360, height: 240 },
      });
    const next = transformShapeFrameAxis(
      original,
      { axis: "row", operation: "delete", index: 0, count },
      m,
    )!;
    expect(resolveShapeFrame(next, m).rect.y).toBe((MAX_SHEET_ROWS - count) * 24 + 90);
    if (next.anchor.mode !== "move-only") throw Error("Wrong mode");
    expect(next.anchor.origin.row.index).toBeLessThanOrEqual(MAX_SHEET_ROWS);
  });

  test("terminal rebasing uses next sparse visible metrics and prefers a hidden exact boundary", () => {
    const sheet = createSheet("Synthetic", "s");
    setRowHeight(sheet, 2, 96);
    setSheetDimensionHidden(sheet, "row", 4, true);
    setSheetDimensionHidden(sheet, "row", MAX_SHEET_ROWS - 2, true);
    const m = createPictureSheetMetrics(sheet),
      original = frame({
        mode: "move-only",
        origin: { column: { index: 2, offset: 2 }, row: { index: MAX_SHEET_ROWS, offset: 90 } },
        size: { width: 360, height: 240 },
      });
    const edit = { axis: "row" as const, operation: "delete" as const, index: 0, count: 2 };
    const next = transformShapeFrameAxis(original, edit, m)!;
    expect(resolveShapeFrame(next, m).rect.y).toBe(m.rows.visiblePrefix(MAX_SHEET_ROWS - 2) + 90);
    if (original.anchor.mode !== "move-only") throw Error("Wrong mode");
    original.anchor.origin.row.offset = 0;
    const boundary = transformShapeFrameAxis(original, edit, m)!;
    if (boundary.anchor.mode !== "move-only") throw Error("Wrong mode");
    expect(boundary.anchor.origin.row).toEqual({ index: MAX_SHEET_ROWS - 2, offset: 0 });
  });

  test.each(["insert", "delete"] as const)(
    "negative leading rails survive %s without rebasing to real content",
    (operation) => {
      const original = frame({
        mode: "move-only",
        origin: { column: { index: 0, offset: -12.5 }, row: { index: 0, offset: -20.25 } },
        size: { width: 360, height: 240 },
      });
      expect(
        transformShapeFrameAxis(
          original,
          { axis: "row", operation, index: 0, count: 1 },
          metrics(),
        ),
      ).toEqual(original);
      expect(
        transformShapeFrameAxis(
          original,
          { axis: "column", operation, index: 0, count: 1 },
          metrics(),
        ),
      ).toEqual(original);
    },
  );

  test.each([
    { axis: "future", operation: "insert", index: 0, count: 1 },
    { axis: "row", operation: "future", index: 0, count: 1 },
    { axis: "row", operation: "insert", index: -1, count: 1 },
    { axis: "row", operation: "insert", index: 0.5, count: 1 },
    { axis: "row", operation: "insert", index: 0, count: 0 },
    { axis: "row", operation: "insert", index: 0, count: Infinity },
    { axis: "row", operation: "insert", index: MAX_SHEET_ROWS, count: 1 },
  ])("rejects invalid structural edit %j", (edit) => {
    expect(() =>
      transformShapeFrameAxis(
        fixed(),
        edit as Parameters<typeof transformShapeFrameAxis>[1],
        metrics(),
      ),
    ).toThrow();
  });

  test("rejects partial-axis metrics and returns detached anchors from the source-free planner", () => {
    const m = metrics();
    const edit = { axis: "row" as const, operation: "insert" as const, index: 0, count: 1 };
    expect(() =>
      transformShapeFrameAxis(fixed(), edit, { ...m, rows: { ...m.rows, count: 20 } }),
    ).toThrow(/cover the worksheet/);
    expect(transformShapeAnchorAxis(fixed().anchor, edit, m)).toEqual(fixed().anchor);
  });
});

describe("shape local rotation and numeric resize geometry", () => {
  test("rotation is transient, local/world projection inverts, and rotated AABB may exceed local budget", () => {
    const m = metrics(),
      original = fixed(),
      before = structuredClone(original);
    const resolved = resolveShapeFrame(original, m, -323);
    expect(resolved.angleDeg).toBe(37);
    expect(resolved.rect).toEqual({ x: 100, y: 200, width: 360, height: 240 });
    const local = { x: 33.125, y: 77.375 },
      world = shapeFrameLocalToWorld(resolved.rect, 37, local);
    const recovered = shapeFrameWorldToLocal(resolved.rect, 37, world);
    expect(recovered.x).toBeCloseTo(local.x, 10);
    expect(recovered.y).toBeCloseTo(local.y, 10);
    expect(original).toEqual(before);
    const largest = frame({ mode: "fixed", x: 0, y: 0, size: { width: 16384, height: 16384 } });
    expect(resolveShapeFrame(largest, m, 45).bounds.width).toBeGreaterThan(16384);
    expect(() => resolveShapeFrame(original, m, Infinity)).toThrow();
  });

  test.each(modes)(
    "37-degree numeric resize preserves the rotated local NW and %s anchoring",
    (mode) => {
      const m = metrics(),
        original = frame(anchorShapeFrameRect(mode, { x: 194, y: 98, width: 360, height: 240 }, m));
      const before = structuredClone(original),
        oldCorner = resolveShapeFrame(original, m, 37).corners[0];
      const next = resizeShapeFrame(original, { width: 720, height: 300 }, m, 37);
      const resolved = resolveShapeFrame(next, m, 37);
      expect(next.anchor.mode).toBe(mode);
      expect(resolved.rect.width).toBeCloseTo(720, 10);
      expect(resolved.rect.height).toBeCloseTo(300, 10);
      expect(resolved.corners[0].x).toBeCloseTo(oldCorner.x, 10);
      expect(resolved.corners[0].y).toBeCloseTo(oldCorner.y, 10);
      expect(original).toEqual(before);
    },
  );

  test("rotated numeric edits may reach negative layout coordinates and remain source-free", () => {
    const m = metrics(),
      original = frame({ mode: "fixed", x: 0, y: 0, size: { width: 360, height: 240 } });
    const oldCorner = resolveShapeFrame(original, m, 37).corners[0];
    const next = resizeShapeFrame(original, { width: 360, height: 480 }, m, 37);
    const resolved = resolveShapeFrame(next, m, 37);
    expect(resolved.rect.x).toBeLessThan(0);
    expect(resolved.rect.y).toBeLessThan(0);
    expect(resolved.corners[0].x).toBeCloseTo(oldCorner.x, 10);
    expect(resolved.corners[0].y).toBeCloseTo(oldCorner.y, 10);
    expect(Object.keys(next)).toEqual(["kind", "anchor"]);
    expect(() => resizeShapeFrame(original, { width: 16385, height: 1 }, m, 37)).toThrow();
    expect(() => resizeShapeFrame(original, { width: 100, height: 100 }, m, NaN)).toThrow();
  });
});
