import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import PageLayoutRulers, {
  PAGE_LAYOUT_RULER_SIZE,
  createPageLayoutRulerModel,
} from "../../../../modules/page-layout/components/PageLayoutRulers.vue";
import type { PageViewPaintState } from "../../../../modules/page-layout/page-view-types";
import type { SheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";

const state: PageViewPaintState = {
  mode: "page-layout",
  pages: [
    {
      pageNumber: 1,
      paperRect: { x: 0, y: 0, width: 900, height: 1200 },
      contentRect: { x: 70, y: 80, width: 760, height: 1040 },
      sheetRect: { x: 0, y: 0, width: 1, height: 1 },
    },
  ],
  printRect: { x: 0, y: 0, width: 1, height: 1 },
  rowBreaks: [],
  columnBreaks: [],
  pageLabel: (page) => `Page ${page}`,
  millimetresPerUnit: 25.4 / 96,
};

const frame = {
  body: { x: 48, y: 28, width: 500, height: 400 },
  scale: 1,
  layout: {
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 500, height: 400 },
  },
} as unknown as SheetRenderFrame;

describe("PageLayoutRulers", () => {
  test("projects paper margins and the content zero point into both rulers", () => {
    const model = createPageLayoutRulerModel({ state, frame, unit: "mm" });

    expect(model.horizontal.bands[0]).toEqual({ start: 0, end: 70 });
    expect(model.vertical.bands[0]).toEqual({ start: 0, end: 80 });
    expect(model.horizontal.ticks.find((tick) => tick.label === "0")).toMatchObject({
      position: 70,
      major: true,
    });
    expect(model.vertical.ticks.find((tick) => tick.label === "0")).toMatchObject({
      position: 80,
      major: true,
    });
  });

  test("uses the render scale and selected unit for screen positions", () => {
    const scaled = createPageLayoutRulerModel({
      state,
      frame: { ...frame, scale: 2 },
      unit: "cm",
    });

    expect(scaled.horizontal.bands[0]).toEqual({ start: 0, end: 70 });
    expect(scaled.horizontal.ticks.find((tick) => tick.label === "0")?.position).toBe(70);
    expect(scaled.horizontal.ticks.some((tick) => tick.label === "5")).toBe(true);
    expect(scaled.horizontal.ticks.some((tick) => tick.label === "10")).toBe(true);
  });

  test("renders top and left non-interactive ruler strips", () => {
    const wrapper = mount(PageLayoutRulers, {
      props: { state, frame, unit: "mm", label: "Page rulers" },
    });

    expect(wrapper.get("[data-page-layout-rulers]").attributes("role")).toBe("img");
    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("style")).toContain(
      `top: ${frame.body.y - PAGE_LAYOUT_RULER_SIZE}px`,
    );
    expect(wrapper.get('[data-page-ruler="vertical"]').attributes("style")).toContain(
      `left: ${frame.body.x - PAGE_LAYOUT_RULER_SIZE}px`,
    );
    expect(wrapper.findAll(".page-layout-rulers__margin")).toHaveLength(4);
  });
  test("uses print scale only to keep the visual strip and labels proportionate", () => {
    const wrapper = mount(PageLayoutRulers, {
      props: { state, frame, unit: "mm", printScale: 2 },
    });

    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("style")).toContain(
      "height: 13px",
    );
    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("viewBox")).toContain(" 13");
    expect(wrapper.get(".page-layout-rulers__label").attributes("style")).toContain(
      "font-size: 6px",
    );
  });
});
