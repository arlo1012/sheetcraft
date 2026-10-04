import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Radio as TRadio } from "tdesign-vue-next/es/radio";
import CustomHeaderFooterDialog from "../../../../../modules/page-layout/components/CustomHeaderFooterDialog.vue";
import HeaderFooterFontDialog from "../../../../../modules/page-layout/components/HeaderFooterFontDialog.vue";
import ColorPaletteSelect from "../../../../../shared/color/ColorPaletteSelect.vue";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import PageSetupDialog from "../../../../../modules/page-layout/components/PageSetupDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("PageSetupDialog", () => {
  test("converts a local A1 range and resets manual breaks before confirmation", async () => {
    const wrapper = mount(PageSetupDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        initialTab: "sheet",
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          rowBreaks: [12],
          columnBreaks: [4],
        },
      },
    });
    try {
      await wrapper.get('[data-page-setup="print-area"] input').setValue("D50:A1");
      await wrapper.get('[data-page-setup="reset-manual-breaks"]').trigger("click");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("confirm")).toEqual([
        [
          expect.objectContaining({
            printArea: {
              start: { row: 0, column: 0 },
              end: { row: 49, column: 3 },
            },
            rowBreaks: [],
            columnBreaks: [],
          }),
        ],
      ]);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("rejects sheet-qualified or invalid print areas", async () => {
    const wrapper = mount(PageSetupDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, initialTab: "sheet", setup: DEFAULT_SHEET_PAGE_SETUP },
    });
    try {
      await wrapper.get('[data-page-setup="print-area"] input').setValue("Sheet1!A1:B2");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("confirm")).toBeUndefined();
      expect(wrapper.text()).toContain("Enter one range such as A1:D50.");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});

test("keeps header and footer distances valid when a page margin is reduced to zero", async () => {
  const wrapper = mount(PageSetupDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      visible: true,
      initialTab: "margins",
      setup: {
        ...DEFAULT_SHEET_PAGE_SETUP,
        margins: { ...DEFAULT_SHEET_PAGE_SETUP.margins, top: 10, bottom: 10, header: 5, footer: 5 },
      },
    },
  });
  try {
    await wrapper.get('[data-page-setup="margin-top"] input').setValue("0");
    await wrapper.get('[data-page-setup="margin-bottom"] input').setValue("0");
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toEqual(
      expect.objectContaining({
        margins: expect.objectContaining({ top: 0, bottom: 0, header: 0, footer: 0 }),
      }),
    );
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

async function tab(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll(".t-tabs__nav-item").find((button) => button.text() === label);
  expect(button).toBeDefined();
  await button!.trigger("click");
}
async function select(wrapper: ReturnType<typeof mount>, field: string, value: string | number) {
  const component = wrapper
    .findAllComponents(TSelect)
    .find((component) => component.attributes("data-page-setup") === field);
  expect(component).toBeDefined();
  component!.vm.$emit("change", value);
  await wrapper.vm.$nextTick();
}
function radio(wrapper: ReturnType<typeof mount>, label: string) {
  const component = wrapper
    .findAllComponents(TRadio)
    .find((component) => component.text() === label);
  expect(component).toBeDefined();
  component!.vm.$emit("change", true);
}

test("saves a complete draft across all four tabs without changing its source", async () => {
  const source = structuredClone(DEFAULT_SHEET_PAGE_SETUP);
  const wrapper = mount(PageSetupDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, setup: source, sheetName: "Details" },
  });
  try {
    radio(wrapper, "Fit to");
    await wrapper.vm.$nextTick();
    await select(wrapper, "fit-preset", "columns");
    await select(wrapper, "print-quality", 1200);
    await wrapper.get('[data-page-setup="first-page-number"] input').setValue("7");
    await tab(wrapper, "Margins");
    await wrapper.get('[data-page-setup="margin-top"] input').setValue("72");
    await wrapper.get('[data-page-setup="center-horizontally"] input').setValue(true);
    await wrapper.get('[data-page-setup="center-vertically"] input').setValue(true);
    await tab(wrapper, "Header & Footer");
    await select(wrapper, "header-preset", "pages");
    await wrapper.get('[data-page-setup-option="different-first"] input').setValue(true);
    await tab(wrapper, "Sheet");
    await wrapper.get('[data-page-setup="print-area"] input').setValue("A1:G80");
    await wrapper.get('[data-page-setup="title-rows"] input').setValue("$1:$3");
    await wrapper.get('[data-page-setup="title-columns"] input').setValue("$A:$B");
    await wrapper.get('[data-page-setup="bottom-title-rows"] input').setValue("$79:$80");
    await wrapper.get('[data-page-setup="print-gridlines"] input').setValue(true);
    await wrapper.get('[data-page-setup="black-and-white"] input').setValue(true);
    await wrapper.get('[data-page-setup="print-headings"] input').setValue(true);
    await select(wrapper, "cell-comments", "atEnd");
    await select(wrapper, "cell-errors", "dash");
    radio(wrapper, "Over, then down");
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    const result = wrapper.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
    expect(result).toMatchObject({
      fitToPage: { width: 1, height: 0 },
      firstPageNumber: 7,
      printQuality: 1200,
      header: { center: "Page &P of &N" },
      headerFooter: { differentFirst: true },
      printArea: { start: { row: 0, column: 0 }, end: { row: 79, column: 6 } },
      printTitles: {
        rows: { start: 0, end: 2 },
        columns: { start: 0, end: 1 },
        bottomRows: { start: 78, end: 79 },
      },
      printOptions: {
        horizontalCentered: true,
        verticalCentered: true,
        gridLines: true,
        blackAndWhite: true,
        headings: true,
        cellComments: "atEnd",
        errors: "dash",
      },
      pageOrder: "overThenDown",
    });
    expect(result.margins.top).toBeCloseTo(25.4, 8);
    expect(source).toEqual(DEFAULT_SHEET_PAGE_SETUP);
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

test("keeps custom header changes local until both dialogs confirm and discards cancelled drafts", async () => {
  const source = {
    ...DEFAULT_SHEET_PAGE_SETUP,
    header: { left: "", center: "Original", right: "" },
  };
  const wrapper = mount(PageSetupDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, initialTab: "header-footer", setup: source },
  });
  try {
    await wrapper.get('[data-page-setup="custom-header"]').trigger("click");
    let child = wrapper.getComponent(CustomHeaderFooterDialog);
    await child.get('[data-page-setup="header-center"] textarea').setValue("Discard me");
    child.findComponent({ name: "TDialog" }).vm.$emit("close");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-page-setup="custom-header"]').trigger("click");
    child = wrapper.getComponent(CustomHeaderFooterDialog);
    expect(
      (child.get('[data-page-setup="header-center"] textarea').element as HTMLTextAreaElement)
        .value,
    ).toBe("Original");
    await child.get('[data-page-setup="header-center"] textarea').setValue("Draft title");
    await child.get('[data-page-setup="header-center"] textarea').trigger("focus");
    await child.get('[data-header-footer-action="font"]').trigger("click");
    const font = child.getComponent(HeaderFooterFontDialog);
    font.getComponent(ColorPaletteSelect).vm.$emit("select", "#2874A6");
    font.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    child.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("confirm")).toBeUndefined();
    const childDraft = child.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
    expect(childDraft.header.center).toContain("Draft title");
    expect(childDraft.header.center).toContain("&K2874A6");
    expect(source.header.center).toBe("Original");
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      header: { center: "Original" },
    });
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

test("passes the correct range field to the picker and validates title boundaries", async () => {
  const pick = vi.fn(async () => "$2:$4");
  const wrapper = mount(PageSetupDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      visible: true,
      initialTab: "sheet",
      setup: DEFAULT_SHEET_PAGE_SETUP,
      selectReference: pick,
    },
  });
  try {
    await wrapper
      .get('[data-page-setup="title-rows"] [data-select-formula-reference]')
      .trigger("click");
    await wrapper.vm.$nextTick();
    expect(pick).toHaveBeenCalledWith("", "titleRows");
    expect(
      (wrapper.get('[data-page-setup="title-rows"] input').element as HTMLInputElement).value,
    ).toBe("$2:$4");
    await wrapper.get('[data-page-setup="title-columns"] input').setValue("XFE:XFF");
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.text()).toContain("Enter a column range such as $A:$C.");
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

test("replaces decimal margins when editing a formatted value again", async () => {
  const wrapper = mount(PageSetupDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, initialTab: "margins", setup: DEFAULT_SHEET_PAGE_SETUP },
  });
  const margins = ["top", "bottom", "left", "right", "header", "footer"] as const;
  const distances = new Set<string>(["header", "footer"]);
  try {
    for (const margin of margins) {
      const input = wrapper.get<HTMLInputElement>(`[data-page-setup="margin-${margin}"] input`);
      for (const value of distances.has(margin) ? ["5.50", "6.25"] : ["25.50", "26.25"]) {
        input.element.focus();
        await wrapper.vm.$nextTick();
        for (const character of value) {
          const element = input.element;
          const start = element.selectionStart ?? 0;
          const end = element.selectionEnd ?? start;
          element.value = element.value.slice(0, start) + character + element.value.slice(end);
          element.setSelectionRange(start + 1, start + 1);
          await input.trigger("input");
        }
        input.element.blur();
        await wrapper.vm.$nextTick();
        expect(input.element.value).toBe(value);
      }
    }
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    const setup = wrapper.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
    for (const margin of margins) {
      expect(setup.margins[margin]).toBeCloseTo(
        ((distances.has(margin) ? 6.25 : 26.25) * 25.4) / 72,
        8,
      );
    }
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});
