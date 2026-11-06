// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import InsertToolbar from "../../../modules/insert-tools/components/InsertToolbar.vue";
import FormControlInsertMenu from "../../../modules/form-controls/components/FormControlInsertMenu.vue";
import { createAppI18n } from "../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
});

function fixture() {
  const wrapper = shallowMount(InsertToolbar, {
    props: {
      disabled: false,
      pivotDisabled: false,
      pivotManageDisabled: false,
      hasPivot: false,
      imageDisabled: false,
      symbolDisabled: false,
      sparklineDisabled: false,
      hyperlinkDisabled: false,
      hasTable: false,
      shapeOwnerId: "sheet-1",
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { RibbonToolbar: { template: "<div><slot /></div>" } },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("InsertToolbar form controls", () => {
  test.each([
    "checkbox",
    "radio",
    "combo",
    "list",
    "spinner",
    "scrollbar",
    "button",
    "label",
    "group",
  ] as const)("forwards the selected %s type to the owner", (type) => {
    const wrapper = fixture();
    wrapper.getComponent(FormControlInsertMenu).vm.$emit("insert", type);
    expect(wrapper.emitted("insertControl")).toEqual([[type]]);
  });

  test("updates the form control menu's disabled state and owning sheet", async () => {
    const wrapper = fixture();
    const menu = wrapper.getComponent(FormControlInsertMenu);
    expect(menu.props()).toMatchObject({ disabled: false, ownerId: "sheet-1" });
    await wrapper.setProps({ imageDisabled: true, shapeOwnerId: "sheet-2" });
    expect(menu.props()).toMatchObject({ disabled: true, ownerId: "sheet-2" });
    expect(wrapper.emitted("insertControl")).toBeUndefined();
  });
});
