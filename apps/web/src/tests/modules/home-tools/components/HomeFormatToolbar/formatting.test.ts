import { DOMWrapper, mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, describe, expect, test } from "vitest";
import HomeFormatToolbar from "../../../../../modules/home-tools/components/HomeFormatToolbar.vue";
import { createClearCellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { createAppI18n } from "../../../../../shared/i18n";

function createStyleState(
  overrides: Partial<SelectionCellStyleState> = {},
): SelectionCellStyleState {
  return {
    fontFamily: { value: undefined, mixed: false },
    fontSize: { value: undefined, mixed: false },
    bold: "off",
    italic: "off",
    underline: "off",
    underlineStyle: { value: undefined, mixed: false },
    strikethrough: "off",
    fontScript: { value: undefined, mixed: false },
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    fillPattern: { value: undefined, mixed: false },
    fillPatternColor: { value: undefined, mixed: false },
    fillGradient: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
    verticalAlign: { value: undefined, mixed: false },
    indent: { value: 0, mixed: false },
    shrinkToFit: "off",
    textDirection: { value: "context", mixed: false },
    textRotation: { value: 0, mixed: false },
    wrapText: "off",
    numberFormat: { value: undefined, mixed: false },
    ...overrides,
  };
}

function mountToolbar(state = createStyleState(), disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(HomeFormatToolbar, {
    attachTo: host,
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        TConfigProvider: {
          props: ["globalConfig"],
          template: "<div><slot /></div>",
        },
      },
    },
    props: { state, disabled },
  });
  mountedWrappers.push({ host, wrapper });
  return wrapper;
}

const mountedWrappers: Array<{
  host: HTMLElement;
  wrapper: { unmount(): void };
}> = [];

function getTeleportedDialog() {
  return new DOMWrapper(document.body).get('[role="dialog"]');
}

afterEach(() => {
  for (const { host, wrapper } of mountedWrappers.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

function emittedPatches(wrapper: ReturnType<typeof mountToolbar>) {
  return (wrapper.emitted("applyStyle") ?? []).map((event) => event[0]);
}

describe("HomeFormatToolbar", () => {
  test("keeps history and unprotect available while protecting all data tools", async () => {
    const wrapper = mountToolbar(createStyleState(), true);
    await wrapper.setProps({ readOnly: true });
    expect(wrapper.get('[data-ribbon-action="auto-sum"]').attributes("disabled")).toBe("");
    const protection = wrapper.get('[data-ribbon-action="protect"]');
    expect(protection.attributes("aria-label")).toBe("Unprotect");
    expect(protection.attributes("disabled")).toBeUndefined();
    await protection.trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(wrapper.emitted("toggleProtection")).toEqual([[]]);
    expect(wrapper.emitted("undo")).toEqual([[]]);
  });

  test("represents toggle and mixed selection states", async () => {
    const wrapper = mountToolbar(
      createStyleState({ bold: "on", italic: "mixed", underline: "off" }),
    );

    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[aria-label="Italic"]').attributes("aria-pressed")).toBe("mixed");
    expect(wrapper.get('[aria-label="Underline"]').attributes("aria-pressed")).toBe("false");

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    await wrapper.get('[aria-label="Italic"]').trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ bold: null }, { italic: true }]);
  });

  test("activates strikethrough and preserves its mixed selection state", async () => {
    const wrapper = mountToolbar(createStyleState({ strikethrough: "mixed" }));
    const action = wrapper.get('[aria-label="Strikethrough"]');
    expect(action.attributes("aria-pressed")).toBe("mixed");
    expect(action.attributes("disabled")).toBeUndefined();
    await action.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ strikethrough: true }]);
    await wrapper.setProps({ state: createStyleState({ strikethrough: "on" }) });
    await action.trigger("click");
    expect(emittedPatches(wrapper).at(-1)).toEqual({ strikethrough: null });
  });

  test("uses native buttons for emphasis and alignment", async () => {
    const wrapper = mountToolbar();
    const bold = wrapper.get('[aria-label="Bold"]');
    const center = wrapper.get('[aria-label="Align center"]');

    expect(bold.element).toBeInstanceOf(HTMLButtonElement);
    expect(center.element).toBeInstanceOf(HTMLButtonElement);
    for (const action of [bold, center]) {
      expect(action.attributes()).toMatchObject({ type: "button" });
      expect((action.element as HTMLButtonElement).disabled).toBe(false);
    }

    await bold.trigger("click");
    await center.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ bold: true }, { horizontalAlign: "center" }]);
  });

  test("exposes and activates format painter as a pressed action", async () => {
    const wrapper = mountToolbar();
    const formatPainter = wrapper.get('[data-ribbon-action="format-painter"]');

    expect(formatPainter.attributes()).toMatchObject({
      type: "button",
      "aria-label": "Format painter",
      "aria-pressed": "false",
    });
    await formatPainter.trigger("click");
    expect(wrapper.emitted("activateFormatPainter")).toEqual([[]]);

    await wrapper.setProps({ formatPainterActive: true });
    expect(formatPainter.attributes("aria-pressed")).toBe("true");

    await formatPainter.trigger("click");
    expect(wrapper.emitted("activateFormatPainter")).toEqual([[], []]);
  });

  test("toggles wrapping from native button activation", async () => {
    const wrapper = mountToolbar(createStyleState({ wrapText: "mixed" }));
    const wrapText = wrapper.get('[data-ribbon-action="wrap-text"]');

    expect(wrapText.attributes()).toMatchObject({
      type: "button",
      "aria-label": "Wrap text",
      "aria-pressed": "mixed",
    });
    expect(wrapText.element).toBeInstanceOf(HTMLButtonElement);
    expect((wrapText.element as HTMLButtonElement).disabled).toBe(false);
    await wrapText.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ wrapText: true }]);

    await wrapper.setProps({ state: createStyleState({ wrapText: "on" }) });
    await wrapText.trigger("click");
    expect(emittedPatches(wrapper).at(-1)).toEqual({ wrapText: null });
  });

  test("emits a complete clear-formatting patch from native button activation", async () => {
    const wrapper = mountToolbar();
    const clearFormatting = wrapper.get('[data-ribbon-action="clear-formatting"]');

    expect(clearFormatting.attributes()).toMatchObject({
      type: "button",
      "aria-label": "Clear formatting",
    });
    expect(clearFormatting.element).toBeInstanceOf(HTMLButtonElement);
    expect((clearFormatting.element as HTMLButtonElement).disabled).toBe(false);
    await clearFormatting.trigger("click");

    expect(emittedPatches(wrapper)).toEqual([createClearCellStylePatch()]);
  });

  test("emits validated font and alignment patches", async () => {
    const wrapper = mountToolbar();
    const fontSelectors = wrapper.findAllComponents(TSelect);
    expect(fontSelectors).toHaveLength(2);
    const fontFamily = fontSelectors[0]!;
    const fontSize = fontSelectors[1]!;

    fontFamily.vm.$emit("change", "Arial");
    fontSize.vm.$emit("change", 18);
    await wrapper.get('[aria-label="Align center"]').trigger("click");
    await wrapper.get('[data-vertical-alignment-action="bottom"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([
      { fontFamily: "Arial" },
      { fontSize: 18 },
      { horizontalAlign: "center" },
      { verticalAlign: null },
    ]);

    fontSize.vm.$emit("change", 90);
    expect(emittedPatches(wrapper)).toHaveLength(4);

    fontSize.vm.$emit("change", 20);
    expect(emittedPatches(wrapper).at(-1)).toEqual({ fontSize: 20 });
  });

  test("opens palette colors from the menu action and applies them immediately", async () => {
    const wrapper = mountToolbar();
    const textColor = wrapper.get('[data-cell-color-control="text"]');
    const textColorMenu = textColor.get("[data-ribbon-split-menu]");

    expect(textColorMenu.attributes("aria-expanded")).toBe("false");
    await textColorMenu.trigger("click");
    expect(textColorMenu.attributes("aria-expanded")).toBe("true");
    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");

    await wrapper.get('[data-cell-color-control="fill"] [data-ribbon-split-menu]').trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#c00000"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#4472c4" }, { fillColor: "#c00000" }]);
  });

  test("keeps a selected tool color when the active selection changes", async () => {
    const wrapper = mountToolbar();
    const textControl = wrapper.get('[data-cell-color-control="text"]');
    await textControl.get("[data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");

    await wrapper.setProps({
      state: createStyleState({ textColor: { value: "#c00000", mixed: false } }),
    });
    expect(textControl.get('[data-cell-color-icon="text"]').attributes("style")).toContain(
      "#4472c4",
    );
    await textControl.get("[data-ribbon-split-main]").trigger("click");
    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#4472c4" }, { textColor: "#4472c4" }]);
  });

  test("forwards border presets without converting them into style patches", async () => {
    const wrapper = mountToolbar();
    await wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-border-preset="innerVertical"]')
      .trigger("click");

    expect(wrapper.emitted("applyBorders")).toEqual([
      [
        {
          preset: "innerVertical",
          border: { style: "thin", color: "#20242c" },
        },
      ],
    ]);
    expect(emittedPatches(wrapper)).toEqual([]);
  });

  test("shows an image menu disclosure for the available image control", () => {
    const wrapper = mountToolbar();

    expect(wrapper.findAll("[data-cell-color-control] [data-ribbon-split-menu]")).toHaveLength(2);
    expect(
      wrapper.get('[data-ribbon-action="image"]').find(".ribbon-icon-action__disclosure").exists(),
    ).toBe(true);
  });

  test("disables formatting controls while keeping history actions available", async () => {
    const wrapper = mountToolbar(
      createStyleState({
        fontFamily: { value: "Arial", mixed: true },
        fontSize: { value: 18, mixed: true },
        textColor: { value: "#123456", mixed: true },
      }),
      true,
    );

    expect(wrapper.get(".font-format-controls__family input").element).toHaveProperty("value", "");
    expect(wrapper.get(".font-format-controls__size input").element).toHaveProperty("value", "");
    expect(
      wrapper.get('[data-cell-color-control="text"] [data-ribbon-split-main]').element,
    ).toBeInstanceOf(HTMLButtonElement);
    const toolbar = wrapper.get(".home-format-toolbar");
    expect(toolbar.attributes("role")).toBe("group");
    expect(toolbar.attributes("aria-disabled")).toBeUndefined();
    for (const control of wrapper.findAll(
      '[data-ribbon-group]:not([data-ribbon-group="history"]) button, input',
    )) {
      if (["auto-sum", "protect"].includes(control.attributes("data-ribbon-action") ?? ""))
        continue;
      expect((control.element as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    }
    for (const control of wrapper.findAll(
      '[aria-label="Bold"], [aria-label="Italic"], [aria-label="Underline"], [aria-label="Clear formatting"], [aria-label="Wrap text"], [aria-label="Align left"], [aria-label="Align center"], [aria-label="Align right"]',
    )) {
      expect(control.element).toBeInstanceOf(HTMLButtonElement);
      expect(control.attributes()).toMatchObject({
        type: "button",
        disabled: "",
      });
      await control.trigger("click");
    }
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
    const autoSum = wrapper.get('[data-ribbon-action="auto-sum"]');
    expect((autoSum.element as HTMLButtonElement).disabled).toBe(false);
    await autoSum.trigger("click");
    expect(emittedPatches(wrapper)).toEqual([]);
    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
    expect(wrapper.emitted("autoSum")).toHaveLength(1);
  });

  test("renders ordered compact and mixed-layout tool groups", () => {
    const wrapper = mountToolbar();

    const groups = wrapper.findAll("[data-ribbon-group]");
    expect(groups.map((group) => group.attributes("data-ribbon-group"))).toEqual([
      "history",
      "cell",
      "alignment",
      "number",
      "styles",
      "data",
      "insert",
      "automation",
      "utility",
    ]);
    for (const groupName of ["history", "alignment", "number", "styles"]) {
      const group = wrapper.get(`[data-ribbon-group="${groupName}"]`);
      expect(
        group.findAll("[data-ribbon-row]").map((row) => row.attributes("data-ribbon-row")),
      ).toEqual(["1", "2"]);
    }

    const cellGroup = wrapper.get('[data-ribbon-group="cell"]');
    expect(
      cellGroup
        .findAll(":scope > [data-cell-format-lane]")
        .map((lane) => lane.attributes("data-cell-format-lane")),
    ).toEqual(["typography", "appearance"]);

    const tallActions = {
      data: ["filter", "protect"],
      insert: ["insert", "image"],
      automation: ["quick-tools", "generate-icon"],
      utility: ["print"],
    };
    for (const [groupName, actionNames] of Object.entries(tallActions)) {
      const actions = wrapper.findAll(
        `[data-ribbon-group="${groupName}"] [data-ribbon-layout="tall"]`,
      );
      expect(
        actions.map(
          (action) =>
            action.attributes("data-ribbon-action") ?? action.attributes("data-ribbon-placeholder"),
        ),
      ).toEqual(actionNames);
      for (const action of actions) {
        expect(action.classes()).toContain("is-tall");
        expect(action.attributes("data-ribbon-span")).toBe("2");
      }
    }

    for (const [stackName, actionNames] of [
      ["freeze-sort", ["freeze", "sort"]],
      ["chart-pivot", ["chart", "pivot-table"]],
      ["smart-table-pdf", ["smart-table", "pdf-to-editable"]],
      ["app-generator-pdf", ["app-generator", "pdf-to-image"]],
    ] as const) {
      const actions = wrapper
        .get(`[data-ribbon-stack="${stackName}"]`)
        .findAll("[data-ribbon-row]");
      expect(
        actions.map(
          (action) =>
            action.attributes("data-ribbon-action") ?? action.attributes("data-ribbon-placeholder"),
        ),
      ).toEqual(actionNames);
      expect(actions.map((action) => action.attributes("data-ribbon-row"))).toEqual(["1", "2"]);
    }

    const autoSum = wrapper.get('[data-ribbon-action="auto-sum"]');
    expect(autoSum.attributes("data-ribbon-row")).toBe("1");
    expect(autoSum.attributes("data-ribbon-placeholder")).toBeUndefined();
    expect(
      wrapper
        .get('[data-ribbon-stack="sum-data"]')
        .findAll("[data-ribbon-placeholder]")
        .map((action) => action.attributes("data-ribbon-placeholder")),
    ).toEqual(["data"]);

    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="undo"]')).toBeTruthy();
    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="redo"]')).toBeTruthy();
    expect(wrapper.get("[data-number-format-trigger]").get("svg").classes()).toContain(
      "lucide-hash",
    );
    expect(
      wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="format-painter"]'),
    ).toBeTruthy();
    expect(
      wrapper.find('[data-ribbon-group="cell"] [data-ribbon-action="format-painter"]').exists(),
    ).toBe(false);
    expect(
      wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="clear-formatting"]'),
    ).toBeTruthy();
    expect(
      wrapper.get('[data-ribbon-group="alignment"] [data-ribbon-action="wrap-text"]'),
    ).toBeTruthy();
    expect(wrapper.findAll("[data-ribbon-placeholder]")).toHaveLength(13);
    for (const placeholder of wrapper.findAll("[data-ribbon-placeholder]")) {
      expect(placeholder.element).toBeInstanceOf(HTMLButtonElement);
      expect(placeholder.attributes()).toMatchObject({
        type: "button",
        disabled: "",
      });
    }
  });

  test("keeps color tools independent from mixed selection state", () => {
    const wrapper = mountToolbar(
      createStyleState({
        textColor: { value: "#123456", mixed: true },
        fillColor: { value: "#abcdef", mixed: true },
        horizontalAlign: { value: "center", mixed: true },
        verticalAlign: { value: "top", mixed: true },
      }),
    );

    expect(
      wrapper.get('[data-cell-color-control="text"] [data-ribbon-split-main]').element,
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      wrapper.get('[data-cell-color-control="fill"] [data-ribbon-split-main]').element,
    ).toBeInstanceOf(HTMLButtonElement);
    expect(wrapper.get('[data-cell-color-icon="text"]').attributes("style")).toContain(
      "--cell-color-indicator: #ff0000",
    );
    expect(wrapper.get('[data-cell-color-icon="fill"]').attributes("style")).toContain(
      "--cell-color-indicator: #ffff00",
    );
    expect(wrapper.get('[aria-label="Horizontal alignment, mixed"]').attributes("role")).toBe(
      "group",
    );
    expect(wrapper.get('[aria-label="Vertical alignment"]').findAll("button")).toHaveLength(3);
    expect(
      wrapper
        .get('[aria-label="Vertical alignment"]')
        .findAll("button")
        .map((button) => button.attributes("aria-pressed")),
    ).toEqual(["false", "false", "false"]);
  });

  test("forwards workbook history shortcuts while a toolbar control owns focus", async () => {
    const wrapper = mountToolbar();
    const bold = wrapper.get('[aria-label="Bold"]');

    await bold.trigger("keydown", { key: "z", ctrlKey: true });
    await bold.trigger("keydown", { key: "z", metaKey: true, shiftKey: true });
    await bold.trigger("keydown", { key: "y", ctrlKey: true });

    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(2);
  });

  test("leaves native keyboard handling inside the font selectors", async () => {
    const wrapper = mountToolbar();

    await wrapper.get(".font-format-controls__family input").trigger("keydown", {
      key: "z",
      ctrlKey: true,
    });

    expect(wrapper.emitted("undo")).toBeUndefined();
    expect(wrapper.emitted("redo")).toBeUndefined();
  });

  test("returns Tab from the border menu to the ribbon sequence", async () => {
    const wrapper = mountToolbar();
    const trigger = wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]");
    await trigger.trigger("click");
    const panel = new DOMWrapper(document.body).get("[data-cell-border-panel]");
    await panel.trigger("keydown", { key: "Tab" });

    expect(document.body.querySelector("[data-cell-border-panel]")).toBeNull();
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Fill color"]').element);
  });

  test("forwards history shortcuts from the teleported border menus", async () => {
    const wrapper = mountToolbar();
    await wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]").trigger("click");
    const panel = new DOMWrapper(document.body).get("[data-cell-border-panel]");
    await panel.trigger("keydown", { key: "z", ctrlKey: true });
    await panel.get('[data-border-menu-row="style"]').trigger("click");
    const submenu = new DOMWrapper(document.body).get('[data-border-submenu="style"]');
    await submenu.trigger("keydown", {
      key: "z",
      metaKey: true,
      shiftKey: true,
    });

    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
  });

  test("dismisses a color palette with Escape and restores trigger focus", async () => {
    const wrapper = mountToolbar();
    const trigger = wrapper.get('[data-cell-color-control="text"] [data-ribbon-split-menu]');
    await trigger.trigger("click");
    expect(document.activeElement).toBe(getTeleportedDialog().element);
    await getTeleportedDialog().trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(emittedPatches(wrapper)).toEqual([]);
  });

  test("dismisses a drafted color when focus leaves the panel", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[data-cell-color-control="text"] [data-ribbon-split-menu]').trigger("click");
    expect(document.activeElement).toBe(getTeleportedDialog().element);

    const outsideControl = wrapper.get('[data-cell-color-control="fill"] [data-ribbon-split-main]');
    (outsideControl.element as HTMLButtonElement).focus();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outsideControl.element);
  });
});
