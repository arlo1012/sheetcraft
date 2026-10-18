import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import ChartPreviewNotices from "../../../modules/charts/components/ChartPreviewNotices.vue";
import { createAppI18n } from "../../../shared/i18n";
import { chartNoticeButtonPosition } from "../../../modules/charts/chart-preview-notices";

const chart = { x: 200, y: 150, width: 480, height: 300 };
const viewport = { width: 1000, height: 700 };
describe("compact chart notices never automatically cover a legend", () => {
  test.each([
    { x: 684, y: 150 },
    { x: 172, y: 150 },
    { x: 200, y: 122 },
    { x: 200, y: 454 },
  ])("retains complete visible outside placement %o", (point) => {
    expect(chartNoticeButtonPosition(chart, point, viewport)).toEqual({
      ...point,
      fallback: false,
    });
  });
  test("no-space fallback is only 24px at the visible chart top right, never a bottom text strip", () => {
    expect(
      chartNoticeButtonPosition(
        { x: 0, y: 0, width: 300, height: 200 },
        { x: 304, y: 0 },
        { width: 300, height: 200 },
      ),
    ).toEqual({ x: 272, y: 4, fallback: true });
    expect(
      chartNoticeButtonPosition(
        { x: 0, y: 140, width: 300, height: 400 },
        { x: 304, y: 140 },
        { width: 300, height: 560 },
      ),
    ).toEqual({ x: 272, y: 144, fallback: true });
  });
  test("hidden charts remove teleported controls and disconnect their visibility observer", async () => {
    let notify: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          if (!options) notify = callback;
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect;
      },
    );
    const anchor = document.createElement("div");
    document.body.append(anchor);
    const wrapper = mount(ChartPreviewNotices, {
      attachTo: document.body,
      props: { anchor, messages: ["Preview fallback"] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      await nextTick();
      expect(document.querySelector(".chart-preview-notices__button")).not.toBeNull();
      notify!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(document.querySelector(".chart-preview-notices__button")).toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      wrapper.unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      if (wrapper.exists()) wrapper.unmount();
      anchor.remove();
      vi.unstubAllGlobals();
    }
  });
  test("two charts retain isolated keyboard notices, Escape focus and cleanup without changing anchor geometry", async () => {
    const anchors = [document.createElement("div"), document.createElement("div")];
    anchors.forEach((anchor) => {
      anchor.style.width = "480px";
      anchor.style.height = "300px";
      document.body.append(anchor);
    });
    const first = mount(ChartPreviewNotices, {
      attachTo: document.body,
      props: { anchor: anchors[0]!, messages: ["Script fallback"] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const second = mount(ChartPreviewNotices, {
      attachTo: document.body,
      props: { anchor: anchors[1]!, messages: ["Missing font"], retry: true },
      global: { config: { idPrefix: "second" }, plugins: [createAppI18n("en-US")] },
    });
    try {
      await nextTick();
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(".chart-preview-notices__button"),
      );
      expect(buttons).toHaveLength(2);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(first.get('[role="status"]').classes()).toContain("ui-visually-hidden");
      expect(buttons[0]!.getAttribute("aria-describedby")).not.toBe(
        buttons[1]!.getAttribute("aria-describedby"),
      );
      buttons[0]!.focus();
      buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await nextTick();
      await nextTick();
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Script fallback");
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await nextTick();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(buttons[0]);
      buttons[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await nextTick();
      await nextTick();
      const retry = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
      ).find((button) => button.textContent?.includes("Retry"));
      expect(retry).toBeDefined();
      retry!.click();
      expect(second.emitted("retry")).toHaveLength(1);
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await nextTick();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(outside);
      outside.remove();
      expect(anchors[0]!.style.width).toBe("480px");
      expect(anchors[0]!.style.height).toBe("300px");
      first.unmount();
      expect(document.querySelectorAll(".chart-preview-notices__button")).toHaveLength(1);
      second.unmount();
      expect(document.querySelectorAll(".chart-preview-notices__button")).toHaveLength(0);
    } finally {
      if (first.exists()) first.unmount();
      if (second.exists()) second.unmount();
      anchors.forEach((anchor) => anchor.remove());
    }
  });
});
