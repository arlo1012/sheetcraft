import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import PictureOwnedLeafRibbon from "../../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { pictureGroup } from "../picture-group-fixture";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const image = pictureGroup().members[0]!;
  if (image.kind !== "grouped-picture-v1") throw new Error("Expected a real picture leaf.");
  const appearance = vi.fn(() => true);
  const wrapper = mount(PictureOwnedLeafRibbon, {
    attachTo: document.body,
    props: {
      image,
      disabled: false,
      canReplace: true,
      replaceHandler: vi.fn(),
      formatHandler: vi.fn(),
      appearanceHandler: appearance,
      ownerKey: "first-leaf-owner",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { wrapper, image, appearance };
}

describe("owned leaf appearance capability", () => {
  test("renders existing appearance controls using the actual source-bearing leaf", async () => {
    const f = fixture();
    const tools = f.wrapper.getComponent(PictureAppearanceTools);
    expect(tools.props("image")).toBe(f.wrapper.props("image"));
    expect(tools.props("disabled")).toBe(false);
    await tools.get('[aria-label="Transparency"]').trigger("click");
    await flushPromises();
    tools.getComponent(InputNumber).vm.$emit("change", 25);
    expect(f.appearance).toHaveBeenCalledExactlyOnceWith({ opacity: 0.75 });
    await tools.get('[aria-label="Reset style"]').trigger("click");
    expect(f.appearance).toHaveBeenNthCalledWith(2, undefined);
    expect(f.image).not.toHaveProperty("transform");
    expect(f.image).not.toHaveProperty("width");
    expect(f.wrapper.emitted("appearance")).toBeUndefined();
  });

  test.each(["image", "owner", "handler"])(
    "captured appearance intents cannot borrow a later %s",
    async (change) => {
      const f = fixture();
      const tools = f.wrapper.getComponent(PictureAppearanceTools);
      const old = tools.vm.$.vnode.props!.onChange as (
        patch: Partial<ImageAppearance> | undefined,
      ) => void;
      const newer = vi.fn(() => true);
      if (change === "image")
        await f.wrapper.setProps({ image: { ...f.image, assetId: "replacement-asset" } });
      else if (change === "owner") await f.wrapper.setProps({ ownerKey: "reopened-leaf-owner" });
      else await f.wrapper.setProps({ appearanceHandler: newer });
      old({ transparentColor: "#AABBCC" });
      old(undefined);
      expect(f.appearance).not.toHaveBeenCalled();
      expect(newer).not.toHaveBeenCalled();
      f.wrapper.getComponent(PictureAppearanceTools).vm.$emit("change", { brightness: 1.25 });
      expect(change === "handler" ? newer : f.appearance).toHaveBeenCalledExactlyOnceWith({
        brightness: 1.25,
      });
    },
  );

  test("disabled or missing capabilities refuse old patches and disable visible tools", async () => {
    const f = fixture();
    const tools = f.wrapper.getComponent(PictureAppearanceTools);
    const old = tools.vm.$.vnode.props!.onChange as (
      patch: Partial<ImageAppearance> | undefined,
    ) => void;
    await f.wrapper.setProps({ disabled: true });
    old({ opacity: 0.5 });
    tools.vm.$emit("change", undefined);
    expect(tools.props("disabled")).toBe(true);
    expect(tools.get('[aria-label="Color"]').attributes("aria-disabled")).toBe("true");
    await f.wrapper.setProps({ disabled: false, appearanceHandler: undefined });
    old({ opacity: 0.5 });
    tools.vm.$emit("change", { opacity: 0.5 });
    expect(tools.props("disabled")).toBe(true);
    expect(f.appearance).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("appearance")).toBeUndefined();
  });

  test("an owner change discards open menus and old input callbacks cannot edit the new leaf", async () => {
    const f = fixture();
    const tools = f.wrapper.getComponent(PictureAppearanceTools);
    await tools.get('[aria-label="Color"]').trigger("click");
    await flushPromises();
    const input = tools.findAllComponents(InputNumber)[0]!;
    const oldInput = input.vm.$.vnode.props!.onChange as (value: number) => void;
    await f.wrapper.setProps({ ownerKey: "reopened-leaf-owner" });
    oldInput(125);
    expect(f.appearance).not.toHaveBeenCalled();
    const current = f.wrapper.getComponent(PictureAppearanceTools);
    expect(current.vm.$.uid).not.toBe(tools.vm.$.uid);
    expect(current.get('[aria-label="Color"]').attributes("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
