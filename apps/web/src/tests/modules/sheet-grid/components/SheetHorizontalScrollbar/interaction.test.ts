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
    const track = wrapper.get('[role="scrollbar"]');
    expect(track.attributes("aria-controls")).toBe("test-grid");
    expect(track.attributes("aria-orientation")).toBe("horizontal");
    expect(track.attributes("aria-valuemax")).toBe("2000");
    expect(track.attributes("aria-valuenow")).toBe("400");
    for (const [key, expected] of [
      ["ArrowRight", 448],
      ["ArrowLeft", 352],
      ["PageDown", 900],
      ["PageUp", 0],
      ["Home", 0],
      ["End", 2000],
    ] as const) {
      await track.trigger("keydown", { key });
      expect(wrapper.emitted("scroll")?.at(-1)).toEqual([expected]);
    }
    wrapper.unmount();
  });

  test("maps a thumb drag to grid pixels and stops on cancellation", async () => {
    const wrapper = fixture();
    const track = wrapper.get('[role="scrollbar"]');
    const thumb = wrapper.get(".sheet-horizontal-scrollbar__thumb");
    vi.spyOn(track.element, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 500,
    } as DOMRect);
    vi.spyOn(thumb.element, "getBoundingClientRect").mockReturnValue({
      left: 180,
      width: 100,
    } as DOMRect);
    track.element.setPointerCapture = vi.fn();
    track.element.hasPointerCapture = vi.fn(() => true);
    track.element.releasePointerCapture = vi.fn();
    await thumb.trigger("pointerdown", { button: 0, pointerId: 7, clientX: 200 });
    await track.trigger("pointermove", { pointerId: 8, clientX: 300 });
    expect(wrapper.emitted("scroll")).toBeUndefined();
    await track.trigger("pointermove", { pointerId: 7, clientX: 300 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([900]);
    await track.trigger("pointercancel", { pointerId: 7 });
    await track.trigger("pointermove", { pointerId: 7, clientX: 400 });
    expect(wrapper.emitted("scroll")).toHaveLength(1);
    expect(track.element.releasePointerCapture).toHaveBeenCalledWith(7);
    wrapper.unmount();
  });

  test("pages on the track, clamps ordinary wheel input, and disables an empty range", async () => {
    const wrapper = fixture();
    const track = wrapper.get('[role="scrollbar"]');
    vi.spyOn(
      wrapper.get(".sheet-horizontal-scrollbar__thumb").element,
      "getBoundingClientRect",
    ).mockReturnValue({ left: 180, width: 100 } as DOMRect);
    await track.trigger("pointerdown", { button: 0, clientX: 400 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([900]);
    await track.trigger("wheel", { deltaY: -10, deltaMode: 1 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([240]);
    await wrapper.setProps({ state: { position: 0, contentSize: 400, viewportSize: 500 } });
    expect(track.attributes("aria-disabled")).toBe("true");
    expect(track.attributes("tabindex")).toBe("-1");
    await track.trigger("pointerdown", { button: 0, clientX: 400 });
    expect(wrapper.emitted("scroll")).toHaveLength(2);
    await track.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("scroll")).toHaveLength(2);
    wrapper.unmount();
  });

  test("uses Shift-wheel requests to expand past the current range", async () => {
    const wrapper = fixture();
    const track = wrapper.get('[role="scrollbar"]');
    await track.trigger("wheel", { deltaX: 3_000 });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([2000]);
    await track.trigger("wheel", { deltaX: 3_000, shiftKey: true });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([3400, true]);
    await track.trigger("keydown", { key: "End" });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([2000]);
    await wrapper.setProps({ state: { position: 0, viewportSize: 500, contentSize: 400 } });
    await track.trigger("wheel", { deltaY: 48, shiftKey: true });
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([48, true]);
    wrapper.unmount();
  });

  test("scroll buttons move by 48 pixels and disable at their bounds", async () => {
    const wrapper = fixture();
    const buttons = wrapper.findAll(".sheet-horizontal-scrollbar__button");
    const [leftButton, rightButton] = buttons;
    expect(leftButton?.attributes("aria-label")).toBe("Scroll worksheet left");
    expect(rightButton?.attributes("aria-label")).toBe("Scroll worksheet right");
    await leftButton?.trigger("click");
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([352]);
    await rightButton?.trigger("click");
    expect(wrapper.emitted("scroll")?.at(-1)).toEqual([448]);

    await wrapper.setProps({ state: { position: 0, viewportSize: 500, contentSize: 2500 } });
    expect(leftButton?.attributes("aria-disabled")).toBe("true");
    expect(rightButton?.attributes("aria-disabled")).toBe("false");
    await wrapper.setProps({ state: { position: 2000, viewportSize: 500, contentSize: 2500 } });
    expect(leftButton?.attributes("aria-disabled")).toBe("false");
    expect(rightButton?.attributes("aria-disabled")).toBe("true");
    wrapper.unmount();
  });
});
