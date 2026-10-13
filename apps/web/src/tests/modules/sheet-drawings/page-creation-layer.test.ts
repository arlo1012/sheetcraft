import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSheetGeometry, type Point } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetPagination,
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
} from "@sheetcraft/sheet-engine/page-layout";
import SheetShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetShapeCreationLayer.vue";
import SheetFreeShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetFreeShapeCreationLayer.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import type {
  ShapeCreationRequest,
  ShapeCreationDraft,
} from "../../../modules/sheet-drawings/useShapeCreation";
import { createAppI18n } from "../../../shared/i18n";

function legacyDraft(drawing: ShapeCreationDraft) {
  if (!("anchor" in drawing)) throw new Error("Expected unchanged static shape fixture.");
  return drawing;
}
type Tool = "shape" | "textBox" | "curve" | "freeform" | "scribble";
const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});
const drawingContent = defineComponent({
  props: ["drawing"],
  setup: () => () => h("div", { "data-creation-preview": "" }),
});
function fixture(
  tool: Tool = "shape",
  scale = 1,
  scroll = { x: 0, y: 0 },
  printScope: "full" | "blank" = "full",
) {
  const workbook = createWorkbook({ id: "paged-book", sheetId: "paged-sheet" });
  const sheet = getActiveSheet(workbook);
  const metrics = createPictureSheetMetrics(sheet);
  const geometry = createSheetGeometry({
    rowCount: 120,
    columnCount: 20,
    rowHeight: 24,
    columnWidth: 96,
  });
  const rows = createRowVisibilityIndex({ rowCount: 120, defaultRowHeight: 24 });
  const pagination = createSheetPagination({
    geometry,
    rows,
    setup: DEFAULT_SHEET_PAGE_SETUP,
    printRange: {
      start: { row: 0, column: 0 },
      end: printScope === "blank" ? { row: 0, column: 0 } : { row: 119, column: 19 },
    },
    layoutRange: { start: { row: 0, column: 0 }, end: { row: 119, column: 19 } },
  });
  const projectionOptions = { geometry, rows, pagination, pagePadding: 12 };
  const projection = createPageLayoutProjection(projectionOptions);
  const viewport = createPageLayoutViewportLayout({
    ...projectionOptions,
    viewportSize: { width: 1900, height: 2400 },
    bodyScrollPosition: scroll,
  });
  const choice = SHAPE_GALLERY.flatMap((group) => group.items).find((item) =>
    tool === "shape"
      ? item.kind === "preset" && item.preset === "rect"
      : tool === "textBox"
        ? item.kind === "textBox" && item.direction === "horizontal"
        : item.kind === "drawingTool" && item.tool === tool,
  )!;
  const request: ShapeCreationRequest = {
    workbook,
    sheet,
    requestId: 1,
    revision: 1,
    choice,
    continuous: false,
    base: createGraphicDrawing("paged-new", tool === "textBox" ? "textBox" : "shape", tool, {
      row: 0,
      column: 0,
    }),
  };
  const commit = vi.fn((_request: ShapeCreationRequest, _drawing: ShapeCreationDraft) => true);
  const cancel = vi.fn();
  const props = {
    request,
    layout: viewport,
    metrics,
    pageProjection: projection,
    scale,
    revision: 1,
    readOnly: false,
    commit,
    cancel,
  };
  const options = {
    attachTo: document.body,
    props,
    global: { plugins: [createAppI18n("en-US")], stubs: { DrawingContent: drawingContent } },
  };
  const w =
    tool === "shape" || tool === "textBox"
      ? mount(SheetShapeCreationLayer, options)
      : mount(SheetFreeShapeCreationLayer, options);
  cleanup.push(() => w.unmount());
  const el = w.element as HTMLElement;
  const origin = { x: 70, y: 30 };
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
    new DOMRect(origin.x, origin.y, 1900 * scale, 2400 * scale),
  );
  const paperPoint = (rowPage = 0, columnPage = 0, x = 50, y = 50): Point => {
    const page = projection.getPage(rowPage, columnPage)!;
    return { x: page.contentRect.x + x, y: page.contentRect.y + y };
  };
  const sheetPoint = (paper: Point): Point => {
    const page = projection
      .getVisiblePages({ ...paper, width: 0.001, height: 0.001 })
      .find(
        (value) =>
          paper.x >= value.contentRect.x &&
          paper.y >= value.contentRect.y &&
          paper.x <
            value.contentRect.x +
              metrics.columns.visiblePrefix(value.range.end.column + 1) -
              metrics.columns.visiblePrefix(value.range.start.column) &&
          paper.y <
            value.contentRect.y +
              metrics.rows.visiblePrefix(value.range.end.row + 1) -
              metrics.rows.visiblePrefix(value.range.start.row),
      )!;
    return {
      x: metrics.columns.visiblePrefix(page.range.start.column) + paper.x - page.contentRect.x,
      y: metrics.rows.visiblePrefix(page.range.start.row) + paper.y - page.contentRect.y,
    };
  };
  const event = (type: string, paper: Point) => {
    const value = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: origin.x + (paper.x - scroll.x) * scale,
      clientY: origin.y + (paper.y - scroll.y) * scale,
      detail: 1,
    });
    Object.defineProperty(value, "pointerId", { value: 7 });
    return value;
  };
  const down = (paper: Point) => el.dispatchEvent(event("pointerdown", paper));
  const move = (paper: Point) => window.dispatchEvent(event("pointermove", paper));
  const up = (paper: Point) => window.dispatchEvent(event("pointerup", paper));
  const click = (paper: Point) => {
    down(paper);
    up(paper);
  };
  const firstPage = projection.getPage(0, 0)!;
  const nextPage = projection.getPage(1, 0)!;
  const margin = { x: firstPage.paperRect.x + 1, y: paperPoint().y };
  const gap = {
    x: paperPoint().x,
    y: (firstPage.paperRect.y + firstPage.paperRect.height + nextPage.paperRect.y) / 2,
  };
  return {
    w,
    el,
    props,
    commit,
    cancel,
    metrics,
    projection,
    projectionOptions,
    viewport,
    scroll,
    paperPoint,
    sheetPoint,
    event,
    down,
    move,
    up,
    click,
    margin,
    gap,
  };
}
function finish(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

describe("page-layout canvas shape creation", () => {
  test.each(["shape", "textBox"] as const)(
    "%s crosses content pages using continuous sheet distance and clips each preview page",
    async (tool) => {
      const f = fixture(tool, 2, { x: 20, y: 40 });
      const start = f.paperPoint(0, 0, 50, 50);
      const end = f.paperPoint(1, 1, 120, 140);
      const a = f.sheetPoint(start),
        b = f.sheetPoint(end);
      f.down(start);
      f.move(end);
      await nextTick();
      const fragments = f.w.findAll(`[class="shape-creation-layer__fragment"]`);
      expect(fragments.length).toBeGreaterThan(1);
      const distinctPositions = new Set(
        fragments.map(
          (fragment) =>
            `${(fragment.element as HTMLElement).style.left},${(fragment.element as HTMLElement).style.top}`,
        ),
      );
      expect(distinctPositions.size).toBe(fragments.length);
      f.up(end);
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(legacyDraft(f.commit.mock.calls[0]![1]).width).toBeCloseTo(b.x - a.x);
      expect(legacyDraft(f.commit.mock.calls[0]![1]).height).toBeCloseTo(b.y - a.y);
      expect(legacyDraft(f.commit.mock.calls[0]![1]).anchor).toEqual({ column: 0, row: 2 });
    },
  );
  test.each(["margin", "gap"] as const)(
    "%s rejects starting and clears a valid preview on release without committing it",
    async (location) => {
      const f = fixture();
      f.down(f[location]);
      f.up(f.paperPoint(0, 0, 200, 200));
      expect(f.commit).not.toHaveBeenCalled();
      f.down(f.paperPoint());
      f.move(f.paperPoint(1, 0, 200, 200));
      await nextTick();
      expect(f.w.find("[data-creation-preview]").exists()).toBe(true);
      f.up(f[location]);
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.w.find("[data-creation-preview]").exists()).toBe(false);
      expect(f.w.get('[role="status"]').text()).toContain("cannot be drawn");
    },
  );
  test("an invalid move can return to a later content band without retaining paper gap distance", async () => {
    const f = fixture();
    const start = f.paperPoint();
    const end = f.paperPoint(1, 0, 150, 150);
    f.down(start);
    f.move(f.gap);
    await nextTick();
    expect(f.w.find("[data-creation-preview]").exists()).toBe(false);
    f.up(end);
    const a = f.sheetPoint(start),
      b = f.sheetPoint(end);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).height).toBeCloseTo(b.y - a.y);
  });
  test.each(["shape", "textBox"] as const)(
    "%s starts and previews on blank editable cells beyond an A1-only print range",
    async (tool) => {
      const f = fixture(tool, 1, { x: 0, y: 0 }, "blank");
      const start = f.paperPoint(0, 0, 200, 200);
      const end = f.paperPoint(1, 0, 250, 250);
      f.down(start);
      f.move(end);
      await nextTick();
      expect(f.w.findAll(".shape-creation-layer__fragment").length).toBeGreaterThan(1);
      f.up(end);
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(legacyDraft(f.commit.mock.calls[0]![1]).anchor).toEqual({ column: 2, row: 8 });
      expect(legacyDraft(f.commit.mock.calls[0]![1]).height).toBeCloseTo(
        f.sheetPoint(end).y - f.sheetPoint(start).y,
      );
    },
  );
  test("a thrown insertion preserves the paged preview and retries the exact drawing", async () => {
    const f = fixture();
    f.commit.mockImplementationOnce(() => {
      throw new Error("rejected");
    });
    f.down(f.paperPoint());
    f.up(f.paperPoint(1, 0, 150, 150));
    await nextTick();
    const value = legacyDraft(f.commit.mock.calls[0]![1]);
    expect(f.w.find("[data-creation-preview]").exists()).toBe(true);
    expect(f.w.get('[role="status"]').text()).toContain("preserved");
    const retry = f.w.findAll("button").find((button) => button.text() === "Retry insertion")!;
    await retry.trigger("click");
    expect(f.commit.mock.calls[1]![1]).toBe(value);
  });
});

describe("page-layout free-drawing creation", () => {
  test.each(["curve", "freeform"] as const)(
    "%s places multipoint nodes and the first-node marker in their real page bands",
    async (tool) => {
      const f = fixture(tool, 2, { x: 20, y: 40 });
      const first = f.paperPoint(1, 0, 50, 60);
      const second = f.paperPoint(1, 1, 120, 140);
      f.click(first);
      await nextTick();
      const marker = f.w.get(".free-shape-creation-layer__nodes");
      const circle = marker.get("circle");
      expect(
        parseFloat((marker.element as SVGElement).style.left) + Number(circle.attributes("cx")),
      ).toBeCloseTo(first.x - f.scroll.x);
      expect(
        parseFloat((marker.element as SVGElement).style.top) + Number(circle.attributes("cy")),
      ).toBeCloseTo(first.y - f.scroll.y);
      f.click(second);
      await nextTick();
      expect(f.w.findAll(".free-shape-creation-layer__fragment").length).toBeGreaterThan(1);
      finish(f.el);
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(legacyDraft(f.commit.mock.calls[0]![1]).anchor.row).toBe(
        Math.floor(f.sheetPoint(first).y / 24),
      );
      expect(legacyDraft(f.commit.mock.calls[0]![1]).shapePath?.commands.length).toBe(2);
    },
  );
  test.each(["freeform", "scribble"] as const)(
    "%s maps coalesced cross-page samples and omits whitespace samples",
    async (tool) => {
      const f = fixture(tool);
      const start = f.paperPoint(0, 0, 50, 50);
      const end = f.paperPoint(1, 0, 150, 140);
      f.down(start);
      const motion = f.event("pointermove", end);
      Object.defineProperty(motion, "getCoalescedEvents", {
        value: () => [
          f.event("pointermove", f.gap),
          f.event("pointermove", f.paperPoint(1, 0, 100, 100)),
        ],
      });
      window.dispatchEvent(motion);
      f.up(end);
      if (tool !== "scribble") finish(f.el);
      await nextTick();
      expect(f.commit).toHaveBeenCalledTimes(1);
      const value = legacyDraft(f.commit.mock.calls[0]![1]);
      const a = f.sheetPoint(start),
        b = f.sheetPoint(end);
      expect(value.width).toBeCloseTo(b.x - a.x);
      expect(value.height).toBeCloseTo(b.y - a.y);
      expect(value.shapePath?.commands).toHaveLength(3);
    },
  );
  test.each(["margin", "gap"] as const)(
    "a scribble released in a %s discards its incomplete stroke",
    async (location) => {
      const f = fixture("scribble");
      f.down(f.paperPoint());
      f.move(f.paperPoint(1, 0, 150, 150));
      f.up(f[location]);
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.el.dataset.freeShapePoints).toBe("0");
      expect(f.w.find("[data-creation-preview]").exists()).toBe(false);
    },
  );
  test("a gap release rolls back the latest freeform gesture, preserving only earlier click vertices", async () => {
    const f = fixture("freeform");
    f.click(f.paperPoint());
    f.click(f.paperPoint(0, 0, 150, 120));
    f.down(f.paperPoint(0, 0, 180, 180));
    f.move(f.paperPoint(1, 0, 220, 240));
    f.up(f.gap);
    await nextTick();
    expect(f.el.dataset.freeShapePoints).toBe("2");
    expect(f.commit).not.toHaveBeenCalled();
    finish(f.el);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).width).toBeCloseTo(100);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).height).toBeCloseTo(70);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).shapePath?.commands).toHaveLength(2);
  });
  test("nearby continuous points on opposite page edges do not close the first node", async () => {
    const f = fixture("freeform");
    const firstPage = f.projection.getPage(0, 0)!;
    const lastRow = firstPage.range.end.row;
    const first = f.paperPoint(
      0,
      0,
      50,
      f.metrics.rows.visiblePrefix(lastRow + 1) -
        f.metrics.rows.visiblePrefix(firstPage.range.start.row) -
        2,
    );
    f.click(first);
    f.click(f.paperPoint(0, 0, 200, 200));
    f.click(f.paperPoint(0, 0, 250, 250));
    f.click(f.paperPoint(1, 0, 50, 2));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.el.dataset.freeShapePoints).toBe("4");
  });
  test("double-click completion does not deduplicate nearby continuous nodes from separate pages", async () => {
    const f = fixture("freeform");
    const firstPage = f.projection.getPage(0, 0)!;
    const bottom =
      f.metrics.rows.visiblePrefix(firstPage.range.end.row + 1) -
      f.metrics.rows.visiblePrefix(firstPage.range.start.row);
    f.click(f.paperPoint(0, 0, 200, 200));
    f.click(f.paperPoint(0, 0, 50, bottom - 2));
    const end = f.paperPoint(1, 0, 50, 2);
    f.click(end);
    f.el.dispatchEvent(f.event("dblclick", end));
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).shapePath?.commands).toHaveLength(3);
  });
  test("freeform nodes on blank layout-only pages project outside the print range", async () => {
    const f = fixture("freeform", 1, { x: 0, y: 0 }, "blank");
    const first = f.paperPoint(1, 0, 150, 100);
    f.click(first);
    await nextTick();
    const marker = f.w.get(".free-shape-creation-layer__nodes");
    const circle = marker.get("circle");
    expect(
      parseFloat((marker.element as SVGElement).style.top) + Number(circle.attributes("cy")),
    ).toBeCloseTo(first.y);
    f.click(f.paperPoint(1, 0, 250, 200));
    finish(f.el);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(legacyDraft(f.commit.mock.calls[0]![1]).anchor.row).toBe(
      Math.floor(f.sheetPoint(first).y / 24),
    );
  });
  test("double-clicking paper whitespace cannot finish an existing valid freeform draft", async () => {
    const f = fixture("freeform");
    f.click(f.paperPoint());
    f.click(f.paperPoint(0, 0, 150, 120));
    f.el.dispatchEvent(f.event("dblclick", f.gap));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
  });
});

describe("page-layout creation leases", () => {
  test.each(["shape", "freeform"] as const)(
    "%s safely refuses a projection without its continuous metrics",
    async (tool) => {
      const f = fixture(tool);
      await f.w.setProps({ metrics: undefined });
      f.down(f.paperPoint());
      f.up(f.paperPoint(1, 0, 150, 150));
      if (tool === "freeform") finish(f.el);
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.w.find("[data-creation-preview]").exists()).toBe(false);
    },
  );
  test.each([
    ["shape", "metrics"],
    ["shape", "projection"],
    ["freeform", "metrics"],
    ["freeform", "projection"],
  ] as const)("%s cancels a draft when %s identity changes", async (tool, changed) => {
    const f = fixture(tool);
    f.down(f.paperPoint());
    f.move(f.paperPoint(1, 0, 150, 150));
    await nextTick();
    expect(f.w.find("[data-creation-preview]").exists()).toBe(true);
    if (changed === "metrics") await f.w.setProps({ metrics: { ...f.metrics } });
    else await f.w.setProps({ pageProjection: createPageLayoutProjection(f.projectionOptions) });
    f.up(f.paperPoint(1, 0, 150, 150));
    if (tool === "freeform") finish(f.el);
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.w.find("[data-creation-preview]").exists()).toBe(false);
  });
});
