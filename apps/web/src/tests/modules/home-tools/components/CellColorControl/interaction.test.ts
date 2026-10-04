import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick, shallowRef, type ShallowRef } from "vue";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@idea10/core/workbook-theme";
import { workbookThemeKey } from "../../../../../shared/color/workbook-theme-context";
import CellColorControl from "../../../../../modules/home-tools/components/CellColorControl.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ host: HTMLElement; wrapper: ReturnType<typeof mount> }> = [];

function mountControl(kind: "text" | "fill", disabled = false, theme?: ShallowRef<WorkbookTheme>) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(CellColorControl, {
    attachTo: host,
    global: {
      plugins: [createAppI18n("en-US")],
      provide: theme ? { [workbookThemeKey as symbol]: theme } : {},
    },
    props: { kind, disabled },
  });
  mountedWrappers.push({ host, wrapper });
  return wrapper;
}

function emittedPatches(wrapper: ReturnType<typeof mountControl>) {
  return (wrapper.emitted("applyStyle") ?? []).map((event) => event[0]);
}

afterEach(() => {
  for (const { host, wrapper } of mountedWrappers.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe("CellColorControl", () => {
  test("keeps a chosen theme swatch live when the document palette changes", async () => {
    const theme = shallowRef<WorkbookTheme>({ ...DEFAULT_WORKBOOK_THEME });
    const wrapper = mountControl("fill", false, theme);
    await wrapper.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#4f81bd"]').trigger("click");
    expect(emittedPatches(wrapper)).toEqual([
      { fillColor: "#4f81bd", fillColorTheme: { slot: "accent1" } },
    ]);
    theme.value = {
      ...theme.value,
      accentColors: [
        "#112233",
        ...theme.value.accentColors.slice(1),
      ] as WorkbookTheme["accentColors"],
    };
    await nextTick();
    await wrapper.get("[data-ribbon-split-main]").trigger("click");
    expect(emittedPatches(wrapper).at(-1)).toEqual({
      fillColor: "#112233",
      fillColorTheme: { slot: "accent1" },
    });
    await wrapper.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#ff0000"]').trigger("click");
    expect(emittedPatches(wrapper).at(-1)).toEqual({ fillColor: "#ff0000" });
  });

  test("keeps keyboard opening on the menu button and closes when disabled", async () => {
    const wrapper = mountControl("text");
    const main = wrapper.get<HTMLButtonElement>("[data-ribbon-split-main]");
    const menu = wrapper.get<HTMLButtonElement>("[data-ribbon-split-menu]");

    main.element.focus();
    await main.trigger("keydown", { key: "ArrowDown" });
    expect(menu.attributes("aria-expanded")).toBe("false");
    menu.element.focus();
    await menu.trigger("keydown", { key: "ArrowDown" });
    expect(menu.attributes("aria-expanded")).toBe("true");
    await new DOMWrapper(document.body).trigger("keydown", { key: "Escape" });
    expect(menu.attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu.element);

    await menu.trigger("click");
    await wrapper.setProps({ disabled: true });
    expect(menu.attributes("aria-expanded")).toBe("false");
    expect(main.element.disabled).toBe(true);
    expect(menu.element.disabled).toBe(true);
    await main.trigger("click");
    await menu.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([]);
  });

  test("opens only from its menu action, then reapplies the remembered text color", async () => {
    const wrapper = mountControl("text");
    const main = wrapper.get("[data-ribbon-split-main]");
    const menu = wrapper.get("[data-ribbon-split-menu]");

    expect(menu.attributes("aria-expanded")).toBe("false");
    await menu.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([]);
    expect(menu.attributes("aria-expanded")).toBe("true");

    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#4472c4" }]);
    expect(wrapper.get('[data-cell-color-icon="text"]').attributes("style")).toContain("#4472c4");

    await main.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#4472c4" }, { textColor: "#4472c4" }]);
    expect(menu.attributes("aria-expanded")).toBe("false");
  });

  test("keeps text and fill tool colors independent", async () => {
    const text = mountControl("text");
    await text.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");

    const fill = mountControl("fill");
    await fill.get("[data-ribbon-split-main]").trigger("click");
    expect(emittedPatches(fill)).toEqual([{ fillColor: "#ffff00" }]);
    expect(emittedPatches(text)).toEqual([{ textColor: "#4472c4" }]);
  });

  test("reapplies Automatic and No fill from each tool's main action", async () => {
    const text = mountControl("text");
    await text.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-action="default"]').trigger("click");
    await text.get("[data-ribbon-split-main]").trigger("click");
    expect(emittedPatches(text)).toEqual([{ textColor: null }, { textColor: null }]);

    const fill = mountControl("fill");
    await fill.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-action="default"]').trigger("click");
    await fill.get("[data-ribbon-split-main]").trigger("click");
    expect(emittedPatches(fill)).toEqual([{ fillColor: null }, { fillColor: null }]);
  });
});
