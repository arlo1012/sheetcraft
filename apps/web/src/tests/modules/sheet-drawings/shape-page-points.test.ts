import { expect, test } from "vitest";
import {
  getShapePageFragments,
  shapePagePointFromViewport,
  projectShapePointToViewport,
} from "../../../modules/sheet-drawings/shape-page-layout";
import { shapeViewLayout } from "../../../modules/sheet-drawings/shape-view-layout";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { framedShape } from "./framed-shape-fixture";
import { shapePageFixture } from "./shape-page-fixture";

test.each([true, false])(
  "content point inverse excludes paper margins and all row/column gaps, whitespace=%s",
  (whiteSpace) => {
    const f = shapePageFixture(whiteSpace),
      first = f.projection.getPage(0, 0)!,
      nextRow = f.projection.getPage(1, 0)!,
      nextColumn = f.projection.getPage(0, 1)!;
    for (const page of [first, nextRow, nextColumn]) {
      const sheetPoint = { x: page.sheetRect.x + 13.25, y: page.sheetRect.y + 20.5 };
      const viewportPoint = f.project(sheetPoint);
      const inverse = shapePagePointFromViewport(
        viewportPoint,
        f.viewport,
        f.projection,
        f.metrics,
      )!.point;
      expect(inverse.x).toBeCloseTo(sheetPoint.x, 10);
      expect(inverse.y).toBeCloseTo(sheetPoint.y, 10);
    }
    expect(
      shapePagePointFromViewport(
        { x: first.contentRect.x - 1, y: first.contentRect.y + 50 },
        f.viewport,
        f.projection,
        f.metrics,
      ),
    ).toBeNull();
    expect(
      shapePagePointFromViewport(
        {
          x: first.contentRect.x + 20,
          y: (first.contentRect.y + first.sheetRect.height + nextRow.contentRect.y) / 2,
        },
        f.viewport,
        f.projection,
        f.metrics,
      ),
    ).toBeNull();
    expect(
      shapePagePointFromViewport(
        {
          x: (first.contentRect.x + first.sheetRect.width + nextColumn.contentRect.x) / 2,
          y: first.contentRect.y + 20,
        },
        f.viewport,
        f.projection,
        f.metrics,
      ),
    ).toBeNull();
    // Half-open edges belong only to a real content band, never the whitespace after a page.
    expect(
      shapePagePointFromViewport(
        { x: first.contentRect.x + first.sheetRect.width, y: first.contentRect.y + 20 },
        f.viewport,
        f.projection,
        f.metrics,
      ),
    ).toBeNull();
  },
);

test("scroll and offscreen/invalid coordinates keep one exact sheet point identity", () => {
  const f = shapePageFixture(),
    page = f.projection.getPage(1, 1)!,
    point = { x: page.sheetRect.x + 23.75, y: page.sheetRect.y + 31.5 };
  const viewport = f.layout(
    { x: page.contentRect.x - 7, y: page.contentRect.y - 9 },
    { width: 600, height: 500 },
  );
  const projected = projectShapePointToViewport(point, viewport, f.projection, f.metrics)!;
  expect(projected.point.x).toBeCloseTo(30.75, 10);
  expect(projected.point.y).toBeCloseTo(40.5, 10);
  const inverse = shapePagePointFromViewport(
    projected.point,
    viewport,
    f.projection,
    f.metrics,
  )!.point;
  expect(inverse.x).toBeCloseTo(point.x, 10);
  expect(inverse.y).toBeCloseTo(point.y, 10);
  expect(
    projectShapePointToViewport({ x: 10, y: 10 }, viewport, f.projection, f.metrics),
  ).toBeNull();
  for (const point of [
    { x: NaN, y: 1 },
    { x: 1, y: Infinity },
    { x: -1, y: 0 },
    { x: 601, y: 40 },
  ])
    expect(shapePagePointFromViewport(point, viewport, f.projection, f.metrics)).toBeNull();
});

test("a shape builder's cell/range/total geometry stays continuous under a paper viewport", () => {
  const f = shapePageFixture(),
    page = f.projection.getPage(1, 1)!,
    continuous = shapeViewLayout(f.viewport, f.metrics);
  const address = { row: page.range.start.row, column: page.range.start.column };
  expect(continuous.getCellRect(address)).toMatchObject({
    x: f.metrics.columns.visiblePrefix(address.column),
    y: f.metrics.rows.visiblePrefix(address.row),
  });
  expect(
    continuous.getRangeRect({
      start: address,
      end: { row: address.row + 1, column: address.column + 1 },
    }),
  ).toMatchObject({ width: 160, height: 48 });
  expect(continuous.getRangeRect({ start: address, end: { row: -1, column: 0 } })).toBeNull();
  expect(continuous.getTotalSize()).toEqual({
    width: f.metrics.columns.visiblePrefix(f.metrics.columns.count),
    height: f.metrics.rows.visiblePrefix(f.metrics.rows.count),
  });
});

test.each([
  { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
  { start: { row: 4, column: 2 }, end: { row: 7, column: 3 } },
])("editable page cells and shape fragments are independent of the print area %j", (printRange) => {
  const f = shapePageFixture(true, { printRange });
  const page = f.projection.getPage(2, 2)!;
  expect(page.pageNumber).toBeUndefined();
  const point = {
    x: f.metrics.columns.visiblePrefix(page.range.start.column) + 20,
    y: f.metrics.rows.visiblePrefix(page.range.start.row) + 20,
  };
  const projected = f.project(point);
  const inverse = shapePagePointFromViewport(projected, f.viewport, f.projection, f.metrics)!.point;
  expect(inverse.x).toBeCloseTo(point.x, 10);
  expect(inverse.y).toBeCloseTo(point.y, 10);
  const source = framedShape();
  source.shapeFrame.anchor = { mode: "fixed", ...point, size: { width: 100, height: 60 } };
  const view = resolveShapeDrawing(source, f.metrics).view;
  expect(
    getShapePageFragments(
      view as Parameters<typeof getShapePageFragments>[0],
      f.viewport,
      f.projection,
      f.metrics,
    ).some((fragment) => fragment.pageKey === "2:2"),
  ).toBe(true);
});

test("oversized logical cells never make physical paper margins editable or drawable", () => {
  const f = shapePageFixture(true, { firstColumnWidth: 1800 });
  const page = f.projection.getPage(0, 0)!;
  const beyond = { x: page.contentRect.x + page.contentRect.width + 5, y: page.contentRect.y + 40 };
  expect(shapePagePointFromViewport(beyond, f.viewport, f.projection, f.metrics)).toBeNull();
  expect(
    projectShapePointToViewport(
      { x: page.contentRect.width + 5, y: 40 },
      f.viewport,
      f.projection,
      f.metrics,
    ),
  ).toBeNull();
  const source = framedShape();
  source.shapeFrame.anchor = { mode: "fixed", x: 80, y: 24, size: { width: 1600, height: 120 } };
  const view = resolveShapeDrawing(source, f.metrics).view;
  for (const fragment of getShapePageFragments(
    view as Parameters<typeof getShapePageFragments>[0],
    f.viewport,
    f.projection,
    f.metrics,
  )) {
    const [r, c] = fragment.pageKey.split(":").map(Number),
      owner = f.projection.getPage(r!, c!)!;
    expect(fragment.pageClip.x + fragment.pageClip.width).toBeLessThanOrEqual(
      owner.contentRect.x + owner.contentRect.width,
    );
  }
});
