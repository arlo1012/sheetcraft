import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, shallowRef } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureGroupRibbon from "../../../../../modules/sheet-images/components/PictureGroupRibbon.vue";
import type {
  PictureSizeEdit,
  PictureToolGeometry,
} from "../../../../../modules/sheet-images/picture-tool-geometry";
import { createAppI18n } from "../../../../../shared/i18n";
import { pictureGroup } from "../../picture-group-fixture";
import { dimension, fixture } from "./fixture";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

describe("owned group ribbon numerical intents", () => {
  test("shows derived dimensions, defaults aspect lock off, and edits through typed handlers", () => {
    const { image, wrapper, resizeHandler, aspectRatioHandler } = fixture();
    mounted.push(wrapper);
    const before = structuredClone(image);
    expect(dimension(wrapper, "width").props("modelValue")).toBe(90);
    expect(dimension(wrapper, "height").props("modelValue")).toBe(60);
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(false);
    dimension(wrapper, "width").vm.$emit("change", 150);
    dimension(wrapper, "height").vm.$emit("change", 75);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    expect(resizeHandler).toHaveBeenNthCalledWith(1, { axis: "width", value: 200 });
    expect(resizeHandler).toHaveBeenNthCalledWith(2, { axis: "height", value: 100 });
    expect(aspectRatioHandler).toHaveBeenCalledExactlyOnceWith(true);
    for (const event of ["resize", "aspectRatio", "update"])
      expect(wrapper.emitted(event)).toBeUndefined();
    expect(image).toEqual(before);
    expect(image).not.toHaveProperty("assetId");
    expect(image).not.toHaveProperty("width");
    expect(image).not.toHaveProperty("height");
  });

  test("handler refusal keeps the displayed geometry and aspect lock from props", async () => {
    const { image, wrapper } = fixture();
    mounted.push(wrapper);
    const resizeHandler = vi.fn(() => false);
    const aspectRatioHandler = vi.fn(() => false);
    await wrapper.setProps({
      resizeHandler,
      aspectRatioHandler,
      error: "Size could not be applied",
    });
    dimension(wrapper, "width").vm.$emit("change", 150);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    expect(resizeHandler).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 200 });
    expect(aspectRatioHandler).toHaveBeenCalledExactlyOnceWith(true);
    expect(dimension(wrapper, "width").props("modelValue")).toBe(90);
    expect(dimension(wrapper, "height").props("modelValue")).toBe(60);
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toBe("Size could not be applied");
    expect(image).not.toHaveProperty("lockAspectRatio");
    expect(wrapper.emitted("resize")).toBeUndefined();
    expect(wrapper.emitted("aspectRatio")).toBeUndefined();
  });

  test("unresolved and invalid geometry cannot establish invented group dimensions", async () => {
    const { wrapper, resizeHandler } = fixture();
    mounted.push(wrapper);
    for (const geometry of [
      undefined,
      { width: Number.NaN, height: 80, angleDeg: 37 },
      { width: 120, height: 0, angleDeg: 37 },
    ]) {
      await wrapper.setProps({ geometry });
      for (const axis of ["width", "height"] as const) {
        const input = dimension(wrapper, axis);
        expect(input.props("modelValue")).toBeUndefined();
        expect(input.props("disabled")).toBe(true);
        expect((input.get("input").element as HTMLInputElement).value).toBe("");
        input.vm.$emit("change", 100);
      }
    }
    expect(wrapper.text()).not.toContain("NaN");
    expect(resizeHandler).not.toHaveBeenCalled();
  });

  test("rejects invalid edits and accepts the pixel bounds", () => {
    const { wrapper, resizeHandler, aspectRatioHandler } = fixture();
    mounted.push(wrapper);
    for (const invalid of [undefined, "100", Number.NaN, Infinity, -1, 0, 0.74, 7500.01])
      dimension(wrapper, "width").vm.$emit("change", invalid);
    for (const invalid of [undefined, "false", 0, 1])
      wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", invalid);
    expect(resizeHandler).not.toHaveBeenCalled();
    expect(aspectRatioHandler).not.toHaveBeenCalled();
    dimension(wrapper, "width").vm.$emit("change", 0.75);
    dimension(wrapper, "height").vm.$emit("change", 7500);
    expect(resizeHandler).toHaveBeenNthCalledWith(1, { axis: "width", value: 1 });
    expect(resizeHandler).toHaveBeenNthCalledWith(2, { axis: "height", value: 10000 });
  });

  test("disabled, multiselection, and absent handlers cannot commit numerical edits", async () => {
    const { wrapper, resizeHandler, aspectRatioHandler } = fixture();
    mounted.push(wrapper);
    for (const props of [
      { disabled: true, selectionCount: 1 },
      { disabled: false, selectionCount: 2 },
      {
        disabled: false,
        selectionCount: 1,
        resizeHandler: undefined,
        aspectRatioHandler: undefined,
      },
    ]) {
      await wrapper.setProps(props);
      expect(dimension(wrapper, "width").props("disabled")).toBe(true);
      expect(wrapper.getComponent(Checkbox).props("disabled")).toBe(true);
      dimension(wrapper, "width").vm.$emit("change", 150);
      wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    }
    expect(resizeHandler).not.toHaveBeenCalled();
    expect(aspectRatioHandler).not.toHaveBeenCalled();
    expect(wrapper.emitted("resize")).toBeUndefined();
    expect(wrapper.emitted("aspectRatio")).toBeUndefined();
  });
});

describe("owned group ribbon stable numeric drafts", () => {
  function committedFixture() {
    const image = shallowRef(pictureGroup());
    const geometry = shallowRef<PictureToolGeometry>({ width: 120, height: 80, angleDeg: 37 });
    const resizeHandler = vi.fn((edit: PictureSizeEdit) => {
      geometry.value = { ...geometry.value, [edit.axis]: edit.value };
      image.value = { ...image.value };
      return true;
    });
    const aspectRatioHandler = vi.fn(() => true);
    const Parent = defineComponent({
      setup: () => () =>
        h(PictureGroupRibbon, {
          image: image.value,
          geometry: geometry.value,
          draftOwnerKey: 1,
          resizeHandler,
          aspectRatioHandler,
          disabled: false,
          selectionCount: 1,
        }),
    });
    const wrapper = mount(Parent, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    return { wrapper, resizeHandler };
  }

  test.each(["blur", "enter"] as const)(
    "typing several digits keeps focus and commits once on %s",
    async (completion) => {
      const { wrapper, resizeHandler } = committedFixture();
      const ribbon = wrapper.getComponent(PictureGroupRibbon);
      const width = dimension(ribbon, "width");
      const input = width.get<HTMLInputElement>("input");
      input.element.focus();
      await input.setValue("2");
      expect(input.element.value).toBe("2");
      expect(document.activeElement).toBe(input.element);
      await input.setValue("20");
      expect(input.element.value).toBe("20");
      expect(document.activeElement).toBe(input.element);
      expect(dimension(ribbon, "width").vm.$.uid).toBe(width.vm.$.uid);
      expect(resizeHandler).not.toHaveBeenCalled();
      if (completion === "blur") input.element.blur();
      else await input.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(resizeHandler).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 80 / 3 });
      expect(dimension(ribbon, "width").props("modelValue")).toBe(20);
      expect(dimension(ribbon, "width").vm.$.uid).toBe(width.vm.$.uid);
      if (completion === "enter") expect(document.activeElement).toBe(input.element);
    },
  );

  test("arrow and step controls keep their instance and focus after owned commits", async () => {
    const { wrapper, resizeHandler } = committedFixture();
    const ribbon = wrapper.getComponent(PictureGroupRibbon);
    const width = dimension(ribbon, "width");
    const input = width.get<HTMLInputElement>("input");
    input.element.focus();
    await input.trigger("keydown", { key: "ArrowUp" });
    await flushPromises();
    expect(resizeHandler).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 364 / 3 });
    expect(dimension(ribbon, "width").vm.$.uid).toBe(width.vm.$.uid);
    expect(document.activeElement).toBe(input.element);
    const increase = width.get<HTMLButtonElement>(".t-input-number__increase");
    increase.element.focus();
    await increase.trigger("click");
    await flushPromises();
    expect(resizeHandler).toHaveBeenNthCalledWith(2, { axis: "width", value: 368 / 3 });
    expect(dimension(ribbon, "width").vm.$.uid).toBe(width.vm.$.uid);
    expect(document.activeElement).toBe(increase.element);
  });
});
