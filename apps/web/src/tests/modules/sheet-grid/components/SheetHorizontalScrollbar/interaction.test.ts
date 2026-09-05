import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import SheetHorizontalScrollbar from "../../../../../modules/sheet-grid/components/SheetHorizontalScrollbar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function fixture() {
  return mount(SheetHorizontalScrollbar, {
    props: {
      state: { position: 400, viewportSize: 500, contentSize: 2500 },
      controls: "test-grid",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
}

describe("horizontal worksheet scrollbar", () => {
  test("exposes the controlled grid and supports bounded keyboard navigation", async () => {
    const wrapper = fixture();
    expect(wrapper.attributes("aria-controls")).toBe("test-grid");
    expect(wrapper.attributes("aria-orientation")).toBe("horizontal");
    expect(wrapper.attributes("aria-valuemax")).toBe("2000");
    expect(wrapper.attributes("aria-valuenow")).toBe("400");
    for (const [key, expected] of [
      ["ArrowRight", 448],
      ["ArrowLeft", 352],
      ["PageDown", 900],
      ["PageUp", 0],
      ["Home", 0],
      ["End", 2000],
    ] as const) {
      await wrapper.trigger("keydown", { key });
      expect(wrapper.emitted("scroll")?.at(-1)).toEqual([expected]);
    }
    wrapper.unmount();
  });

  test("maps a thumb drag to grid pixels and stops on cancellation", async () => {
    const wrapper = fixture();
    const track = wrapper.element as HTMLDivElement;
    const thumb = wrapper.get(".sheet-horizontal-scrollbar__thumb");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ left: 100, width: 500 } as DOMRect);
    vi.spyOn(thumb.element, "getBoundingClientRect").mockReturnValue({
      left: 180,
      width: 100,
    } as DOMRect);
    track.setPointerCapture = vi.fn();
    track.hasPointerCapture = vi.fn(() => true);
    track.releasePointerCapture = vi.fn();
    await thumb.trigger("pointerdown", { button: 0, pointerId: 7, clientX: 200 });
    await wrapper.trigger("pointermove", { pointerId: 8, clientX: 300 });
    expect(wrapper.emitted("scroll")).toBeUndefined();
    await wrapper.trigger("pointermove", { pointerId: 7, clientX: 300 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([900]);
    await wrapper.trigger("pointercancel", { pointerId: 7 });
    await wrapper.trigger("pointermove", { pointerId: 7, clientX: 400 });
    expect(wrapper.emitted("scroll")).toHaveLength(1);
    expect(track.releasePointerCapture).toHaveBeenCalledWith(7);
    wrapper.unmount();
  });

  test("pages on the track, scrolls a wheel, and disables an empty range", async () => {
    const wrapper = fixture();
    vi.spyOn(
      wrapper.get(".sheet-horizontal-scrollbar__thumb").element,
      "getBoundingClientRect",
    ).mockReturnValue({ left: 180, width: 100 } as DOMRect);
    await wrapper.trigger("pointerdown", { button: 0, clientX: 400 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([900]);
    await wrapper.trigger("wheel", { deltaY: -10, deltaMode: 1 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([240]);
    await wrapper.setProps({ state: { position: 0, contentSize: 400, viewportSize: 500 } });
    expect(wrapper.attributes("aria-disabled")).toBe("true");
    expect(wrapper.attributes("tabindex")).toBe("-1");
    await wrapper.trigger("pointerdown", { button: 0, clientX: 400 });
    expect(wrapper.emitted("scroll")).toHaveLength(2);
    await wrapper.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("scroll")).toHaveLength(2);
    wrapper.unmount();
  });
});
