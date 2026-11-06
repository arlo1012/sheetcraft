// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import InsertToolbar from "../../../modules/insert-tools/components/InsertToolbar.vue";
import SparklineInsertMenu from "../../../modules/sparklines/components/SparklineInsertMenu.vue";
import { createAppI18n } from "../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
});

function mountToolbar(sparklineDisabled = false) {
  const wrapper = shallowMount(InsertToolbar, {
    props: {
      disabled: false,
      pivotDisabled: false,
      pivotManageDisabled: false,
      hasPivot: false,
      imageDisabled: false,
      symbolDisabled: false,
      sparklineDisabled,
      hyperlinkDisabled: false,
      hasTable: false,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { RibbonToolbar: { template: "<div><slot /></div>" } },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("InsertToolbar sparkline insertion", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "forwards the selected %s type to the owner",
    (type) => {
      const wrapper = mountToolbar();

      wrapper.getComponent(SparklineInsertMenu).vm.$emit("insert", type);

      expect(wrapper.emitted("insertSparkline")).toEqual([[type]]);
    },
  );

  test("updates the menu disabled state when sparkline permissions change", async () => {
    const wrapper = mountToolbar();
    const menu = wrapper.getComponent(SparklineInsertMenu);
    expect(menu.props("disabled")).toBe(false);

    await wrapper.setProps({ sparklineDisabled: true });
    expect(menu.props("disabled")).toBe(true);

    await wrapper.setProps({ sparklineDisabled: false });
    expect(menu.props("disabled")).toBe(false);
    expect(wrapper.emitted("insertSparkline")).toBeUndefined();
  });
});
