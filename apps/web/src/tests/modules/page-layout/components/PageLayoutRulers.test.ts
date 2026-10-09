import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import PageLayoutRulers, {
  createPageLayoutRulerModel,
} from "../../../../modules/page-layout/components/PageLayoutRulers.vue";
import type { PageViewPaintState } from "../../../../modules/page-layout/page-view-types";
import type { SheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import { createAppI18n } from "../../../../shared/i18n";

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

    expect(model.horizontal.bands[0]).toMatchObject({ start: 0, end: 70 });
    expect(model.vertical.bands[0]).toMatchObject({ start: 0, end: 80 });
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

    expect(scaled.horizontal.bands[0]).toMatchObject({ start: 0, end: 70 });
    expect(scaled.horizontal.ticks.find((tick) => tick.label === "0")?.position).toBe(70);
    expect(scaled.horizontal.ticks.some((tick) => tick.label === "5")).toBe(true);
    expect(scaled.horizontal.ticks.some((tick) => tick.label === "10")).toBe(true);
  });

  test("never projects negative or minor ticks into the page gap", () => {
    const firstPage = state.pages[0]!;
    const gapped = {
      ...state,
      pages: [
        {
          ...firstPage,
          paperRect: { ...firstPage.paperRect, x: 100 },
          contentRect: { ...firstPage.contentRect, x: 170 },
        },
      ],
    };
    const model = createPageLayoutRulerModel({ state: gapped, frame, unit: "mm" });

    expect(model.horizontal.ticks.every((tick) => tick.position >= 100)).toBe(true);
  });

  test("renders ruler strips in the outer top and left lanes", () => {
    const wrapper = mount(PageLayoutRulers, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, frame, setup: DEFAULT_SHEET_PAGE_SETUP, unit: "mm", label: "Page rulers" },
    });

    expect(wrapper.get("[data-page-layout-rulers]").attributes("role")).toBe("group");
    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("style")).toContain("top: 0px");
    expect(wrapper.get('[data-page-ruler="vertical"]').attributes("style")).toContain("left: 0px");
    expect(wrapper.findAll(".page-layout-rulers__margin")).toHaveLength(4);
  });
  test("uses print scale only to keep the visual strip and labels proportionate", () => {
    const wrapper = mount(PageLayoutRulers, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, frame, setup: DEFAULT_SHEET_PAGE_SETUP, unit: "mm", printScale: 2 },
    });

    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("style")).toContain(
      "height: 9px",
    );
    expect(wrapper.get('[data-page-ruler="horizontal"]').attributes("viewBox")).toContain(" 9");
    expect(wrapper.get(".page-layout-rulers__label").attributes("style")).toContain(
      "font-size: 4.5px",
    );
  });

  test("shows localized drag value and hides vertical markers with collapsed white space", () => {
    const wrapper = mount(PageLayoutRulers, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        state: { ...state, showWhiteSpace: false },
        frame,
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          margins: { ...DEFAULT_SHEET_PAGE_SETUP.margins, left: 11.6 },
        },
        unit: "cm",
        activeMargin: "left",
        dragPoint: { x: 20, y: 20 },
      },
    });

    expect(wrapper.get("[data-page-margin-value]").text()).toBe("1.16 Centimetres");
    expect(wrapper.find('[data-page-ruler-margin="top"]').exists()).toBe(false);
    expect(wrapper.get('[data-page-ruler-margin="left"]').classes()).toContain(
      "page-layout-rulers__marker",
    );
  });

  test("exposes a visible-page bottom handle and adjusts it from the keyboard", async () => {
    const compact = {
      ...state,
      pages: [
        {
          ...state.pages[0]!,
          paperRect: { ...state.pages[0]!.paperRect, height: 300 },
          contentRect: { ...state.pages[0]!.contentRect, height: 140 },
        },
      ],
    };
    const wrapper = mount(PageLayoutRulers, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state: compact, frame, setup: DEFAULT_SHEET_PAGE_SETUP, unit: "mm" },
    });

    const bottom = wrapper.get('[data-page-ruler-margin="bottom"]');
    await bottom.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.emitted("marginAdjust")?.[0]?.[0]).toMatchObject({ margin: "bottom" });
  });

  test("falls back to the first visible page when the selected page is offscreen", () => {
    const pages = [
      { ...state.pages[0]!, paperRect: { ...state.pages[0]!.paperRect, height: 300 } },
      {
        ...state.pages[0]!,
        pageNumber: 2,
        paperRect: { ...state.pages[0]!.paperRect, y: 600, height: 300 },
        contentRect: { ...state.pages[0]!.contentRect, y: 680, height: 140 },
      },
    ];
    const wrapper = mount(PageLayoutRulers, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        state: { ...state, pages },
        frame: {
          ...frame,
          layout: {
            ...frame.layout,
            getRangeFragments: () => [
              { paneId: "body", rect: { x: 0, y: 900, width: 1, height: 1 } },
            ],
          },
        },
        setup: DEFAULT_SHEET_PAGE_SETUP,
        unit: "mm",
        selection: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
    });

    expect(wrapper.get('[data-page-ruler-margin="top"]').attributes("style")).toContain("top: 95");
  });
});
