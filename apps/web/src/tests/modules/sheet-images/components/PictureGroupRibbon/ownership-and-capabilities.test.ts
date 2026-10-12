import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureAppearanceTools from "../../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import PictureArrangeTools from "../../../../../modules/sheet-images/components/PictureArrangeTools.vue";
import PictureAssetTools from "../../../../../modules/sheet-images/components/PictureAssetTools.vue";
import PictureRotationMenu from "../../../../../modules/sheet-images/components/PictureRotationMenu.vue";
import PictureViewMenu from "../../../../../modules/sheet-images/components/PictureViewMenu.vue";
import ImageInsertMenu from "../../../../../modules/home-tools/components/ImageInsertMenu.vue";
import RibbonButton from "../../../../../shared/ribbon/RibbonButton.vue";
import { dimension, fixture, listener } from "./fixture";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

describe("owned group ribbon context ownership", () => {
  test.each(["group", "draft", "handlers"] as const)(
    "rejects captured numerical and aspect callbacks after a %s replacement",
    async (change) => {
      const { image, wrapper, resizeHandler, aspectRatioHandler } = fixture();
      mounted.push(wrapper);
      const width = dimension(wrapper, "width");
      const oldChange = listener(width.vm.$.vnode.props?.onChange);
      const oldEnter = listener(width.vm.$.vnode.props?.onEnter);
      const oldAspect = listener(
        wrapper.getComponent(Checkbox).vm.$.vnode.props?.["onUpdate:modelValue"],
      );
      await width.get("input").setValue("90.");
      expect((width.get("input").element as HTMLInputElement).value).toBe("90.");
      expect(resizeHandler).not.toHaveBeenCalled();
      const nextResize = vi.fn(() => true);
      const nextAspect = vi.fn(() => true);
      if (change === "group") await wrapper.setProps({ image: { ...image, id: "new-group" } });
      if (change === "draft") await wrapper.setProps({ draftOwnerKey: 2 });
      if (change === "handlers")
        await wrapper.setProps({ resizeHandler: nextResize, aspectRatioHandler: nextAspect });
      oldChange(150);
      oldEnter(150);
      oldAspect(true);
      expect(resizeHandler).not.toHaveBeenCalled();
      expect(aspectRatioHandler).not.toHaveBeenCalled();
      expect(nextResize).not.toHaveBeenCalled();
      expect(nextAspect).not.toHaveBeenCalled();
      if (change !== "handlers") {
        expect(dimension(wrapper, "width").vm.$.uid).not.toBe(width.vm.$.uid);
        expect((dimension(wrapper, "width").get("input").element as HTMLInputElement).value).toBe(
          "90.00",
        );
      }
      dimension(wrapper, "width").vm.$emit("change", 150);
      wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
      const currentResize = change === "handlers" ? nextResize : resizeHandler;
      const currentAspect = change === "handlers" ? nextAspect : aspectRatioHandler;
      expect(currentResize).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 200 });
      expect(currentAspect).toHaveBeenCalledExactlyOnceWith(true);
    },
  );

  test("a changed handler refuses captured callbacks even without a draft owner key", async () => {
    const { wrapper, resizeHandler, aspectRatioHandler } = fixture();
    mounted.push(wrapper);
    await wrapper.setProps({ draftOwnerKey: undefined });
    const oldChange = listener(dimension(wrapper, "width").vm.$.vnode.props?.onChange);
    const oldAspect = listener(
      wrapper.getComponent(Checkbox).vm.$.vnode.props?.["onUpdate:modelValue"],
    );
    const nextResize = vi.fn(() => true);
    const nextAspect = vi.fn(() => true);
    await wrapper.setProps({ resizeHandler: nextResize, aspectRatioHandler: nextAspect });
    oldChange(150);
    oldAspect(true);
    expect(resizeHandler).not.toHaveBeenCalled();
    expect(aspectRatioHandler).not.toHaveBeenCalled();
    expect(nextResize).not.toHaveBeenCalled();
    expect(nextAspect).not.toHaveBeenCalled();
  });

  test("new owners close prior menus and reject captured arrangement, rotation, and pane actions", async () => {
    const { wrapper } = fixture();
    mounted.push(wrapper);
    const rotation = wrapper.getComponent(PictureRotationMenu);
    const arrange = wrapper.getComponent(PictureArrangeTools);
    const format = wrapper
      .findAllComponents(RibbonButton)
      .find((button) => button.attributes("data-picture-group-action") === "format")!;
    const oldRotate = listener(rotation.vm.$.vnode.props?.onRotate);
    const oldFlip = listener(rotation.vm.$.vnode.props?.onFlip);
    const oldLayer = listener(arrange.vm.$.vnode.props?.onLayer);
    const oldSelectionPane = listener(arrange.vm.$.vnode.props?.onSelectionPane);
    const oldFormat = listener(format.vm.$.vnode.props?.onActivate);
    await rotation.get('[aria-label="Rotate"]').trigger("click");
    await flushPromises();
    expect(document.querySelector('[data-picture-tool="rotate-right"]')).not.toBeNull();
    await wrapper.setProps({ draftOwnerKey: 2 });
    expect(wrapper.getComponent(PictureRotationMenu).vm.$.uid).not.toBe(rotation.vm.$.uid);
    expect(wrapper.getComponent(PictureArrangeTools).vm.$.uid).not.toBe(arrange.vm.$.uid);
    expect(document.querySelector('[data-picture-tool="rotate-right"]')).toBeNull();
    oldRotate(1);
    oldFlip("horizontal");
    oldLayer("front");
    oldSelectionPane();
    oldFormat();
    for (const event of ["rotate", "flip", "layer", "selectionPane", "format"])
      expect(wrapper.emitted(event)).toBeUndefined();
    wrapper.getComponent(PictureRotationMenu).vm.$emit("rotate", 1);
    expect(wrapper.emitted("rotate")).toEqual([[1]]);
  });
});

describe("owned group ribbon source-free capabilities", () => {
  test("has group geometry and source-aware compression while keeping source-free actions unavailable", async () => {
    const { image, wrapper } = fixture();
    mounted.push(wrapper);
    const before = structuredClone(image);
    expect(wrapper.find("[data-picture-group-ribbon]").exists()).toBe(true);
    expect(wrapper.getComponent(PictureArrangeTools).props()).toMatchObject({
      disabled: false,
      count: 1,
      grouped: true,
    });
    expect(wrapper.get('.picture-arrange [aria-label="Group"]').attributes("aria-disabled")).toBe(
      "true",
    );
    expect(wrapper.get('.picture-arrange [aria-label="Ungroup"]').attributes("aria-disabled")).toBe(
      "false",
    );
    expect(wrapper.getComponent(PictureRotationMenu).props("disabled")).toBe(false);
    for (const component of [PictureAppearanceTools, PictureViewMenu, ImageInsertMenu])
      expect(wrapper.findComponent(component).exists()).toBe(false);
    expect(wrapper.getComponent(PictureAssetTools).props()).toMatchObject({
      disabled: false,
      exportDisabled: true,
      printDisabled: true,
    });
    for (const action of ["replace", "convert-to-cell", "crop", "restore", "annotate"])
      expect(wrapper.find(`[data-picture-tool="${action}"]`).exists()).toBe(false);
    expect(wrapper.find("img").exists()).toBe(false);
    wrapper.getComponent(PictureAssetTools).vm.$emit("compress");
    wrapper.getComponent(PictureAssetTools).vm.$emit("batchSize");
    expect(wrapper.emitted("compress")).toEqual([[]]);
    expect(wrapper.emitted("batchSize")).toEqual([[]]);
    wrapper.getComponent(PictureRotationMenu).vm.$emit("rotate", 1);
    wrapper.getComponent(PictureRotationMenu).vm.$emit("flip", "horizontal");
    wrapper.getComponent(PictureArrangeTools).vm.$emit("align", "grid");
    await wrapper.get('.picture-arrange [aria-label="Ungroup"]').trigger("click");
    await wrapper.get('.picture-arrange [aria-label="Bring to front"]').trigger("click");
    await wrapper.get('.picture-arrange [aria-label="Selection pane"]').trigger("click");
    await wrapper.get('[data-picture-group-action="format"]').trigger("click");
    expect(wrapper.emitted("rotate")).toEqual([[1]]);
    expect(wrapper.emitted("flip")).toEqual([["horizontal"]]);
    expect(wrapper.emitted("align")).toEqual([["grid"]]);
    expect(wrapper.emitted("ungroup")).toEqual([[]]);
    expect(wrapper.emitted("layer")).toEqual([["front"]]);
    expect(wrapper.emitted("selectionPane")).toEqual([[]]);
    expect(wrapper.emitted("format")).toEqual([[]]);
    expect(image).toEqual(before);
    expect(image.members).toEqual(before.members);
    expect(image).not.toHaveProperty("assetId");
    expect(image).not.toHaveProperty("groupId");
    expect(image).not.toHaveProperty("transform");
  });

  test("keeps multi-object arrangement available while disabling single-group size edits", async () => {
    const { wrapper } = fixture();
    mounted.push(wrapper);
    await wrapper.setProps({ selectionCount: 3 });
    expect(wrapper.getComponent(PictureArrangeTools).props("count")).toBe(3);
    expect(wrapper.get('.picture-arrange [aria-label="Group"]').attributes("aria-disabled")).toBe(
      "false",
    );
    expect(dimension(wrapper, "width").props("disabled")).toBe(true);
    expect(wrapper.getComponent(Checkbox).props("disabled")).toBe(true);
    await wrapper.get('.picture-arrange [aria-label="Group"]').trigger("click");
    expect(wrapper.emitted("group")).toEqual([[]]);
  });

  test("disabled editing blocks transformation and formatting intents", async () => {
    const { wrapper } = fixture();
    mounted.push(wrapper);
    await wrapper.setProps({ disabled: true });
    const rotation = wrapper.getComponent(PictureRotationMenu);
    const arrange = wrapper.getComponent(PictureArrangeTools);
    expect(rotation.props("disabled")).toBe(true);
    expect(arrange.props("disabled")).toBe(true);
    rotation.vm.$emit("rotate", -1);
    rotation.vm.$emit("flip", "vertical");
    arrange.vm.$emit("group");
    arrange.vm.$emit("ungroup");
    arrange.vm.$emit("align", "grid");
    arrange.vm.$emit("layer", "front");
    await wrapper.get('[data-picture-group-action="format"]').trigger("click");
    for (const event of ["rotate", "flip", "group", "ungroup", "align", "layer", "format"])
      expect(wrapper.emitted(event)).toBeUndefined();
    await wrapper.get('.picture-arrange [aria-label="Selection pane"]').trigger("click");
    expect(wrapper.emitted("selectionPane")).toEqual([[]]);
  });
});
