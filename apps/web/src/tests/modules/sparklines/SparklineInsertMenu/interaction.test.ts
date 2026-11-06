// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SparklineInsertMenu from "../../../../modules/sparklines/components/SparklineInsertMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountMenu(disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(SparklineInsertMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n("en-US")] },
    props: { disabled },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("SparklineInsertMenu", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "selects %s from the shared menu and closes the disclosure",
    async (type) => {
      const wrapper = mountMenu();
      const trigger = wrapper.get('[data-insert-tool="sparkline"]');

      expect(trigger.attributes("aria-haspopup")).toBe("menu");
      expect(trigger.attributes("aria-expanded")).toBe("false");
      await trigger.trigger("click");

      expect(trigger.attributes("aria-expanded")).toBe("true");
      expect(menu().findAll('[role="menuitem"]')).toHaveLength(3);
      expect(wrapper.emitted("insert")).toBeUndefined();
      await menu().get(`[data-sparkline-type="${type}"]`).trigger("click");

      expect(wrapper.emitted("insert")).toEqual([[type]]);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(trigger.attributes("aria-expanded")).toBe("false");
    },
  );

  test("does not open or emit an insertion when disabled", async () => {
    const wrapper = mountMenu(true);
    const trigger = wrapper.get('[data-insert-tool="sparkline"]');

    expect(trigger.attributes("aria-disabled")).toBe("true");
    expect(trigger.find(".ribbon-menu-button__arrow").exists()).toBe(true);
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "ArrowDown" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.emitted("insert")).toBeUndefined();
  });
});
