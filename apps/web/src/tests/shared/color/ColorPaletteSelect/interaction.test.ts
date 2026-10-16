import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ host: HTMLElement; wrapper: { unmount(): void } }> = [];

function mountControl(props: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(ColorPaletteSelect, {
    attachTo: host,
    props: {
      modelValue: "#ff0000",
      label: "Text color",
      defaultColor: "#20242c",
      mixed: false,
      ...props,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push({ host, wrapper });
  return wrapper;
}

function palette() {
  return new DOMWrapper(document.body).get(".color-palette");
}

async function openPopup(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.getComponent(TSelectInput).getComponent(TInput);
  const trigger = input.get<HTMLInputElement>("input");
  Object.defineProperties(input.element, {
    getBoundingClientRect: { value: () => new DOMRect(0, 0, 120, 28) },
    offsetWidth: { value: 120 },
  });
  trigger.element.focus();
  await new DOMWrapper(trigger.element).trigger("keydown", { key: "Enter", code: "Enter" });
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve));
  await nextTick();
}

afterEach(() => {
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
  localStorage.clear();
});

describe("ColorPaletteSelect", () => {
  test("does not open a disabled control", async () => {
    const wrapper = mountControl({ disabled: true });
    const trigger = wrapper.get<HTMLInputElement>("input");

    await openPopup(wrapper);

    expect(trigger.attributes("disabled")).toBeDefined();
    expect(document.body.querySelector(".color-palette")).toBeNull();
  });

  test("returns from more colors before closing with Escape and restores focus", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get<HTMLInputElement>("input");

    await openPopup(wrapper);
    const more = palette().get('[data-color-action="more"]');
    await more.trigger("click");
    expect(palette().find('[data-color-action="apply"]').exists()).toBe(true);

    await palette().trigger("keydown", { key: "Escape" });
    const restoredMore = palette().get('[data-color-action="more"]');
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(restoredMore.element);

    await palette().trigger("keydown", { key: "Escape" });
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.body.querySelector(".color-palette")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("emits the default color as null and closes with focus returned to the trigger", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get<HTMLInputElement>("input");

    await openPopup(wrapper);
    await palette().get('[data-color-action="default"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([[null]]);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.body.querySelector(".color-palette")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });
});

test.each(["No fill", "No line"])(
  "transparent colors expose the caller's semantic label: %s",
  (transparentLabel) => {
    const wrapper = mountControl({ modelValue: "transparent", showValue: true, transparentLabel });
    expect(wrapper.text()).toContain(transparentLabel);
    expect(wrapper.text()).not.toContain("TRANSPARENT");
    expect(wrapper.get("input").attributes("aria-label")).toContain(transparentLabel);
  },
);
test("transparent label is opt-in and does not alter ordinary colors or automatic labels", async () => {
  const wrapper = mountControl({ modelValue: "transparent", showValue: true });
  expect(wrapper.text()).toContain("TRANSPARENT");
  await wrapper.setProps({ modelValue: "#abcdef", transparentLabel: "No fill" });
  expect(wrapper.text()).toContain("#ABCDEF");
  await wrapper.setProps({ modelValue: null, defaultLabel: "Default" });
  expect(wrapper.text()).toContain("Default");
});
