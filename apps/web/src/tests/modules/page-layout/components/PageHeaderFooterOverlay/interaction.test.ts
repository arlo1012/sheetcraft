import { mount } from "@vue/test-utils";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@idea10/core/page-setup";
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
      const input = wrapper
        .get('[data-paper-number="1"]')
        .get('[data-page-section="header"][data-page-part="center"] textarea')
        .element as HTMLTextAreaElement;
      expect(input.value).toBe("First");

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
    const height = Number.parseFloat(
      String(/min-height:\s*([\d.]+)px/.exec(rowStyle)?.at(1) ?? "0"),
    );
    const bottomMargin = pageSetup.margins.footer / state.millimetresPerUnit;
    expect(top + height + bottomMargin).toBeCloseTo(2300, 4);
    expect(footer.get('[data-page-part="center"] span').attributes("style")).toContain(
      "font-size: 53.333333px",
    );
  } finally {
    wrapper.unmount();
  }
});

test("keeps the second field toolbar context when an earlier blur finishes late", async () => {
  const wrapper = mount(PageHeaderFooterOverlay, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { state, frame, setup: setup(), sheetName: "Sales", disabled: false, pageCount: 2 },
  });
  try {
    const first = wrapper
      .get('[data-paper-number="1"]')
      .get('[data-page-section="header"][data-page-part="center"]');
    await first.trigger("click");
    const firstInput = wrapper
      .get('[data-paper-number="1"]')
      .get('[data-page-section="header"][data-page-part="center"] textarea');
    await firstInput.setValue("Draft first");
    await firstInput.trigger("blur", { relatedTarget: null });

    const second = wrapper
      .get('[data-paper-number="2"]')
      .get('[data-page-section="header"][data-page-part="center"]');
    await second.trigger("click");
    await new Promise((resolve) => window.setTimeout(resolve));

    const edits = wrapper.emitted("edit") ?? [];
    expect(edits.at(-1)?.[0]).toMatchObject({ section: "header", part: "center", pageNumber: 2 });
    expect(wrapper.find('[data-paper-number="2"] textarea').exists()).toBe(true);
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

test("retains an IME-editing page while visible page virtualization changes", async () => {
  const wrapper = mount(PageHeaderFooterOverlay, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { state, frame, setup: setup(), sheetName: "Sales", disabled: false, pageCount: 2 },
  });
  try {
    const first = wrapper
      .get('[data-paper-number="1"]')
      .get('[data-page-section="header"][data-page-part="center"]');
    await first.trigger("click");
    await wrapper.get('[data-paper-number="1"] textarea').trigger("compositionstart");
    await wrapper.setProps({ state: { ...state, pages: [state.pages[1]!] } });
    expect(wrapper.find('[data-paper-number="1"] textarea').exists()).toBe(true);
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});
