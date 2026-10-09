import { mount } from "@vue/test-utils";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import { describe, expect, test } from "vitest";
import PageHeaderFooterOverlay from "../../../../../modules/page-layout/components/PageHeaderFooterOverlay.vue";
import type { PageViewPaintState } from "../../../../../modules/page-layout/page-view-types";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import { createAppI18n } from "../../../../../shared/i18n";

const state: PageViewPaintState = {
  mode: "page-layout",
  pages: [1, 2].map((pageNumber) => ({
    pageNumber,
    paperRect: { x: 0, y: (pageNumber - 1) * 1200, width: 900, height: 1100 },
    contentRect: { x: 70, y: (pageNumber - 1) * 1200 + 80, width: 760, height: 940 },
    sheetRect: { x: 0, y: 0, width: 1, height: 1 },
  })),
  printRect: { x: 0, y: 0, width: 1, height: 1 },
  rowBreaks: [],
  columnBreaks: [],
  pageLabel: (page) => `Page ${page}`,
  millimetresPerUnit: 25.4 / 96,
};
const frame = {
  body: { x: 0, y: 0, width: 900, height: 500 },
  scale: 1,
  layout: { bodyScrollPosition: { x: 0, y: 0 }, viewportSize: { width: 900, height: 500 } },
} as unknown as SheetRenderFrame;

function setup(): SheetPageSetup {
  const value = structuredClone(DEFAULT_SHEET_PAGE_SETUP);
  value.header.center = "Odd";
  value.headerFooter = {
    ...value.headerFooter!,
    differentFirst: true,
    differentOddEven: true,
    firstHeader: { left: "", center: "First", right: "" },
    evenHeader: { left: "", center: "Even", right: "" },
  };
  return value;
}

describe("PageHeaderFooterOverlay", () => {
  test("selects first and even header variants by printed page", async () => {
    const wrapper = mount(PageHeaderFooterOverlay, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, frame, setup: setup(), sheetName: "Sales", disabled: false, pageCount: 2 },
    });
    try {
      const first = wrapper
        .get('[data-paper-number="1"]')
        .get('[data-page-section="header"][data-page-part="center"]');
      expect(first.text()).toBe("First");
      await first.trigger("click");
      expect(wrapper.emitted("open")).toEqual([
        [{ section: "header", part: "center", variant: "first" }],
      ]);
      expect(wrapper.find("textarea").exists()).toBe(false);

      const even = wrapper
        .get('[data-paper-number="2"]')
        .get('[data-page-section="header"][data-page-part="center"]');
      expect(even.text()).toBe("Even");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});

test("anchors a multiline footer above its margin and keeps physical text size when not scaling", () => {
  const pageSetup = setup();
  pageSetup.footer.center = "&20One\nTwo";
  pageSetup.headerFooter = {
    ...pageSetup.headerFooter!,
    scaleWithDocument: false,
    evenFooter: { left: "", center: "&20One\nTwo", right: "" },
  };
  const wrapper = mount(PageHeaderFooterOverlay, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      state: { ...state, uiScale: 2 },
      frame,
      setup: pageSetup,
      sheetName: "Sales",
      disabled: false,
      pageCount: 2,
    },
  });
  try {
    const footer = wrapper.findAll(".page-header-footer-overlay__row")[3]!;
    const rowStyle = String(footer.attributes("style"));
    const top = Number.parseFloat(String(/top:\s*([\d.]+)px/.exec(rowStyle)?.at(1) ?? "0"));
    const height = Number.parseFloat(String(/height:\s*([\d.]+)px/.exec(rowStyle)?.at(1) ?? "0"));
    const bottomMargin = pageSetup.margins.footer / state.millimetresPerUnit;
    expect(top + height + bottomMargin).toBeCloseTo(2300, 4);
    expect(footer.get('[data-page-part="center"] span').attributes("style")).toContain(
      "font-size: 53.333333px",
    );
  } finally {
    wrapper.unmount();
  }
});

test("hides zero or insufficient margin areas without changing any header/footer text", async () => {
  const pageSetup = setup();
  const wrapper = mount(PageHeaderFooterOverlay, {
    global: { plugins: [createAppI18n("en-US")] },
    props: { state, frame, setup: pageSetup, sheetName: "Sales", disabled: false, pageCount: 2 },
  });
  try {
    expect(wrapper.find('[data-page-section-row="header"]').exists()).toBe(true);
    await wrapper.setProps({
      setup: { ...pageSetup, margins: { ...pageSetup.margins, top: 0, header: 0 } },
    });
    expect(wrapper.find('[data-page-section-row="header"]').exists()).toBe(false);
    expect(wrapper.find('[data-page-section-row="footer"]').exists()).toBe(true);
    await wrapper.setProps({ state: { ...state, showWhiteSpace: false } });
    expect(wrapper.find("[data-page-section-row]").exists()).toBe(false);
    await wrapper.setProps({ state, setup: pageSetup });
    expect(wrapper.get('[data-page-section="header"][data-page-part="center"]').text()).toBe(
      "First",
    );
    expect(wrapper.emitted("change")).toBeUndefined();
  } finally {
    wrapper.unmount();
  }
});
