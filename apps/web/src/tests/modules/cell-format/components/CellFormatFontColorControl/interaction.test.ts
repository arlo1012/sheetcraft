import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import CellFormatFontColorControl from "../../../../../modules/cell-format/components/CellFormatFontColorControl.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ host: HTMLElement; wrapper: { unmount(): void } }> = [];

function mountControl() {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(CellFormatFontColorControl, {
    attachTo: host,
    props: { modelValue: "#ff0000", mixed: false },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push({ host, wrapper });
  return wrapper;
}

function palette() {
  return new DOMWrapper(document.body).get(".color-palette");
}

async function openPopup(trigger: { element: HTMLButtonElement }) {
  Object.defineProperty(trigger.element, "getBoundingClientRect", {
    value: () => new DOMRect(0, 0, 120, 28),
  });
  await nextTick();
  trigger.element.click();
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

describe("CellFormatFontColorControl", () => {
  test("returns from more colors before closing the popup with Escape", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-format-font-color]");

    await openPopup(trigger);
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

  test("emits automatic color as null and closes with focus returned to its trigger", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-format-font-color]");

    await openPopup(trigger);
    await palette().get('[data-color-action="default"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([[null]]);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.body.querySelector(".color-palette")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });
});
