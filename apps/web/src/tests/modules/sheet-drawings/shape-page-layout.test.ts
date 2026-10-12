import { mount } from "@vue/test-utils";
import { defineComponent, h, onMounted, onBeforeUnmount } from "vue";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetPagination,
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
} from "@sheetcraft/sheet-engine/page-layout";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { getShapePageFragments } from "../../../modules/sheet-drawings/shape-page-layout";
import { framedShape } from "./framed-shape-fixture";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
vi.mock("../../../modules/sheet-drawings/shape-detailed-presentation", async (original) => ({
  ...(await original<
    typeof import("../../../modules/sheet-drawings/shape-detailed-presentation")
  >()),
  detailedShapeContainsWorldPoint: (
    _drawing: unknown,
    _rect: unknown,
    _point: unknown,
    presentation: { valid?: boolean } | undefined,
  ) => presentation?.valid === true,
}));
function fixture() {
  const sheet = getActiveSheet(createWorkbook({ id: "book", sheetId: "sheet" }));
  const metrics = createPictureSheetMetrics(sheet);
  const geometry = createSheetGeometry({
    rowCount: 140,
    columnCount: 10,
    rowHeight: 24,
    columnWidth: 80,
  });
  const rows = createRowVisibilityIndex({ rowCount: 140, defaultRowHeight: 24 });
  const pagination = createSheetPagination({
    geometry,
    rows,
    setup: DEFAULT_SHEET_PAGE_SETUP,
    printRange: { start: { row: 0, column: 0 }, end: { row: 139, column: 9 } },
  });
  const projection = createPageLayoutProjection({ geometry, rows, pagination, pagePadding: 12 });
  const layout = (y = 0, height = 1700) =>
    createPageLayoutViewportLayout({
      geometry,
      rows,
      pagination,
      pagePadding: 12,
      viewportSize: { width: 900, height },
      bodyScrollPosition: { x: 0, y },
    });
  const source = framedShape();
  source.shapeFrame.anchor = { mode: "fixed", x: 80, y: 100, size: { width: 240, height: 2000 } };
  const resolved = resolveShapeDrawing(source, metrics);
  return { sheet, metrics, geometry, rows, pagination, projection, layout, source, resolved };
}
test.each(["shape", "textBox"] as const)(
  "plain canonical %s is clipped to every visible paper band without changing legacy appearance",
  (kind) => {
    const f = fixture();
    f.source.kind = kind;
    delete f.source.shapeGeometry;
    delete f.source.shapeText;
    delete f.source.shapeStyle;
    const resolved = resolveShapeDrawing(f.source, f.metrics),
      before = JSON.stringify(f.source);
    const fragments = getShapePageFragments(
      resolved.view as Parameters<typeof getShapePageFragments>[0],
      f.layout(),
      f.projection,
      f.metrics,
    );
    expect(fragments.length).toBeGreaterThan(1);
    expect(new Set(fragments.map((p) => p.pageKey)).size).toBe(fragments.length);
    for (const fragment of fragments) {
      const [rowPage, columnPage] = fragment.pageKey.split(":").map(Number);
      const page = f.projection.getPage(rowPage!, columnPage!)!;
      expect(fragment.clippedRect.x).toBeGreaterThanOrEqual(page.contentRect.x);
      expect(fragment.clippedRect.y).toBeGreaterThanOrEqual(page.contentRect.y);
      expect(fragment.clippedRect.x + fragment.clippedRect.width).toBeLessThanOrEqual(
        page.contentRect.x + page.sheetRect.width + 1e-7,
      );
      expect(fragment.clippedRect.y + fragment.clippedRect.height).toBeLessThanOrEqual(
        page.contentRect.y + page.sheetRect.height + 1e-7,
      );
    }
    expect(JSON.stringify(f.source)).toBe(before);
  },
);
test("transparent plain textbox text participates in paper-band visibility", () => {
  const f = fixture();
  f.source.kind = "textBox";
  f.source.text = "Visible";
  f.source.fill = "transparent";
  f.source.strokeWidth = 0;
  delete f.source.shapeGeometry;
  delete f.source.shapeText;
  const resolved = resolveShapeDrawing(f.source, f.metrics);
  expect(
    getShapePageFragments(
      resolved.view as Parameters<typeof getShapePageFragments>[0],
      f.layout(),
      f.projection,
      f.metrics,
    ),
  ).toHaveLength(2);
});
test("a released paper-fragment canvas cannot replace another page's hit presentation", async () => {
  const f = fixture();
  f.source.shapeStyle = {
    fill: {
      kind: "value",
      value: { kind: "solid", color: { kind: "rgb", rgb: "#abcdef" }, opacity: 1 },
    },
  };
  const content = defineComponent({
    props: ["drawing"],
    emits: ["detailedPaint"],
    setup(props, { emit }) {
      const presentation = { drawing: props.drawing, valid: true };
      onMounted(() => emit("detailedPaint", presentation));
      onBeforeUnmount(() => {
        presentation.valid = false;
        emit("detailedPaint", undefined);
      });
      return () => h("div", { class: "body-test" });
    },
  });
  const wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: [f.source],
      sheet: f.sheet,
      metrics: f.metrics,
      pageProjection: f.projection,
      layout: f.layout(),
      scale: 1,
      readOnly: false,
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { DrawingContent: content } },
  });
  try {
    expect(wrapper.findAll("[data-sheet-drawing-id]")).toHaveLength(2);
    // The last painted page is released while an earlier page still remains visible.
    await wrapper.setProps({ layout: f.layout(0, 600) });
    const remaining = wrapper.findAll("[data-sheet-drawing-id]");
    expect(remaining.length).toBeGreaterThan(0);
    await remaining[0]!.trigger("pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 300,
      pointerId: 1,
    });
    expect(wrapper.emitted("selectionChange")?.at(-1)?.[0]).toBe(f.source.id);
    expect(wrapper.emitted("update")).toBeUndefined();
  } finally {
    wrapper.unmount();
  }
});
