// @vitest-environment node
import { expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import type { ResolvedShapeFrame, ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { createSheetGeometry, type Rect } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import {
  getShapeGroupFrameFragments,
  getShapeGroupPaintFragments,
} from "../../../modules/sheet-drawings/shape-group-fragments";
import { framedShape } from "./framed-shape-fixture";
import { shapePageFixture } from "./shape-page-fixture";

function group(rect: ShapeFrameRect, metrics: PictureSheetMetrics) {
  const a = framedShape(),
    b = framedShape();
  a.id = "a";
  b.id = "b";
  const root = groupShapeRoots([a, b], ["a", "b"], { id: "g", name: "Group" }, metrics)[0];
  if (!isShapeGroupDrawing(root)) throw new Error("Expected an owned shape group.");
  root.shapeFrame.anchor = {
    mode: "fixed",
    x: rect.x,
    y: rect.y,
    size: { width: rect.width, height: rect.height },
  };
  root.rotation = 37;
  return root;
}

// Compute the rotated corners and rotation-handle clearance independently of
// the projector. An unrotated frame AABB would miss visible outline fragments.
function selectionBounds(frame: ResolvedShapeFrame): Rect {
  const { rect, angleDeg } = frame;
  const angle = (angleDeg * Math.PI) / 180,
    cosine = Math.cos(angle),
    sine = Math.sin(angle),
    cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const points = [
    [0, 0],
    [rect.width, 0],
    [rect.width, rect.height],
    [0, rect.height],
    [rect.width / 2, -24],
  ].map(([x, y]) => ({
    x: cx + (x! - rect.width / 2) * cosine - (y! - rect.height / 2) * sine,
    y: cy + (x! - rect.width / 2) * sine + (y! - rect.height / 2) * cosine,
  }));
  const x = Math.min(...points.map((point) => point.x)) - 8,
    y = Math.min(...points.map((point) => point.y)) - 8;
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) + 8 - x,
    height: Math.max(...points.map((point) => point.y)) + 8 - y,
  };
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y),
    right = Math.min(a.x + a.width, b.x + b.width),
    bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function expectRect(actual: Rect, expected: Rect) {
  for (const axis of ["x", "y", "width", "height"] as const)
    expect(actual[axis]).toBeCloseTo(expected[axis], 9);
}

function frozenFixture(hiddenRows: number[] = [], hiddenColumns: number[] = []) {
  const sheet = getActiveSheet(createWorkbook({ id: "frozen-groups", sheetId: "s" }));
  sheet.defaultColumnWidth = 80;
  sheet.hiddenRows = new Set(hiddenRows);
  sheet.hiddenColumns = new Set(hiddenColumns);
  const metrics = createPictureSheetMetrics(sheet),
    geometry = createSheetGeometry({
      rowCount: 30,
      columnCount: 12,
      rowHeight: 24,
      columnWidth: 80,
      hiddenRows,
      hiddenColumns,
    }),
    rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24, hiddenRows });
  const layout = (scroll = { x: 13, y: 7 }) =>
    createSheetViewportLayout({
      geometry,
      rows,
      freeze: { columns: 2, rows: 3 },
      bodyScrollPosition: scroll,
      viewportSize: { width: 500, height: 400 },
    });
  return { metrics, layout };
}

test("a rotated group outline projects its complete frame into all frozen panes, with pane-owned scroll and clipping", () => {
  const f = frozenFixture(),
    root = group({ x: 80, y: 40, width: 240, height: 160 }, f.metrics),
    before = JSON.stringify(root),
    frame = resolveShapeGroupProjection(root, f.metrics).layout,
    bounds = selectionBounds(frame);
  for (const scroll of [
    { x: 13, y: 7 },
    { x: 70, y: 35 },
  ]) {
    const viewport = f.layout(scroll),
      fragments = getShapeGroupFrameFragments(frame, viewport, f.metrics);
    expect(fragments.map((fragment) => fragment.paneId)).toEqual([
      "topLeft",
      "top",
      "left",
      "body",
    ]);
    for (const fragment of fragments) {
      const translation = {
        x: fragment.paneId === "top" || fragment.paneId === "body" ? -scroll.x : 0,
        y: fragment.paneId === "left" || fragment.paneId === "body" ? -scroll.y : 0,
      };
      expectRect(fragment.rect, {
        ...frame.rect,
        x: frame.rect.x + translation.x,
        y: frame.rect.y + translation.y,
      });
      const clipped = intersection(viewport.panes[fragment.paneId].clip, {
        ...bounds,
        x: bounds.x + translation.x,
        y: bounds.y + translation.y,
      });
      expect(clipped).not.toBeNull();
      expectRect(fragment.clippedRect, clipped!);
      expect(fragment).not.toHaveProperty("pageKey");
      expect(fragment).not.toHaveProperty("pageClip");
    }
  }
  expect(JSON.stringify(root)).toBe(before);
});

test.each([true, false])(
  "rotated group overlays are clipped to actual row/column page bands before and after scroll, whitespace=%s",
  (whiteSpace) => {
    const f = shapePageFixture(whiteSpace),
      first = f.projection.getPage(0, 0)!,
      root = group(
        {
          x: first.sheetRect.x + first.sheetRect.width - 180,
          y: first.sheetRect.y + first.sheetRect.height - 120,
          width: 360,
          height: 240,
        },
        f.metrics,
      ),
      before = JSON.stringify(root),
      frame = resolveShapeGroupProjection(root, f.metrics).layout,
      bounds = selectionBounds(frame);
    for (const viewport of [
      f.viewport,
      f.layout(
        {
          x: first.contentRect.x + first.sheetRect.width - 80,
          y: first.contentRect.y + first.sheetRect.height - 80,
        },
        { width: 550, height: 550 },
      ),
    ]) {
      const scroll = viewport.bodyScrollPosition,
        expected = f.projection
          .getVisiblePages({ ...scroll, ...viewport.viewportSize })
          .flatMap((page) => {
            const sheetX = f.metrics.columns.visiblePrefix(page.range.start.column),
              sheetY = f.metrics.rows.visiblePrefix(page.range.start.row),
              width = Math.min(
                page.contentRect.width,
                f.metrics.columns.visiblePrefix(page.range.end.column + 1) - sheetX,
              ),
              height = Math.min(
                page.contentRect.height,
                f.metrics.rows.visiblePrefix(page.range.end.row + 1) - sheetY,
              ),
              translation = {
                x: page.contentRect.x - sheetX - scroll.x,
                y: page.contentRect.y - sheetY - scroll.y,
              },
              pageClip = intersection(viewport.panes.body.clip, {
                x: page.contentRect.x - scroll.x,
                y: page.contentRect.y - scroll.y,
                width,
                height,
              });
            const clipped =
              pageClip &&
              intersection(pageClip, {
                ...bounds,
                x: bounds.x + translation.x,
                y: bounds.y + translation.y,
              });
            return clipped
              ? [
                  {
                    pageKey: `${page.rowPage}:${page.columnPage}`,
                    translation,
                    pageClip: pageClip!,
                    clipped,
                  },
                ]
              : [];
          }),
        fragments = getShapeGroupFrameFragments(frame, viewport, f.metrics, f.projection);
      expect(expected.map((item) => item.pageKey).sort()).toEqual(["0:0", "0:1", "1:0", "1:1"]);
      expect(fragments.map((fragment) => fragment.pageKey)).toEqual(
        expected.map((item) => item.pageKey),
      );
      for (const [index, fragment] of fragments.entries()) {
        const band = expected[index]!;
        expect(fragment.paneId).toBe("body");
        expectRect(fragment.rect, {
          ...frame.rect,
          x: frame.rect.x + band.translation.x,
          y: frame.rect.y + band.translation.y,
        });
        expectRect(fragment.pageClip!, band.pageClip);
        expectRect(fragment.clippedRect, band.clipped);
      }
    }
    expect(JSON.stringify(root)).toBe(before);
  },
);

test("oversized logical cells do not extend a rotated group overlay into physical paper margins", () => {
  const f = shapePageFixture(true, { firstColumnWidth: 1800 }),
    page = f.projection.getPage(0, 0)!,
    root = group({ x: 80, y: 100, width: 1600, height: 200 }, f.metrics),
    frame = resolveShapeGroupProjection(root, f.metrics).layout,
    fragments = getShapeGroupFrameFragments(frame, f.viewport, f.metrics, f.projection);
  expect(page.sheetRect.width).toBeGreaterThan(page.contentRect.width);
  expect(fragments.map((fragment) => fragment.pageKey)).toEqual(["0:0"]);
  const fragment = fragments[0]!,
    pageClip = {
      ...page.contentRect,
      width: Math.min(page.contentRect.width, page.sheetRect.width),
      height: Math.min(page.contentRect.height, page.sheetRect.height),
    },
    bounds = selectionBounds(frame);
  expectRect(fragment.pageClip!, pageClip);
  expect(fragment.clippedRect.x + fragment.clippedRect.width).toBeLessThanOrEqual(
    page.contentRect.x + page.contentRect.width,
  );
  expect(fragment.clippedRect.y).toBeGreaterThanOrEqual(page.contentRect.y);
  expectRect(
    fragment.clippedRect,
    intersection(pageClip, {
      ...bounds,
      x: bounds.x + page.contentRect.x,
      y: bounds.y + page.contentRect.y,
    })!,
  );
});

test.each(["row", "column"] as const)(
  "a group collapsed by a hidden %s span has no frozen or paper selection overlay",
  (axis) => {
    const f = frozenFixture(axis === "row" ? [0] : [], axis === "column" ? [0] : []),
      root = group({ x: 0, y: 0, width: 80, height: 24 }, f.metrics);
    root.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const frame = resolveShapeGroupProjection(root, f.metrics).layout,
      page = shapePageFixture();
    expect(frame.collapsed).toBe(true);
    expect(getShapeGroupFrameFragments(frame, f.layout(), f.metrics)).toEqual([]);
    expect(getShapeGroupFrameFragments(frame, page.viewport, f.metrics, page.projection)).toEqual(
      [],
    );
  },
);

test("composite ink uses its full rotated overflow in every frozen pane without selection padding", () => {
  const f = frozenFixture();
  const root = group({ x: 80, y: 40, width: 240, height: 160 }, f.metrics);
  const frame = resolveShapeGroupProjection(root, f.metrics).layout;
  const ink = { left: -100, top: -60, right: 400, bottom: 240 };
  const rad = (frame.angleDeg * Math.PI) / 180;
  const points = [
    [ink.left, ink.top],
    [ink.right, ink.top],
    [ink.right, ink.bottom],
    [ink.left, ink.bottom],
  ].map(([x, y]) => ({
    x:
      frame.rect.x +
      frame.rect.width / 2 +
      (x! - frame.rect.width / 2) * Math.cos(rad) -
      (y! - frame.rect.height / 2) * Math.sin(rad),
    y:
      frame.rect.y +
      frame.rect.height / 2 +
      (x! - frame.rect.width / 2) * Math.sin(rad) +
      (y! - frame.rect.height / 2) * Math.cos(rad),
  }));
  const bounds = {
    x: Math.min(...points.map((p) => p.x)),
    y: Math.min(...points.map((p) => p.y)),
    width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  };
  const viewport = f.layout();
  const fragments = getShapeGroupPaintFragments(frame, ink, viewport, f.metrics);
  expect(fragments.map((fragment) => fragment.paneId)).toEqual(["topLeft", "top", "left", "body"]);
  for (const fragment of fragments) {
    const dx = fragment.rect.x - frame.rect.x,
      dy = fragment.rect.y - frame.rect.y;
    expectRect(
      fragment.clippedRect,
      intersection(viewport.panes[fragment.paneId].clip, {
        ...bounds,
        x: bounds.x + dx,
        y: bounds.y + dy,
      })!,
    );
  }
  expect(() =>
    getShapeGroupPaintFragments(frame, { ...ink, right: Infinity }, viewport, f.metrics),
  ).toThrow(/finite coordinate/);
  expect(
    getShapeGroupPaintFragments(
      frame,
      { left: 0, top: 0, right: 0, bottom: 0 },
      viewport,
      f.metrics,
    ),
  ).toEqual([]);
});

test("composite shadow overflow is clipped to paper content bands, never to its own frame", () => {
  const f = shapePageFixture(true),
    first = f.projection.getPage(0, 0)!;
  const root = group(
    { x: first.sheetRect.width - 50, y: first.sheetRect.height - 50, width: 30, height: 30 },
    f.metrics,
  );
  root.rotation = 0;
  const frame = resolveShapeGroupProjection(root, f.metrics).layout;
  const fragments = getShapeGroupPaintFragments(
    frame,
    { left: -10, top: -10, right: 150, bottom: 150 },
    f.viewport,
    f.metrics,
    f.projection,
  );
  expect(fragments.map((fragment) => fragment.pageKey)).toEqual(["0:0", "0:1", "1:0", "1:1"]);
  for (const fragment of fragments) {
    const clip = fragment.pageClip!;
    expect(fragment.clippedRect.x).toBeGreaterThanOrEqual(clip.x);
    expect(fragment.clippedRect.y).toBeGreaterThanOrEqual(clip.y);
    expect(fragment.clippedRect.x + fragment.clippedRect.width).toBeLessThanOrEqual(
      clip.x + clip.width,
    );
    expect(fragment.clippedRect.y + fragment.clippedRect.height).toBeLessThanOrEqual(
      clip.y + clip.height,
    );
  }
});
