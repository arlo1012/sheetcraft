import { afterEach, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import PictureAssetTools from "../../../../modules/sheet-images/components/PictureAssetTools.vue";
import RibbonMenuButton from "../../../../shared/ribbon/RibbonMenuButton.vue";
import MenuItem from "../../../../shared/menu/MenuItem.vue";
import { createAppI18n } from "../../../../shared/i18n";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const wrapper = mount(PictureAssetTools, {
    attachTo: document.body,
    props: { disabled: false, busy: false, exportDisabled: false, ownerKey: "old-owner" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
test("Save as picture is enabled independently of mutation tools, and an old menu cannot export a new owner", async () => {
  const wrapper = fixture();
  await wrapper.setProps({ disabled: true });
  wrapper.getComponent(RibbonMenuButton).vm.$emit("activate");
  await wrapper.vm.$nextTick();
  const item = wrapper.findAllComponents(MenuItem).find((item) => item.text() === "PNG")!;
  const oldSelect = item.vm.$.vnode.props!.onSelect as () => void;
  await wrapper.setProps({ ownerKey: "new-owner" });
  oldSelect();
  expect(wrapper.emitted("export")).toBeUndefined();
  expect(wrapper.findAllComponents(MenuItem)).toHaveLength(0);
  wrapper.getComponent(RibbonMenuButton).vm.$emit("activate");
  await wrapper.vm.$nextTick();
  const current = wrapper.findAllComponents(MenuItem).find((item) => item.text() === "WebP")!;
  current.vm.$emit("select");
  expect(wrapper.emitted("export")).toEqual([["webp", false]]);
});
test("a busy or explicitly unavailable source cannot dispatch its captured export intent", async () => {
  const wrapper = fixture();
  wrapper.getComponent(RibbonMenuButton).vm.$emit("activate");
  await wrapper.vm.$nextTick();
  const select = wrapper.findAllComponents(MenuItem)[0]!.vm.$.vnode.props!.onSelect as () => void;
  await wrapper.setProps({ busy: true });
  select();
  expect(wrapper.emitted("export")).toBeUndefined();
  await wrapper.setProps({ busy: false, exportDisabled: true });
  select();
  expect(wrapper.emitted("export")).toBeUndefined();
});
