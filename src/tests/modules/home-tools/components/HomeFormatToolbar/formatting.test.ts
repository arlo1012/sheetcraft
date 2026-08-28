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

  test("emits validated font and alignment patches", async () => {
    const wrapper = mountToolbar();
    const fontFamily = wrapper.findComponent(TSelect);
    const fontSize = wrapper.get<HTMLInputElement>(".font-format-controls__size input");

    await fontSize.trigger("blur");
    expect(emittedPatches(wrapper)).toEqual([]);

    fontFamily.vm.$emit("change", "Arial");
    await fontSize.setValue("18");
    await fontSize.trigger("blur");
    await wrapper.get('[aria-label="Align center"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([
      { fontFamily: "Arial" },
      { fontSize: 18 },
      { horizontalAlign: "center" },
    ]);

    await fontSize.setValue("90");
    await fontSize.trigger("blur");
    expect(emittedPatches(wrapper)).toHaveLength(3);

    await fontSize.setValue("20");
    fontSize.element.focus();
    await fontSize.trigger("keydown", { key: "Enter" });
    expect(emittedPatches(wrapper).at(-1)).toEqual({ fontSize: 20 });
  });

  test("applies each drafted color as one formatting patch", async () => {
    const wrapper = mountToolbar();
    const textColor = wrapper.get('[aria-label="Text color"]');

    expect(textColor.attributes("aria-expanded")).toBe("false");
    await textColor.trigger("click");
    expect(textColor.attributes("aria-expanded")).toBe("true");
    await new DOMWrapper(document.body).get('[data-color="#123456"]').trigger("click");
    expect(emittedPatches(wrapper)).toEqual([]);
    await getTeleportedDialog().get('[data-color-action="apply"]').trigger("click");

    await wrapper.get('[aria-label="Fill color"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-color="#abcdef"]').trigger("click");
    await getTeleportedDialog().get('[data-color-action="apply"]').trigger("click");

    expect(emittedPatches(wrapper)).toEqual([{ textColor: "#123456" }, { fillColor: "#abcdef" }]);
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

    expect(wrapper.get(".font-format-controls__family input").element).toHaveProperty("value", "");
    expect(wrapper.get(".font-format-controls__size input").element).toHaveProperty("value", "");
    expect(wrapper.get('[aria-label="Text color, mixed"]').element).toBeInstanceOf(
      HTMLButtonElement,
    );
    const toolbar = wrapper.get(".home-format-toolbar");
    expect(toolbar.attributes("role")).toBe("group");
    expect(toolbar.attributes("aria-disabled")).toBe("true");
    for (const control of wrapper.findAll("button, input")) {
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
      HTMLButtonElement,
    );
    expect(wrapper.get('[aria-label="Fill color, mixed"]').element).toBeInstanceOf(
      HTMLButtonElement,
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

    await wrapper.get(".font-format-controls__size input").trigger("keydown", {
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
    await new DOMWrapper(document.body).get('[data-color="#123456"]').trigger("click");
    await getTeleportedDialog().trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(emittedPatches(wrapper)).toEqual([]);
  });
});
