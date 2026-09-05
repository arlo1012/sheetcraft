import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet } from "@idea10/core/workbook";
import WorkbookSheetTabs from "../../../../../modules/workbook/components/WorkbookSheetTabs.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

function mountOverflowingTabs() {
  const wrapper = mount(WorkbookSheetTabs, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      sheets: [createSheet("Overview", "overview"), createSheet("Detailed budget", "budget")],
      activeSheetId: "overview",
    },
  });
  wrappers.push(wrapper);
  const list = wrapper.get<HTMLDivElement>(".workbook-sheet-tabs__viewport");
  let scrollLeft = 0;
  Object.defineProperties(list.element, {
    clientWidth: { configurable: true, value: 120 },
    scrollWidth: { configurable: true, value: 280 },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = Math.max(0, Math.min(160, value));
      },
    },
  });
  return { wrapper, list };
}

describe("sheet tab overflow navigation", () => {
  test("pages through hidden tabs and translates a vertical wheel without intercepting browser zoom", async () => {
    const { wrapper, list } = mountOverflowingTabs();
    await list.trigger("scroll");
    const previous = wrapper.get('[aria-label="Scroll sheet tabs left"]');
    const next = wrapper.get('[aria-label="Scroll sheet tabs right"]');
    expect(previous.attributes("disabled")).toBe("");

    await next.trigger("click");
    expect(list.element.scrollLeft).toBe(84);
    await next.trigger("click");
    expect(list.element.scrollLeft).toBe(160);
    expect(next.attributes("disabled")).toBe("");

    const wheel = new WheelEvent("wheel", { deltaY: -2, deltaMode: 1, cancelable: true });
    list.element.dispatchEvent(wheel);
    await nextTick();
    expect(list.element.scrollLeft).toBe(128);
    expect(wheel.defaultPrevented).toBe(true);

    const zoom = new WheelEvent("wheel", { deltaY: 20, ctrlKey: true, cancelable: true });
    // Happy DOM's WheelEvent currently extends UIEvent and omits mouse modifiers.
    Object.defineProperty(zoom, "ctrlKey", { value: true });
    list.element.dispatchEvent(zoom);
    expect(list.element.scrollLeft).toBe(128);
    expect(zoom.defaultPrevented).toBe(false);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  test("reveals an externally selected tab, and its trailing add button, while leaving focus in place", async () => {
    const { wrapper, list } = mountOverflowingTabs();
    vi.spyOn(list.element, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 690, 120, 28));
    const target = wrapper.get('[role="tab"][title="Detailed budget (double-click to rename)"]');
    vi.spyOn(target.element.parentElement!, "getBoundingClientRect").mockReturnValue(
      new DOMRect(190, 690, 120, 28),
    );
    const focusedElement = document.activeElement;

    await wrapper.setProps({ activeSheetId: "budget" });
    await nextTick();

    expect(list.element.scrollLeft).toBe(130);
    expect(document.activeElement).toBe(focusedElement);
    expect(wrapper.find('[aria-label="Add sheet"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="All sheets"]').exists()).toBe(true);
  });
});
