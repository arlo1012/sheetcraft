import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import CellFormatPatternControl from "../../../../../modules/cell-format/components/CellFormatPatternControl.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ host: HTMLElement; wrapper: { unmount(): void } }> = [];

function mountControl() {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(CellFormatPatternControl, {
    attachTo: host,
    props: { modelValue: "darkGrid" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push({ host, wrapper });
  return wrapper;
}

function patternPanel() {
  return new DOMWrapper(document.body).get(".cell-format-pattern-control__panel");
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
});

describe("CellFormatPatternControl", () => {
  test("searches patterns, moves through the grid, and restores trigger focus after selection", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get<HTMLInputElement>("input");

    await openPopup(wrapper);
    expect(patternPanel().element.closest<HTMLElement>(".t-popup__content")?.style.width).toBe(
      "120px",
    );
    const search = patternPanel().get<HTMLInputElement>("input");
    expect(document.activeElement).toBe(search.element);
    await search.setValue("light vertical");
    const option = patternPanel().get<HTMLButtonElement>('[data-fill-pattern="lightVertical"]');
    expect(patternPanel().findAll("[data-fill-pattern]")).toHaveLength(1);

    await search.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(option.element);
    await option.trigger("click");

    expect(wrapper.emitted("select")).toEqual([["lightVertical"]]);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger.element);
  });
});
