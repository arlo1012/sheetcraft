import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
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
  return mount(HomeFormatToolbar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: { state, disabled },
  });
}

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

  test("emits validated font, color, and alignment patches", async () => {
    const wrapper = mountToolbar();

    await wrapper.get('[aria-label="Font family"]').setValue("Arial");
    await wrapper.get('[aria-label="Font size"]').setValue("18");
    await wrapper.get('[aria-label="Text color"]').setValue("#123456");
    await wrapper.get('[aria-label="Fill color"]').setValue("#abcdef");
    await wrapper.get('[aria-label="Align center"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([
      { fontFamily: "Arial" },
      { fontSize: 18 },
      { textColor: "#123456" },
      { fillColor: "#abcdef" },
      { horizontalAlign: "center" },
    ]);

    await wrapper.get('[aria-label="Font size"]').setValue("90");
    expect(emittedPatches(wrapper)).toHaveLength(5);
  });

  test("shows mixed values and disables every control for unsupported selections", () => {
    const wrapper = mountToolbar(
      createStyleState({
        fontFamily: { value: "Arial", mixed: true },
        fontSize: { value: 18, mixed: true },
        textColor: { value: "#123456", mixed: true },
      }),
      true,
    );

    expect(wrapper.get('[aria-label="Font family"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[aria-label="Font size"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[aria-label="Text color, mixed"]').element).toBeInstanceOf(
      HTMLInputElement,
    );
    const toolbar = wrapper.get(".home-format-toolbar");
    expect(toolbar.attributes("role")).toBe("group");
    expect(toolbar.attributes("aria-disabled")).toBe("true");
    for (const control of wrapper.findAll("button, input, select")) {
      expect((control.element as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    }
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
      HTMLInputElement,
    );
    expect(wrapper.get('[aria-label="Fill color, mixed"]').element).toBeInstanceOf(
      HTMLInputElement,
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

  test("leaves native undo handling inside the editable font-size input", async () => {
    const wrapper = mountToolbar();

    await wrapper.get('[aria-label="Font size"]').trigger("keydown", {
      key: "z",
      ctrlKey: true,
    });

    expect(wrapper.emitted("undo")).toBeUndefined();
    expect(wrapper.emitted("redo")).toBeUndefined();
  });
});
