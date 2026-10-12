// @vitest-environment node
import { describe, expect, test } from "vitest";
import { reactive } from "vue";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
  type SheetLegacyDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { resolveShapeFrame, type ShapeFrameAnchor } from "@sheetcraft/core/shape-frame";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../modules/sheet-drawings/resolved-shape-drawing";

function fixture(): { sheet: Sheet; metrics: PictureSheetMetrics } {
  const sheet = createSheet("Shapes", "sheet");
  sheet.columnWidths = new Map([
    [0, 80],
    [1, 100],
    [2, 60],
    [3, 80],
  ]);
  sheet.rowHeights = new Map([
    [0, 20],
    [1, 30],
    [2, 40],
    [3, 20],
  ]);
  return { sheet, metrics: createPictureSheetMetrics(sheet) };
}
function framed(
  anchor: ShapeFrameAnchor = {
    mode: "move-and-size",
    start: { column: { index: 1, offset: 17 }, row: { index: 1, offset: 8 } },
    end: { column: { index: 3, offset: 21 }, row: { index: 3, offset: 11 } },
  },
  kind: "shape" | "textBox" = "shape",
): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing("shape", kind, "Shape", { row: 0, column: 0 });
  return normalizeSheetDrawing({
    ...appearance,
    kind,
    shapeFrame: { kind: "shape-frame-v1", anchor },
    shapeProperties: { locked: false, altTitle: "Accessible shape" },
  });
}
function canonical(
  value: ReturnType<typeof updateResolvedShapeDrawing>,
): SheetFramedGraphicDrawing {
  if (!isFramedShapeDrawing(value)) throw new Error("Expected a canonical shape.");
  return value;
}
function graphicView(view: SheetLegacyDrawing): SheetGraphicDrawing {
  if (
    view.kind === "chart" ||
    view.kind === "camera" ||
    view.kind === "attachment" ||
    view.kind === "control"
  )
    throw new Error("Expected a graphic view.");
  return view;
}
function rectOf(view: SheetLegacyDrawing, metrics: PictureSheetMetrics) {
  return {
    x: metrics.columns.visiblePrefix(view.anchor.column) + view.offsetX,
    y: metrics.rows.visiblePrefix(view.anchor.row) + view.offsetY,
    width: view.width,
    height: view.height,
  };
}
function expectOnlyCanonicalPlacement(value: SheetFramedGraphicDrawing) {
  for (const key of ["anchor", "offsetX", "offsetY", "width", "height", "frame", "source"])
    expect(Object.hasOwn(value, key)).toBe(false);
  expect(Object.keys(value.shapeFrame)).toEqual(["kind", "anchor"]);
}

const legacyBase = createGraphicDrawing("legacy", "wordArt", "Legacy", { row: 1, column: 1 });
const legacyDrawings: SheetLegacyDrawing[] = [
  ...(["shape", "textBox", "wordArt", "icon", "equation"] as const).map((kind) =>
    createGraphicDrawing(`legacy-${kind}`, kind, kind, { row: 1, column: 1 }),
  ),
  {
    ...legacyBase,
    kind: "camera",
    camera: { range: null, gridLines: false },
  },
  {
    ...legacyBase,
    kind: "chart",
    chart: {
      type: "column",
      range: null,
      title: "Chart",
      headerRow: false,
      headerColumn: false,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  },
  {
    ...legacyBase,
    kind: "attachment",
    attachment: {
      filename: "empty.txt",
      mimeType: "text/plain",
      size: 0,
      data: "",
      display: "icon",
    },
  },
  {
    ...legacyBase,
    kind: "control",
    control: {
      type: "checkbox",
      label: "Choice",
      linkedCell: null,
      source: null,
      items: [],
      min: 0,
      max: 1,
      step: 1,
      optionValue: 1,
      resetValue: false,
    },
  },
];

describe("detached shape frame projection", () => {
  test("retains a reactive canonical owner while deeply detaching the render view", () => {
    const { metrics } = fixture();
    const source = reactive(framed());
    const before = JSON.stringify(source);
    const resolved = resolveShapeDrawing(source, metrics);
    expect(resolved.source).toBe(source);
    expect(resolved.metrics).toBe(metrics);
    expect(resolved.view).not.toBe(source);
    expect(resolved.rect).toEqual(
      resolveShapeFrame(source.shapeFrame, metrics, source.rotation).rect,
    );
    expect(rectOf(resolved.view, metrics)).toEqual(resolved.rect);
    expect(resolved.view).not.toHaveProperty("shapeFrame");
    expect(resolved.view).not.toHaveProperty("shapeProperties");
    expect(resolved.view.anchor).toEqual({ row: 1, column: 1 });
    expect(graphicView(resolved.view).shapeText).not.toBe(source.shapeText);
    expect(graphicView(resolved.view).shapeText!.layout).not.toBe(source.shapeText!.layout);
    resolved.view.name = "Preview";
    graphicView(resolved.view).shapeText!.layout.marginsPt.leftPt = 123;
    expect(JSON.stringify(source)).toBe(before);
    expectOnlyCanonicalPlacement(source);
  });

  test.each(legacyDrawings)("preserves the exact public legacy $kind owner and view", (source) => {
    const { metrics } = fixture();
    const owner = reactive(source);
    const before = JSON.stringify(owner);
    const resolved = resolveShapeDrawing(owner, metrics);
    expect(resolved.source).toBe(owner);
    expect(resolved.view).toBe(owner);
    expect(resolved.rect).toEqual(rectOf(owner, metrics));
    const next = { ...resolved.view, name: "Edited" };
    expect(updateResolvedShapeDrawing(resolved, next, metrics)).toBe(next);
    expect(next).not.toHaveProperty("shapeFrame");
    expect(JSON.stringify(owner)).toBe(before);
  });

  test("hiding and unhiding move-size spans preserves raw insets and logical origin", () => {
    const { sheet, metrics } = fixture();
    const source = framed();
    const before = JSON.stringify(source);
    const visible = resolveShapeDrawing(source, metrics);
    sheet.hiddenColumns = new Set([1, 2, 3]);
    sheet.hiddenRows = new Set([1, 2, 3]);
    const hidden = resolveShapeDrawing(source, createPictureSheetMetrics(sheet));
    expect(hidden.view.anchor).toEqual({ row: 1, column: 1 });
    expect(hidden.rect).toEqual({ x: 80, y: 20, width: 0, height: 0 });
    expect(hidden.view.offsetX).toBe(0);
    expect(hidden.view.offsetY).toBe(0);
    expect(hidden.view.width).toBe(0);
    expect(hidden.view.height).toBe(0);
    expect(hidden.collapsed).toBe(true);
    sheet.hiddenColumns.clear();
    sheet.hiddenRows.clear();
    expect(resolveShapeDrawing(source, createPictureSheetMetrics(sheet)).rect).toEqual(
      visible.rect,
    );
    expect(JSON.stringify(source)).toBe(before);
  });

  test("keeps valid subpixel spans without min-clamping or marking them collapsed", () => {
    const { metrics } = fixture();
    const source = framed({
      mode: "move-and-size",
      start: { column: { index: 1, offset: 0.125 }, row: { index: 1, offset: 0.25 } },
      end: { column: { index: 1, offset: 0.625 }, row: { index: 1, offset: 0.75 } },
    });
    const resolved = resolveShapeDrawing(source, metrics);
    expect(resolved.rect).toEqual({ x: 80.125, y: 20.25, width: 0.5, height: 0.5 });
    expect(resolved.view.width).toBe(0.5);
    expect(resolved.view.height).toBe(0.5);
    expect(resolved.collapsed).toBe(false);
    expect(canonical(updateResolvedShapeDrawing(resolved, resolved.view, metrics))).toEqual(source);
  });

  test("marks a one-axis collapse while retaining the other exact display span", () => {
    const { sheet } = fixture();
    sheet.hiddenColumns = new Set([1, 2, 3]);
    const resolved = resolveShapeDrawing(framed(), createPictureSheetMetrics(sheet));
    expect(resolved.collapsed).toBe(true);
    expect(resolved.rect.width).toBe(0);
    expect(resolved.rect.height).toBe(73);
    expect(resolved.view.height).toBe(73);
  });

  test("move-only retains its logical origin, keeps physical size, and follows cell changes", () => {
    const { sheet, metrics } = fixture();
    const source = framed({
      mode: "move-only",
      origin: { column: { index: 1, offset: 500 }, row: { index: 1, offset: 200 } },
      size: { width: 180.25, height: 120.75 },
    });
    const visible = resolveShapeDrawing(source, metrics);
    expect(visible.view.anchor).toEqual({ row: 1, column: 1 });
    expect(visible.view.offsetX).toBe(100);
    expect(visible.view.offsetY).toBe(30);
    sheet.hiddenColumns = new Set([1]);
    sheet.hiddenRows = new Set([1]);
    const hidden = resolveShapeDrawing(source, createPictureSheetMetrics(sheet));
    expect(hidden.view.anchor).toEqual({ row: 1, column: 1 });
    expect(hidden.rect).toEqual({ x: 80, y: 20, width: 180.25, height: 120.75 });
    expect(hidden.collapsed).toBe(false);
    sheet.columnWidths.set(0, 120);
    sheet.rowHeights.set(0, 40);
    const moved = resolveShapeDrawing(source, createPictureSheetMetrics(sheet));
    expect(moved.rect).toEqual({ x: 120, y: 40, width: 180.25, height: 120.75 });
  });

  test.each(["shape", "textBox"] as const)(
    "fixed $kind uses axis lookup and stays fixed through dimension changes",
    (kind) => {
      const { sheet, metrics } = fixture();
      const source = framed(
        { mode: "fixed", x: 91.25, y: 27.5, size: { width: 180, height: 80 } },
        kind,
      );
      const resolved = resolveShapeDrawing(source, metrics);
      expect(resolved.view.anchor).toEqual({ row: 1, column: 1 });
      expect(resolved.view.offsetX).toBe(11.25);
      expect(resolved.view.offsetY).toBe(7.5);
      (sheet.hiddenColumns ??= new Set()).add(0);
      (sheet.hiddenRows ??= new Set()).add(0);
      sheet.columnWidths.set(1, 50);
      sheet.rowHeights.set(1, 10);
      const changed = resolveShapeDrawing(source, createPictureSheetMetrics(sheet));
      expect(changed.rect).toEqual(resolved.rect);
      expect(rectOf(changed.view, createPictureSheetMetrics(sheet))).toEqual(resolved.rect);
    },
  );

  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "%s projects negative coordinates into signed leading offsets",
    (mode) => {
      const { metrics } = fixture();
      const origin = { column: { index: 0, offset: -11.5 }, row: { index: 0, offset: -4.25 } };
      const source = framed(
        mode === "fixed"
          ? { mode, x: -11.5, y: -4.25, size: { width: 10, height: 15 } }
          : mode === "move-only"
            ? { mode, origin, size: { width: 10, height: 15 } }
            : {
                mode,
                start: origin,
                end: { column: { index: 0, offset: 2 }, row: { index: 0, offset: 12 } },
              },
      );
      const resolved = resolveShapeDrawing(source, metrics);
      expect(resolved.view.anchor).toEqual({ row: 0, column: 0 });
      expect(resolved.view.offsetX).toBe(-11.5);
      expect(resolved.view.offsetY).toBe(-4.25);
      expect(rectOf(resolved.view, metrics)).toEqual(resolved.rect);
      expect(canonical(updateResolvedShapeDrawing(resolved, resolved.view, metrics))).toEqual(
        source,
      );
    },
  );

  test("supports terminal virtual space without clamping to the last physical cell", () => {
    const { metrics } = fixture();
    const x = metrics.columns.visiblePrefix(MAX_SHEET_COLUMNS) + 35.5;
    const y = metrics.rows.visiblePrefix(MAX_SHEET_ROWS) + 12.25;
    const fixed = framed({ mode: "fixed", x, y, size: { width: 25, height: 15 } });
    const moving = framed({
      mode: "move-only",
      origin: {
        column: { index: MAX_SHEET_COLUMNS, offset: 35.5 },
        row: { index: MAX_SHEET_ROWS, offset: 12.25 },
      },
      size: { width: 25, height: 15 },
    });
    for (const source of [fixed, moving]) {
      const resolved = resolveShapeDrawing(source, metrics);
      expect(resolved.view.anchor).toEqual({ column: MAX_SHEET_COLUMNS, row: MAX_SHEET_ROWS });
      expect(resolved.view.offsetX).toBe(35.5);
      expect(resolved.view.offsetY).toBe(12.25);
      expect(rectOf(resolved.view, metrics)).toEqual({ x, y, width: 25, height: 15 });
      expect(canonical(updateResolvedShapeDrawing(resolved, resolved.view, metrics))).toEqual(
        source,
      );
    }
  });
});

describe("canonical inverse editing", () => {
  test("rejects a different metrics snapshot before reinterpreting an appearance-only edit", () => {
    const { sheet, metrics } = fixture();
    const source = framed();
    const resolved = resolveShapeDrawing(source, metrics);
    const beforeSource = structuredClone(source);
    const beforeView = structuredClone(resolved.view);
    (sheet.hiddenColumns ??= new Set()).add(0);
    (sheet.hiddenRows ??= new Set()).add(0);
    const changedMetrics = createPictureSheetMetrics(sheet);
    const edited = { ...resolved.view, rotation: 25 };
    expect(() => updateResolvedShapeDrawing(resolved, edited, changedMetrics)).toThrow(
      /metrics snapshot/,
    );
    expect(source).toEqual(beforeSource);
    expect(resolved.view).toEqual(beforeView);
    expect(edited.rotation).toBe(25);
    const equivalentMetrics = createPictureSheetMetrics(fixture().sheet);
    expect(() => updateResolvedShapeDrawing(resolved, edited, equivalentMetrics)).toThrow(
      /metrics snapshot/,
    );
    expect(source).toEqual(beforeSource);
  });

  test.each(["rotation", "fill", "name", "text"] as const)(
    "%s-only edits preserve collapsed hidden insets without aliasing the source",
    (field) => {
      const { sheet } = fixture();
      sheet.hiddenColumns = new Set([1, 2, 3]);
      sheet.hiddenRows = new Set([1, 2, 3]);
      const metrics = createPictureSheetMetrics(sheet);
      const source = framed();
      const before = structuredClone(source);
      const resolved = resolveShapeDrawing(source, metrics);
      const value = field === "rotation" ? -37 : field === "fill" ? "#112233" : "Edited";
      const next = canonical(
        updateResolvedShapeDrawing(resolved, { ...resolved.view, [field]: value }, metrics),
      );
      expect(next[field]).toBe(value);
      expect(next.shapeFrame).toEqual(source.shapeFrame);
      expect(next.shapeFrame).not.toBe(source.shapeFrame);
      expect(next.shapeFrame.anchor).not.toBe(source.shapeFrame.anchor);
      expect(next.shapeProperties).toEqual(source.shapeProperties);
      expect(next.shapeProperties).not.toBe(source.shapeProperties);
      expectOnlyCanonicalPlacement(next);
      next.shapeProperties!.altTitle = "Candidate";
      if (next.shapeFrame.anchor.mode !== "move-and-size") throw new Error("Unexpected mode");
      next.shapeFrame.anchor.start.column.offset = 999;
      expect(source).toEqual(before);
      expect(resolved.view[field]).toBe(before[field]);
    },
  );

  test("copies supported nested appearance edits and removes absent optional appearance", () => {
    const { metrics } = fixture();
    const source = framed();
    const before = structuredClone(source);
    const resolved = resolveShapeDrawing(source, metrics);
    const nextView = {
      ...resolved.view,
      shapeGeometry: { preset: "roundRect" as const, adjustments: { adj: 30000 } },
      shapeFlipX: true as const,
      shapeStyle: { fill: { kind: "none" as const } },
      shapeText: {
        ...source.shapeText!,
        layout: { ...source.shapeText!.layout, wrap: false },
      },
    };
    const next = canonical(updateResolvedShapeDrawing(resolved, nextView, metrics));
    expect(next.shapeGeometry).toEqual(nextView.shapeGeometry);
    expect(next.shapeGeometry).not.toBe(nextView.shapeGeometry);
    expect(next.shapeFlipX).toBe(true);
    expect(next.shapeStyle).toEqual(nextView.shapeStyle);
    expect(next.shapeStyle).not.toBe(nextView.shapeStyle);
    expect(next.shapeText!.layout.wrap).toBe(false);
    expect(next.shapeText).not.toBe(nextView.shapeText);
    expect(next.shapeFrame).toEqual(source.shapeFrame);
    const projected = resolveShapeDrawing(next, metrics);
    const { shapeStyle: _style, shapeFlipX: _flip, ...plain } = graphicView(projected.view);
    const removed = canonical(updateResolvedShapeDrawing(projected, plain, metrics));
    expect(removed.shapeStyle).toBeUndefined();
    expect(removed.shapeFlipX).toBeUndefined();
    expect(source).toEqual(before);
  });

  test("appearance-only edits retain move-only overflow markers despite display inset clamping", () => {
    const { metrics } = fixture();
    const source = framed({
      mode: "move-only",
      origin: { column: { index: 1, offset: 500 }, row: { index: 1, offset: 200 } },
      size: { width: 40, height: 50 },
    });
    const resolved = resolveShapeDrawing(source, metrics);
    const next = canonical(
      updateResolvedShapeDrawing(resolved, { ...resolved.view, rotation: 33 }, metrics),
    );
    expect(next.shapeFrame).toEqual(source.shapeFrame);
    expect(next.rotation).toBe(33);
  });

  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "%s move and resize inverse preserves its original mode and canonical-only placement",
    (mode) => {
      const { metrics } = fixture();
      const source = framed(
        mode === "fixed"
          ? { mode, x: 97, y: 28, size: { width: 164, height: 73 } }
          : mode === "move-only"
            ? {
                mode,
                origin: { column: { index: 1, offset: 17 }, row: { index: 1, offset: 8 } },
                size: { width: 164, height: 73 },
              }
            : {
                mode,
                start: { column: { index: 1, offset: 17 }, row: { index: 1, offset: 8 } },
                end: { column: { index: 3, offset: 21 }, row: { index: 3, offset: 11 } },
              },
      );
      const before = structuredClone(source);
      const resolved = resolveShapeDrawing(source, metrics);
      const edited = {
        ...resolved.view,
        offsetX: resolved.view.offsetX - 150.25,
        offsetY: resolved.view.offsetY - 48.5,
        width: resolved.view.width + 24.5,
        height: resolved.view.height + 18.25,
        rotation: 19,
      };
      const next = canonical(updateResolvedShapeDrawing(resolved, edited, metrics));
      expect(next.shapeFrame.anchor.mode).toBe(mode);
      expect(resolveShapeFrame(next.shapeFrame, metrics, next.rotation).rect).toEqual(
        rectOf(edited, metrics),
      );
      expect(next.id).toBe(source.id);
      expect(next.kind).toBe(source.kind);
      expect(next.shapeProperties).toEqual(source.shapeProperties);
      expect(next.rotation).toBe(19);
      expectOnlyCanonicalPlacement(next);
      expect(source).toEqual(before);
      expect(resolved.view).not.toEqual(edited);
    },
  );

  test("equivalent physical view origins do not reanchor the original logical markers", () => {
    const { metrics } = fixture();
    const source = framed();
    const resolved = resolveShapeDrawing(source, metrics);
    const edited = {
      ...resolved.view,
      anchor: { row: 0, column: 0 },
      offsetX: resolved.rect.x,
      offsetY: resolved.rect.y,
      name: "Same placement",
    };
    const next = canonical(updateResolvedShapeDrawing(resolved, edited, metrics));
    expect(next.shapeFrame).toEqual(source.shapeFrame);
    expect(next.name).toBe("Same placement");
  });

  test("a geometry resize preserves preferred hidden start markers which still resolve exactly", () => {
    const { sheet } = fixture();
    (sheet.hiddenColumns ??= new Set()).add(1);
    (sheet.hiddenRows ??= new Set()).add(1);
    const metrics = createPictureSheetMetrics(sheet);
    const source = framed();
    const resolved = resolveShapeDrawing(source, metrics);
    const next = canonical(
      updateResolvedShapeDrawing(resolved, { ...resolved.view, width: 120, height: 90 }, metrics),
    );
    if (
      source.shapeFrame.anchor.mode !== "move-and-size" ||
      next.shapeFrame.anchor.mode !== "move-and-size"
    )
      throw new Error("Unexpected mode");
    expect(next.shapeFrame.anchor.start).toEqual(source.shapeFrame.anchor.start);
    expect(resolveShapeFrame(next.shapeFrame, metrics).rect).toEqual({
      ...resolved.rect,
      width: 120,
      height: 90,
    });
  });

  test("tracks geometry changes when the editable view itself was changed in place", () => {
    const { metrics } = fixture();
    const source = framed();
    const before = structuredClone(source);
    const resolved = resolveShapeDrawing(source, metrics);
    const originalRect = { ...resolved.rect };
    resolved.view.offsetX += 25;
    resolved.view.width += 10;
    const next = canonical(updateResolvedShapeDrawing(resolved, resolved.view, metrics));
    expect(resolveShapeFrame(next.shapeFrame, metrics).rect).toEqual({
      ...originalRect,
      x: originalRect.x + 25,
      width: originalRect.width + 10,
    });
    expect(resolved.rect).toEqual(originalRect);
    expect(source).toEqual(before);
  });

  test.each(["shape", "textBox"] as const)(
    "%s identity roundtrips without adding synthetic storage",
    (kind) => {
      const { metrics } = fixture();
      const source = framed(undefined, kind);
      const resolved = resolveShapeDrawing(source, metrics);
      const next = canonical(updateResolvedShapeDrawing(resolved, resolved.view, metrics));
      expect(next).toEqual(source);
      expect(next).not.toBe(source);
      expectOnlyCanonicalPlacement(next);
    },
  );

  test.each([
    "shapeFrame",
    "shapeProperties",
    "frame",
    "source",
    "assetId",
    "members",
    "referenceSize",
    "unknown",
  ])("rejects unsupported view authority %s before any mutation", (key) => {
    const { metrics } = fixture();
    const source = framed();
    const resolved = resolveShapeDrawing(source, metrics);
    const beforeSource = structuredClone(source);
    const beforeView = structuredClone(resolved.view);
    expect(() =>
      updateResolvedShapeDrawing(resolved, { ...resolved.view, [key]: {} }, metrics),
    ).toThrow(/Unsupported/);
    expect(source).toEqual(beforeSource);
    expect(resolved.view).toEqual(beforeView);
  });

  test.each([
    { id: "wrong" },
    { kind: "wordArt" },
    { kind: "chart" },
    { offsetX: NaN },
    { offsetY: Infinity },
    { width: -1 },
    { width: 16385 },
    { height: -1 },
    { height: NaN },
    { width: 0 },
    { anchor: { row: -1, column: 0 } },
    { anchor: { row: 0.5, column: 0 } },
    { anchor: { row: 0, column: MAX_SHEET_COLUMNS + 1 } },
    { fill: "invalid" },
    { rotation: 361 },
    { fontSize: 0 },
    { shapeGeometry: { preset: "unknown" } },
  ])("rejects invalid edited candidates %j without mutating source or original view", (patch) => {
    const { metrics } = fixture();
    const source = framed();
    const resolved = resolveShapeDrawing(source, metrics);
    const beforeSource = structuredClone(source);
    const beforeView = structuredClone(resolved.view);
    const edited = { ...resolved.view, ...patch } as SheetLegacyDrawing;
    const beforeEdit = { ...edited };
    expect(() => updateResolvedShapeDrawing(resolved, edited, metrics)).toThrow();
    expect(source).toEqual(beforeSource);
    expect(resolved.view).toEqual(beforeView);
    expect(edited).toEqual(beforeEdit);
  });

  test("positive subpixel move-size spans remain canonical while explicit fixed/move-only sizes retain their minimum", () => {
    const { metrics } = fixture(),
      source = framed(),
      resolved = resolveShapeDrawing(source, metrics);
    const next = updateResolvedShapeDrawing(
      resolved,
      { ...resolved.view, width: 0.5, height: 0.25 },
      metrics,
    );
    if (!isFramedShapeDrawing(next)) throw new Error("Expected canonical source");
    const rect = resolveShapeFrame(next.shapeFrame, metrics).rect;
    expect(rect.width).toBeCloseTo(0.5);
    expect(rect.height).toBeCloseTo(0.25);
    for (const anchor of [
      { mode: "fixed" as const, x: 80, y: 20, size: { width: 20, height: 20 } },
      {
        mode: "move-only" as const,
        origin: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
        size: { width: 20, height: 20 },
      },
    ]) {
      const current = resolveShapeDrawing(framed(anchor), metrics);
      expect(() =>
        updateResolvedShapeDrawing(current, { ...current.view, width: 0.5 }, metrics),
      ).toThrow();
    }
  });
  test("rejects invalid rect arithmetic and accessors without reading the accessor", () => {
    const { metrics } = fixture();
    const source = framed({ mode: "fixed", x: 1, y: 1, size: { width: 20, height: 20 } });
    const resolved = resolveShapeDrawing(source, metrics);
    expect(() =>
      updateResolvedShapeDrawing(
        resolved,
        { ...resolved.view, offsetX: Number.MAX_VALUE },
        metrics,
      ),
    ).toThrow();
    let reads = 0;
    const edited = { ...resolved.view };
    Object.defineProperty(edited, "width", {
      get: () => {
        reads++;
        return 100;
      },
    });
    expect(() => updateResolvedShapeDrawing(resolved, edited, metrics)).toThrow(/accessors/);
    expect(reads).toBe(0);
    expect(source.shapeFrame.anchor).toEqual({
      mode: "fixed",
      x: 1,
      y: 1,
      size: { width: 20, height: 20 },
    });
  });

  test("legacy edits also reject injected canonical fields and retain the original owner", () => {
    const { metrics } = fixture();
    const source = createGraphicDrawing("legacy", "icon", "Icon", { row: 0, column: 0 });
    const resolved = resolveShapeDrawing(source, metrics);
    const before = structuredClone(source);
    const injected = { ...source, shapeFrame: framed().shapeFrame };
    expect(() => updateResolvedShapeDrawing(resolved, injected, metrics)).toThrow();
    expect(() =>
      updateResolvedShapeDrawing(resolved, { ...source, id: "wrong" }, metrics),
    ).toThrow();
    expect(() =>
      updateResolvedShapeDrawing(resolved, { ...source, kind: "shape" }, metrics),
    ).toThrow();
    expect(source).toEqual(before);
    expect(resolved.source).toBe(source);
    expect(resolved.metrics).toBe(metrics);
    expect(resolved.view).toBe(source);
  });
});
