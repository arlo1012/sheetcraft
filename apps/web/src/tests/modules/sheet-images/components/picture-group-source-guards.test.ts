import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureToolbar from "../../../../modules/sheet-images/components/PictureToolbar.vue";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import PictureAssetTools from "../../../../modules/sheet-images/components/PictureAssetTools.vue";
import PictureRotationMenu from "../../../../modules/sheet-images/components/PictureRotationMenu.vue";
import RibbonButton from "../../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../../shared/ribbon/RibbonMenuButton.vue";
import { UnsupportedPictureDocumentError } from "../../../../modules/sheet-images/picture-document-support";
import { createAppI18n } from "../../../../shared/i18n";
import { group, picture } from "../group-source-guard-fixture";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function listener(value: unknown): (...args: unknown[]) => unknown {
  if (typeof value !== "function") throw new TypeError("Expected a rendered event listener.");
  return (...args) => value(...args);
}

describe("standalone ribbon owned-group refusal", () => {
  test("rejects a container before toolbar draft or source tools are established", () => {
    const container = group();
    const before = structuredClone(container);
    const resizeHandler = vi.fn(() => true);
    const aspectRatioHandler = vi.fn(() => true);
    const appearanceHandler = vi.fn(() => true);
    expect(() =>
      mount(PictureToolbar, {
        props: {
          image: container,
          geometry: { width: 200, height: 100, angleDeg: 0 },
          resizeHandler,
          aspectRatioHandler,
          appearanceHandler,
          disabled: false,
          selectionCount: 1,
          previewOnDoubleClick: true,
        },
        global: {
          plugins: [createAppI18n("en-US")],
          config: { warnHandler: () => {} },
        },
      }),
    ).toThrow(UnsupportedPictureDocumentError);
    expect(resizeHandler).not.toHaveBeenCalled();
    expect(aspectRatioHandler).not.toHaveBeenCalled();
    expect(appearanceHandler).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(container).toEqual(before);
    expect(container).not.toHaveProperty("assetId");
    expect(container).not.toHaveProperty("width");
    expect(container).not.toHaveProperty("groupId");
  });

  test("rejects a container before appearance source and menu setup", () => {
    const container = group();
    const before = structuredClone(container);
    expect(() =>
      mount(PictureAppearanceTools, {
        props: { image: container, disabled: false },
        global: {
          plugins: [createAppI18n("en-US")],
          config: { warnHandler: () => {} },
        },
      }),
    ).toThrow(UnsupportedPictureDocumentError);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(container).toEqual(before);
    expect(container).not.toHaveProperty("transform");
    expect(container).not.toHaveProperty("assetId");
  });

  test("a container replacement refuses captured toolbar intents before callbacks", async () => {
    const errors: unknown[] = [];
    const resizeHandler = vi.fn(() => true);
    const aspectRatioHandler = vi.fn(() => true);
    const appearanceHandler = vi.fn(() => true);
    const wrapper = mount(PictureToolbar, {
      props: {
        image: picture(),
        resizeHandler,
        aspectRatioHandler,
        appearanceHandler,
        disabled: false,
        selectionCount: 1,
        previewOnDoubleClick: true,
      },
      global: {
        plugins: [createAppI18n("en-US")],
        config: { errorHandler: (error) => errors.push(error), warnHandler: () => {} },
      },
    });
    mounted.push(wrapper);
    const resize = listener(wrapper.findAllComponents(InputNumber)[0]?.vm.$.vnode.props?.onChange);
    const aspect = listener(
      wrapper.getComponent(Checkbox).vm.$.vnode.props?.["onUpdate:modelValue"],
    );
    const appearance = listener(
      wrapper.getComponent(PictureAppearanceTools).vm.$.vnode.props?.onChange,
    );
    const rotate = listener(wrapper.getComponent(PictureRotationMenu).vm.$.vnode.props?.onRotate);
    const compress = listener(wrapper.getComponent(PictureAssetTools).vm.$.vnode.props?.onCompress);
    const container = group("picture");
    const before = structuredClone(container);
    await wrapper.setProps({
      image: container,
      geometry: { width: 200, height: 100, angleDeg: 0 },
    });
    expect(errors).toEqual([]);
    expect(wrapper.findComponent(PictureAppearanceTools).exists()).toBe(false);
    for (const action of [
      () => resize(150),
      () => aspect(false),
      () => appearance({ opacity: 0.5 }),
      () => rotate(1),
      () => compress(),
    ])
      expect(action).toThrow(UnsupportedPictureDocumentError);
    expect(resizeHandler).not.toHaveBeenCalled();
    expect(aspectRatioHandler).not.toHaveBeenCalled();
    expect(appearanceHandler).not.toHaveBeenCalled();
    for (const event of ["resize", "aspectRatio", "appearance", "rotate", "compress"])
      expect(wrapper.emitted(event)).toBeUndefined();
    expect(container).toEqual(before);
  });

  test("a container replacement refuses old menu edits and new menu requests", async () => {
    const errors: unknown[] = [];
    const wrapper = mount(PictureAppearanceTools, {
      attachTo: document.body,
      props: { image: picture(), disabled: false },
      global: {
        plugins: [createAppI18n("en-US")],
        config: { errorHandler: (error) => errors.push(error), warnHandler: () => {} },
      },
    });
    mounted.push(wrapper);
    await wrapper.get('[aria-label="Transparency"]').trigger("click");
    await flushPromises();
    const edit = listener(wrapper.getComponent(InputNumber).vm.$.vnode.props?.onChange);
    const color = wrapper
      .findAllComponents(RibbonMenuButton)
      .find((button) => button.props("label") === "Color")!;
    const activate = listener(color.vm.$.vnode.props?.onActivate);
    const keydown = listener(color.vm.$.vnode.props?.onKeydown);
    const reset = listener(wrapper.getComponent(RibbonButton).vm.$.vnode.props?.onActivate);
    const container = group("picture");
    const before = structuredClone(container);
    await wrapper.setProps({ image: container });
    expect(errors).toEqual([]);
    expect(wrapper.find(".picture-appearance").exists()).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(() => edit(25)).toThrow(UnsupportedPictureDocumentError);
    expect(() => reset()).toThrow(UnsupportedPictureDocumentError);
    expect(() => keydown(new KeyboardEvent("keydown", { key: "ArrowDown" }))).toThrow(
      UnsupportedPictureDocumentError,
    );
    await expect(activate()).rejects.toThrow(UnsupportedPictureDocumentError);
    expect(wrapper.emitted("change")).toBeUndefined();
    expect(container).toEqual(before);
  });
});
