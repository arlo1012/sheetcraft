import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import PageThemeMenu from "../../../../../modules/page-layout/components/PageThemeMenu.vue";
import {
  PAGE_THEME_COLOR_PRESETS,
  PAGE_THEME_FONT_PRESETS,
  PAGE_THEME_PRESETS,
} from "../../../../../modules/page-layout/page-theme-presets";
import { createAppI18n } from "../../../../../shared/i18n";

function mountMenu() {
  return mount(PageThemeMenu, {
    attachTo: document.body,
    props: { theme: DEFAULT_WORKBOOK_THEME, contextKey: "one" },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
async function openCategory(wrapper: ReturnType<typeof mount>, category: string) {
  await wrapper.get('[data-ribbon-action="page-theme"]').trigger("click");
  const body = new DOMWrapper(document.body);
  await body.get(`[data-theme-category="${category}"]`).trigger("mouseenter");
  return body;
}
describe("PageThemeMenu", () => {
  test("applies a complete theme and independently applies a color and font scheme", async () => {
    const wrapper = mountMenu();
    try {
      let body = await openCategory(wrapper, "theme");
      await body.get(`[role="radio"][aria-checked="false"]`).trigger("click");
      expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual(
        expect.objectContaining({ id: PAGE_THEME_PRESETS[0]?.id }),
      );
      await wrapper.setProps({ theme: DEFAULT_WORKBOOK_THEME });
      body = await openCategory(wrapper, "colors");
      await body.get(`.page-theme-menu__color-row`).trigger("click");
      expect(wrapper.emitted("apply")?.[1]?.[0]).toEqual(
        expect.objectContaining({
          accentColors: PAGE_THEME_COLOR_PRESETS[0]?.accentColors,
          headingFont: DEFAULT_WORKBOOK_THEME.headingFont,
        }),
      );
      body = await openCategory(wrapper, "fonts");
      await body.get(`.page-theme-menu__font-row`).trigger("click");
      expect(wrapper.emitted("apply")?.[2]?.[0]).toEqual(
        expect.objectContaining({
          headingFont: PAGE_THEME_FONT_PRESETS[0]?.headingFont,
          accentColors: DEFAULT_WORKBOOK_THEME.accentColors,
        }),
      );
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("does not save a blank custom font scheme and emits a valid one", async () => {
    const wrapper = mountMenu();
    try {
      let body = await openCategory(wrapper, "fonts");
      await body
        .findAll(".page-theme-menu__submenu")
        .at(-1)!
        .get(".page-theme-menu__custom-action")
        .trigger("click");
      let dialogComponent = wrapper
        .findAllComponents({ name: "TDialog" })
        .find((component) => component.text().includes("Custom fonts"));
      expect(dialogComponent).toBeDefined();
      dialogComponent!.vm.$emit("close");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("apply")).toBeUndefined();
      body = await openCategory(wrapper, "fonts");
      await body
        .findAll(".page-theme-menu__submenu")
        .at(-1)!
        .get(".page-theme-menu__custom-action")
        .trigger("click");
      dialogComponent = wrapper
        .findAllComponents({ name: "TDialog" })
        .find((component) => component.text().includes("Custom fonts"));
      expect(dialogComponent).toBeDefined();
      const inputs = dialogComponent!.findAll("input");
      await inputs[0]?.setValue("");
      dialogComponent!.vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("apply")).toBeUndefined();
      await inputs[0]?.setValue("Team type");
      dialogComponent!.vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual(
        expect.objectContaining({ customFonts: [expect.objectContaining({ name: "Team type" })] }),
      );
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("stays closed when the command becomes disabled", async () => {
    const wrapper = mountMenu();
    try {
      await wrapper.get('[data-ribbon-action="page-theme"]').trigger("click");
      expect(new DOMWrapper(document.body).find(".page-theme-menu__root").exists()).toBe(true);
      await wrapper.setProps({ disabled: true });
      expect(new DOMWrapper(document.body).find(".page-theme-menu__root").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("closes a hovered child when parent focus moves to another category", async () => {
    const wrapper = mountMenu();
    try {
      await wrapper.get('[data-ribbon-action="page-theme"]').trigger("click");
      const body = new DOMWrapper(document.body);
      await body.get('[data-theme-category="colors"]').trigger("mouseenter");
      expect(body.find(".page-theme-menu__submenu").exists()).toBe(true);

      await body.get('[data-theme-category="fonts"]').trigger("focusin");
      await nextTick();
      expect(body.find(".page-theme-menu__submenu").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
