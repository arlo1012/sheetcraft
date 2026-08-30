import { DOMWrapper, mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, describe, expect, test } from "vitest";
import HomeFormatToolbar from "../../../../../modules/home-tools/components/HomeFormatToolbar.vue";
import type { SelectionCellStyleState } from "../../../../../modules/workbook/style-state";
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
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
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
        TColorPickerPanel: {
          emits: ["change"],
          template: `
            <div data-color-picker-panel>
              <button data-color="#123456" @click="$emit('change', '#123456')">#123456</button>
              <button data-color="#abcdef" @click="$emit('change', '#abcdef')">#abcdef</button>
            </div>
          `,
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

  test("uses lightweight keyboard-operable buttons for emphasis and alignment", async () => {
    const wrapper = mountToolbar();
    const bold = wrapper.get('[aria-label="Bold"]');
    const center = wrapper.get('[aria-label="Align center"]');

    expect(bold.element).toBeInstanceOf(HTMLSpanElement);
    expect(center.element).toBeInstanceOf(HTMLSpanElement);
    for (const action of [bold, center]) {
      expect(action.attributes()).toMatchObject({
        role: "button",
        tabindex: "0",
        "aria-disabled": "false",
      });
    }

    await bold.trigger("keydown", { key: "Enter" });
    await center.trigger("keydown", { key: " " });
    expect(emittedPatches(wrapper)).toEqual([{ bold: true }, { horizontalAlign: "center" }]);
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

    expect(emittedPatches(wrapper)).toEqual([
      { fontFamily: "Arial" },
      { fontSize: 18 },
      { horizontalAlign: "center" },
    ]);

    fontSize.vm.$emit("change", 90);
    expect(emittedPatches(wrapper)).toHaveLength(3);

    fontSize.vm.$emit("change", 20);
    expect(emittedPatches(wrapper).at(-1)).toEqual({ fontSize: 20 });
  });

  test("applies each drafted color as one formatting patch", async () => {
    const wrapper = mountToolbar();
    const textColor = wrapper.get('[aria-label="Text color"]');
    const textColorDisclosure = textColor.get("[data-color-disclosure]");

    expect(textColor.attributes("aria-expanded")).toBe("false");
    expect(textColorDisclosure.classes()).not.toContain("is-expanded");
    await textColor.trigger("click");
    expect(textColor.attributes("aria-expanded")).toBe("true");
    expect(textColorDisclosure.classes()).toContain("is-expanded");
    await new DOMWrapper(document.body).get('[data-color="#123456"]').trigger("click");
    expect(emittedPatches(wrapper)).toEqual([]);
    await getTeleportedDialog().get('[data-color-action="apply"]').trigger("click");

    await wrapper.get('[aria-label="Fill color"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-color="#abcdef"]').trigger("click");
    await getTeleportedDialog().get('[data-color-action="apply"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#123456" }, { fillColor: "#abcdef" }]);
  });

  test("shows disclosure icons only for controls with an available menu", () => {
    const wrapper = mountToolbar();

    expect(wrapper.findAll("[data-color-disclosure]")).toHaveLength(2);
    expect(wrapper.find(".is-disabled .ribbon-icon-action__disclosure").exists()).toBe(false);
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
    expect(wrapper.get('[aria-label="Text color, mixed"]').element).toBeInstanceOf(
      HTMLButtonElement,
    );
    const toolbar = wrapper.get(".home-format-toolbar");
    expect(toolbar.attributes("role")).toBe("group");
    expect(toolbar.attributes("aria-disabled")).toBeUndefined();
    for (const control of wrapper.findAll("button, input")) {
      expect((control.element as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    }
    for (const control of wrapper.findAll(
      '[aria-label="Bold"], [aria-label="Italic"], [aria-label="Underline"], [aria-label="Align left"], [aria-label="Align center"], [aria-label="Align right"]',
    )) {
      expect(control.attributes()).toMatchObject({ tabindex: "-1", "aria-disabled": "true" });
      await control.trigger("click");
      await control.trigger("keydown", { key: "Enter" });
      await control.trigger("keydown", { key: " " });
    }
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    await wrapper.get('[data-ribbon-action="redo"]').trigger("keydown", { key: " " });
    expect(emittedPatches(wrapper)).toEqual([]);
    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
  });

  test("renders ordered compact and mixed-layout tool groups", () => {
    const wrapper = mountToolbar();

    const groups = wrapper.findAll("[data-ribbon-group]");
    expect(groups.map((group) => group.attributes("data-ribbon-group"))).toEqual([
      "history",
      "cell",
      "alignment",
      "number",
      "data",
      "insert",
      "automation",
      "utility",
    ]);
    for (const groupName of ["history", "alignment", "number"]) {
      const group = wrapper.get(`[data-ribbon-group="${groupName}"]`);
      expect(
        group.findAll(":scope > [data-ribbon-row]").map((row) => row.attributes("data-ribbon-row")),
      ).toEqual(["1", "2"]);
    }

    const cellGroup = wrapper.get('[data-ribbon-group="cell"]');
    expect(
      cellGroup
        .findAll(":scope > [data-cell-format-lane]")
        .map((lane) => lane.attributes("data-cell-format-lane")),
    ).toEqual(["typography", "appearance", "styles"]);

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
      expect(actions.map((action) => action.attributes("data-ribbon-placeholder"))).toEqual(
        actionNames,
      );
      for (const action of actions) {
        expect(action.classes()).toContain("is-tall");
        expect(action.attributes("data-ribbon-span")).toBe("2");
      }
    }

    for (const [stackName, actionNames] of [
      ["freeze-sort", ["freeze", "sort"]],
      ["sum-data", ["sum", "data"]],
      ["chart-pivot", ["chart", "pivot-table"]],
    ] as const) {
      const actions = wrapper
        .get(`[data-ribbon-stack="${stackName}"]`)
        .findAll("[data-ribbon-placeholder]");
      expect(actions.map((action) => action.attributes("data-ribbon-placeholder"))).toEqual(
        actionNames,
      );
      expect(actions.map((action) => action.attributes("data-ribbon-row"))).toEqual(["1", "2"]);
    }

    expect(
      wrapper
        .get('[data-ribbon-grid="automation-secondary"]')
        .findAll("[data-ribbon-placeholder]")
        .map((action) => ({
          name: action.attributes("data-ribbon-placeholder"),
          row: action.attributes("data-ribbon-row"),
          column: action.attributes("data-ribbon-column"),
        })),
    ).toEqual([
      { name: "smart-table", row: "1", column: "1" },
      { name: "app-generator", row: "1", column: "2" },
      { name: "pdf-to-editable", row: "2", column: "1" },
      { name: "pdf-to-image", row: "2", column: "2" },
    ]);

    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="undo"]')).toBeTruthy();
    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-action="redo"]')).toBeTruthy();
    expect(
      wrapper
        .get('[data-ribbon-placeholder="number-format"]')
        .get(".ribbon-icon-action__icon svg")
        .classes(),
    ).toContain("lucide-hash");
    expect(
      wrapper.get('[data-ribbon-group="history"] [data-ribbon-placeholder="format-painter"]'),
    ).toBeTruthy();
    expect(
      wrapper
        .find('[data-ribbon-group="cell"] [data-ribbon-placeholder="format-painter"]')
        .exists(),
    ).toBe(false);
    for (const action of ["clear-formatting", "vertical-alignment", "text-orientation"]) {
      const control = wrapper.get(`[data-ribbon-placeholder="${action}"]`);
      expect(control.find(".ribbon-icon-action__text").exists()).toBe(false);
      expect(control.attributes()).toMatchObject({
        role: "button",
        tabindex: "-1",
        "aria-disabled": "true",
      });
    }
    expect(wrapper.findAll("[data-ribbon-placeholder]")).toHaveLength(32);
    for (const placeholder of wrapper.findAll("[data-ribbon-placeholder]")) {
      expect(placeholder.attributes()).toMatchObject({
        role: "button",
        tabindex: "-1",
        "aria-disabled": "true",
      });
    }
    expect(wrapper.findAll(".text-format-controls .t-button")).toHaveLength(0);
    expect(wrapper.findAll(".horizontal-alignment-controls .t-button")).toHaveLength(0);
  });

  test("exposes mixed color and alignment state to assistive technology", () => {
    const wrapper = mountToolbar(
      createStyleState({
        textColor: { value: "#123456", mixed: true },
        fillColor: { value: "#abcdef", mixed: true },
        horizontalAlign: { value: "center", mixed: true },
      }),
    );

    expect(wrapper.get('[aria-label="Text color, mixed"]').element).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(wrapper.get('[aria-label="Fill color, mixed"]').element).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(wrapper.get('[data-cell-color-icon="text"]').classes()).toContain("is-mixed");
    expect(wrapper.get('[data-cell-color-icon="fill"]').classes()).toContain("is-mixed");
    expect(wrapper.get('[data-cell-color-icon="text"]').attributes("style")).toContain(
      "--cell-color-indicator: #123456",
    );
    expect(wrapper.get('[data-cell-color-icon="fill"]').attributes("style")).toContain(
      "--cell-color-indicator: #abcdef",
    );
    expect(wrapper.get('[aria-label="Horizontal alignment, mixed"]').attributes("role")).toBe(
      "group",
    );
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

  test("cancels a drafted color with Escape and restores trigger focus", async () => {
    const wrapper = mountToolbar();
    const trigger = wrapper.get('[aria-label="Text color"]');
    await trigger.trigger("click");
    expect(document.activeElement).toBe(getTeleportedDialog().element);
    await new DOMWrapper(document.body).get('[data-color="#123456"]').trigger("click");
    await getTeleportedDialog().trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(emittedPatches(wrapper)).toEqual([]);
  });
});
