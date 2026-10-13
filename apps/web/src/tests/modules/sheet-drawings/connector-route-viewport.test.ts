import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import {
  resolveShapeConnectorRoute,
  type ReadyShapeConnectorRoute,
} from "@sheetcraft/core/shape-connector-route";
import { createSheet } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  shapeViewAtRect,
  shapeViewLayout,
} from "../../../modules/sheet-drawings/shape-view-layout";
import { getStandardShapeViewportFragments } from "../../../modules/sheet-drawings/standard-shape-layout";
import { getShapePageFragments } from "../../../modules/sheet-drawings/shape-page-layout";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import { createAppI18n } from "../../../shared/i18n";
import { shapePageFixture } from "./shape-page-fixture";

function fixture(begin = { x: 40, y: 80 }, end = { x: 450, y: 300 }, angle = 37) {
  const metrics = createPictureSheetMetrics(createSheet("Route", "route"));
  const carrier = resolvePictureLayout({ x: 700, y: 800, width: 120, height: 90 }, angle);
  const result = resolveShapeConnectorRoute({ preset: "bentConnector3" }, carrier, begin, end);
  if (result.status !== "ready") throw Error("Expected ready route");
  const route: ReadyShapeConnectorRoute = result;
  const drawing = shapeViewAtRect(
    {
      ...createGraphicDrawing("line", "shape", "Line", { row: 0, column: 0 }),
      shapeGeometry: { preset: "bentConnector3" as const },
      shapeLineEnds: { begin: { kind: "triangle" as const }, end: { kind: "triangle" as const } },
      rotation: route.paintLayout.angleDeg,
      text: "",
      width: route.geometry.width,
      height: route.geometry.height,
    },
    route.paintLayout.rect,
    metrics,
  );
  const layout = shapeViewLayout(
    createSheetViewportLayout({
      geometry: createSheetGeometry({
        rowCount: 100,
        columnCount: 30,
        rowHeight: 24,
        columnWidth: 80,
      }),
      rows: createRowVisibilityIndex({ rowCount: 100, defaultRowHeight: 24 }),
      viewportSize: { width: 800, height: 600 },
      freeze: { rows: 2, columns: 1 },
      bodyScrollPosition: { x: 25, y: 36 },
    }),
    metrics,
  );
  return { route, drawing, metrics, layout };
}
describe("exact connector viewport transport", () => {
  test.each([0, 37, 90, -37])(
    "angle %s retains paint placement across frozen/scrolled panes",
    (angle) => {
      const f = fixture(undefined, undefined, angle);
      const fragments = getStandardShapeViewportFragments(
        f.drawing,
        f.layout,
        true,
        false,
        f.route,
      );
      expect(fragments.length).toBeGreaterThan(0);
      for (const fragment of fragments) {
        const translation = getPicturePaneTranslation(fragment.paneId, f.layout);
        expect(fragment.rect.x).toBeCloseTo(f.route.paintLayout.rect.x + translation.x, 9);
        expect(fragment.rect.y).toBeCloseTo(f.route.paintLayout.rect.y + translation.y, 9);
        expect(fragment.rect.width).toBe(f.route.geometry.width);
        expect(fragment.rect.height).toBe(f.route.geometry.height);
        const clip = f.layout.panes[fragment.paneId].clip;
        expect(fragment.clippedRect.x).toBeGreaterThanOrEqual(clip.x);
        expect(fragment.clippedRect.y).toBeGreaterThanOrEqual(clip.y);
        expect(fragment.clippedRect.x + fragment.clippedRect.width).toBeLessThanOrEqual(
          clip.x + clip.width + 1e-8,
        );
        expect(fragment.clippedRect.y + fragment.clippedRect.height).toBeLessThanOrEqual(
          clip.y + clip.height + 1e-8,
        );
      }
    },
  );
  test("selected horizontal route handles sit at true tips inside one-pixel padding", () => {
    const f = fixture({ x: 120, y: 120 }, { x: 240, y: 120 }, 0);
    const fragment = getStandardShapeViewportFragments(
      f.drawing,
      f.layout,
      true,
      false,
      f.route,
    ).find((value) => value.paneId === "body")!;
    const wrapper = mount(StandardShapeSelection, {
      props: {
        drawing: f.drawing,
        connectorRoute: f.route,
        fragment,
        paneClip: f.layout.panes.body.clip,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.findAll("[data-shape-endpoint]")).toHaveLength(2);
      for (const index of [0, 1] as const) {
        const expected = shapeFrameLocalToWorld(fragment.rect, 0, f.route.localEndpoints[index]);
        const element = wrapper.get(`[data-shape-endpoint="${index}"]`).element as HTMLElement;
        expect(Number.parseFloat(element.style.left)).toBeCloseTo(
          expected.x - fragment.clippedRect.x,
          10,
        );
        expect(Number.parseFloat(element.style.top)).toBeCloseTo(
          expected.y - fragment.clippedRect.y,
          10,
        );
      }
      expect(wrapper.findAll("[data-shape-resize]")).toHaveLength(0);
    } finally {
      wrapper.unmount();
    }
  });
  test("page fragments translate the same route rather than paper whitespace or carrier endpoints", () => {
    const page = shapePageFixture();
    const f = fixture({ x: 120, y: 120 }, { x: 240, y: 1600 }, 37);
    const view = shapeViewAtRect(f.drawing, f.route.paintLayout.rect, page.metrics);
    const fragments = getShapePageFragments(
      view,
      page.viewport,
      page.projection,
      page.metrics,
      true,
      f.route,
    );
    expect(new Set(fragments.map((value) => value.pageKey)).size).toBeGreaterThan(1);
    for (const fragment of fragments) {
      expect(fragment.rect.width).toBe(f.route.geometry.width);
      expect(fragment.rect.height).toBe(f.route.geometry.height);
      expect(fragment.clippedRect.x).toBeGreaterThanOrEqual(fragment.pageClip.x);
      expect(fragment.clippedRect.y).toBeGreaterThanOrEqual(fragment.pageClip.y);
      expect(fragment.clippedRect.y + fragment.clippedRect.height).toBeLessThanOrEqual(
        fragment.pageClip.y + fragment.pageClip.height + 1e-8,
      );
    }
  });
  test("a route paired with a stale paint frame is rejected before fragment admission", () => {
    const f = fixture();
    expect(() =>
      getStandardShapeViewportFragments(
        { ...f.drawing, width: f.drawing.width + 1 },
        f.layout,
        true,
        false,
        f.route,
      ),
    ).toThrow(/exact|matching|geometry|frame/i);
  });
});
