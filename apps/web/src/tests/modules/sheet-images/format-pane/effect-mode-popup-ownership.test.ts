import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import type { Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import PictureReflectionEditor from "../../../../modules/sheet-images/components/format-pane/PictureReflectionEditor.vue";
import PictureGlowEditor from "../../../../modules/sheet-images/components/format-pane/PictureGlowEditor.vue";
import PictureSoftEdgesEditor from "../../../../modules/sheet-images/components/format-pane/PictureSoftEdgesEditor.vue";
import PictureFormat3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import PictureRotation3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import {
  createPictureReflection,
  createPictureGlow,
  createPictureSoftEdges,
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../../modules/sheet-images/picture-effect-edit";
import { createAppI18n } from "../../../../shared/i18n";
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(component: Component = PictureGlowEditor, extra: Record<string, unknown> = {}) {
  const onCommit = vi.fn(() => true);
  const wrapper = mount(component, {
    attachTo: document.body,
    props: {
      ownerKey: "picture-owner",
      value: { kind: "none" },
      t: (key: string) => key,
      onCommit,
      ...extra,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { PicturePresetGallery: true, PicturePaintNumber: true, PicturePaintColor: true },
    },
  });
  mounted.push(wrapper);
  return { wrapper, onCommit, select: wrapper.getComponent(Select) };
}
async function open(select: VueWrapper) {
  await flushPromises();
  for (const target of select.findAll(".t-input__wrap, .t-input, .t-select-input, .t-select__wrap"))
    vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 132, 28),
    );
  await select.get(".t-input").trigger("click");
  await vi.waitFor(() => expect(select.props("popupVisible")).toBe(true));
  const host = (select.props("popupProps") as { attach: () => HTMLElement }).attach();
  expect(host.parentElement).toBe(document.body);
  return host;
}
test.each([
  ["reflection", PictureReflectionEditor, "value", createPictureReflection()],
  ["glow", PictureGlowEditor, "value", createPictureGlow()],
  ["softEdges", PictureSoftEdgesEditor, "value", createPictureSoftEdges()],
  ["format3d", PictureFormat3dEditor, "value", createPictureFormat3d()],
  ["rotation3d", PictureRotation3dEditor, "parallel", createPictureRotation3d()],
] as const)(
  "standalone %s keeps its existing None, Inherit and default-value command semantics",
  (_name, component, selected, value) => {
    const f = fixture(component);
    f.select.vm.$emit("change", "inherit");
    expect(f.onCommit).toHaveBeenLastCalledWith(undefined);
    f.select.vm.$emit("change", "none");
    expect(f.onCommit).toHaveBeenLastCalledWith({ kind: "none" });
    f.select.vm.$emit("change", selected);
    expect(f.onCommit).toHaveBeenLastCalledWith({ kind: "value", value });
    expect(f.onCommit).toHaveBeenCalledTimes(3);
  },
);
test.each(["owner", "disabled"] as const)(
  "Glow's native popup and captured callback retire after %s",
  async (boundary) => {
    const f = fixture(),
      host = await open(f.select);
    const change = f.select.vm.$.vnode.props!.onChange as (value: unknown) => void;
    expect(host.querySelector("li.t-select-option")).not.toBeNull();
    if (boundary === "owner") await f.wrapper.setProps({ ownerKey: "replacement-picture" });
    else await f.wrapper.setProps({ disabled: true });
    expect(f.select.props("popupVisible")).toBe(false);
    change("value");
    await flushPromises();
    expect(f.onCommit).not.toHaveBeenCalled();
  },
);
test("Rotation3d valueDisabled retains safe resets while rejecting projection choices and stale permission callbacks", async () => {
  const f = fixture(PictureRotation3dEditor, { valueDisabled: true });
  f.select.vm.$emit("change", "parallel");
  expect(f.onCommit).not.toHaveBeenCalled();
  f.select.vm.$emit("change", "none");
  expect(f.onCommit).toHaveBeenLastCalledWith({ kind: "none" });
  f.select.vm.$emit("change", "inherit");
  expect(f.onCommit).toHaveBeenLastCalledWith(undefined);
  expect(f.select.props("disabled")).toBe(false);
  const old = f.select.vm.$.vnode.props!.onChange as (value: unknown) => void;
  await f.wrapper.setProps({ valueDisabled: false });
  f.onCommit.mockClear();
  old("parallel");
  expect(f.onCommit).not.toHaveBeenCalled();
  f.select.vm.$emit("change", "parallel");
  expect(f.onCommit).toHaveBeenCalledExactlyOnceWith({
    kind: "value",
    value: createPictureRotation3d(),
  });
});
