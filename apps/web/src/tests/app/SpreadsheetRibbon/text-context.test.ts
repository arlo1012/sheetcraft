import { mount, type VueWrapper } from "@vue/test-utils";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { afterEach, describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture(
  locale: "en-US" | "zh-CN",
  initial: Partial<InstanceType<typeof SpreadsheetRibbon>["$props"]> = {},
) {
  const wrapper = mount(SpreadsheetRibbon, {
    attachTo: document.body,
    props: { state: createDefaultSelectionCellStyleState(), disabled: false, ...initial },
    global: { plugins: [createAppI18n(locale)] },
    slots: {
      "shape-tools": "<span data-drawing-panel>Drawing controls</span>",
      "shape-text-tools": "<span data-text-panel>Text controls</span>",
      "insert-tools": "<span data-insert-panel>Insert controls</span>",
    },
  });
  mounted.push(wrapper);
  return wrapper;
}
function tab(wrapper: VueWrapper, category: string) {
  return wrapper.get(`[data-ribbon-category="${category}"]`);
}

describe("simultaneous Drawing Tools and Text Tools contexts", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s initially populated editing session selects Text Tools immediately",
    async (locale) => {
      const wrapper = fixture(locale, {
        hasShape: true,
        hasShapeText: true,
        shapeContextKey: "initial-shape",
        shapeTextSessionId: 19,
      });
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("false");
      expect(tab(wrapper, "shape-text").attributes("data-shape-text-edit-session")).toBe("19");
      expect(wrapper.find("[data-text-panel]").exists()).toBe(true);
      await tab(wrapper, "shape").trigger("click");
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      await wrapper.setProps({ state: createDefaultSelectionCellStyleState() });
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      expect(tab(wrapper, "shape").attributes("data-shape-text-edit-session")).toBe("19");
    },
  );

  test.each(["en-US", "zh-CN"] as const)(
    "%s editing selects Text Tools and keeps the same lease when users switch tabs",
    async (locale) => {
      const wrapper = fixture(locale);
      await tab(wrapper, "insert").trigger("click");
      await wrapper.setProps({
        hasShape: true,
        hasShapeText: true,
        shapeContextKey: "shape-a",
        shapeTextSessionId: 7,
      });
      expect(tab(wrapper, "shape").text()).toBe(locale === "zh-CN" ? "绘图工具" : "Drawing Tools");
      expect(tab(wrapper, "shape-text").text()).toBe(
        locale === "zh-CN" ? "文本工具" : "Text Tools",
      );
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      expect(wrapper.find("[data-text-panel]").exists()).toBe(true);
      expect(wrapper.find("[data-drawing-panel]").exists()).toBe(false);
      expect(wrapper.get('[role="tabpanel"]').attributes("aria-labelledby")).toBe(
        tab(wrapper, "shape-text").attributes("id"),
      );
      await tab(wrapper, "shape").trigger("click");
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      expect(wrapper.find("[data-drawing-panel]").exists()).toBe(true);
      expect(tab(wrapper, "shape").attributes("data-shape-text-edit-session")).toBe("7");
      expect(tab(wrapper, "shape-text").attributes("data-shape-text-edit-session")).toBe("7");
      await wrapper.setProps({ state: createDefaultSelectionCellStyleState() });
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      await wrapper.setProps({ shapeTextSessionId: 8 });
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      expect(tab(wrapper, "shape-text").attributes("data-shape-text-edit-session")).toBe("8");
      await wrapper.setProps({ shapeContextKey: "shape-b", shapeTextSessionId: undefined });
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      expect(tab(wrapper, "shape").attributes("data-shape-text-edit-session")).toBeUndefined();
      await tab(wrapper, "shape-text").trigger("click");
      await wrapper.setProps({ hasShape: false, hasShapeText: false, shapeContextKey: undefined });
      expect(wrapper.find('[data-ribbon-category="shape"]').exists()).toBe(false);
      expect(wrapper.find('[data-ribbon-category="shape-text"]').exists()).toBe(false);
      expect(tab(wrapper, "insert").attributes("aria-selected")).toBe("true");
      expect(wrapper.find("[data-insert-panel]").exists()).toBe(true);
    },
  );

  test.each(["en-US", "zh-CN"] as const)(
    "%s includes both contexts in Arrow/Home/End keyboard order",
    async (locale) => {
      const wrapper = fixture(locale);
      await wrapper.setProps({ hasShape: true, hasShapeText: true, shapeContextKey: "shape-a" });
      await tab(wrapper, "view").trigger("click");
      await tab(wrapper, "view").trigger("keydown", { key: "ArrowRight" });
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
      await tab(wrapper, "shape").trigger("keydown", { key: "ArrowRight" });
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(tab(wrapper, "shape-text").element);
      await tab(wrapper, "shape-text").trigger("keydown", { key: "ArrowRight" });
      expect(tab(wrapper, "home").attributes("aria-selected")).toBe("true");
      await tab(wrapper, "home").trigger("keydown", { key: "ArrowLeft" });
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      await tab(wrapper, "shape-text").trigger("keydown", { key: "Home" });
      expect(tab(wrapper, "home").attributes("aria-selected")).toBe("true");
      await tab(wrapper, "home").trigger("keydown", { key: "End" });
      expect(tab(wrapper, "shape-text").attributes("aria-selected")).toBe("true");
      await tab(wrapper, "shape-text").trigger("keydown", { key: "ArrowLeft" });
      expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
    },
  );

  test("Text Tools require a selected text-capable shape and disappear independently", async () => {
    const wrapper = fixture("en-US");
    await wrapper.setProps({ hasShapeText: true });
    expect(wrapper.find('[data-ribbon-category="shape-text"]').exists()).toBe(false);
    await wrapper.setProps({ hasShape: true, shapeContextKey: "shape-a" });
    await tab(wrapper, "shape-text").trigger("click");
    await wrapper.setProps({ hasShapeText: false });
    expect(wrapper.find('[data-ribbon-category="shape-text"]').exists()).toBe(false);
    expect(tab(wrapper, "shape").attributes("aria-selected")).toBe("true");
    expect(wrapper.find("[data-drawing-panel]").exists()).toBe(true);
  });
});
