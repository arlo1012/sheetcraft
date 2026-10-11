import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import {
  createWorkbook,
  getActiveSheet,
  type FloatingImage,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import PictureToolbar from "../../../../modules/sheet-images/components/PictureToolbar.vue";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import PictureArrangeTools from "../../../../modules/sheet-images/components/PictureArrangeTools.vue";
import PictureAssetTools from "../../../../modules/sheet-images/components/PictureAssetTools.vue";
import PictureRotationMenu from "../../../../modules/sheet-images/components/PictureRotationMenu.vue";
import PictureViewMenu from "../../../../modules/sheet-images/components/PictureViewMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { framedPicture } from "../framed-picture-fixture";
import { usePictureToolbarOwner } from "../../../../modules/sheet-images/usePictureToolbarOwner";
import {
  resizePictureTo,
  type PictureSizeEdit,
} from "../../../../modules/sheet-images/picture-tool-geometry";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function legacyPicture(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "asset",
    altText: "Synthetic",
    anchor: { row: 1, column: 1 },
    offsetX: 0,
    offsetY: 0,
    width: 120,
    height: 80,
  };
}
function fixture(image: FloatingImage = legacyPicture()) {
  const wrapper = mount(PictureToolbar, {
    attachTo: document.body,
    props: { image, disabled: false, selectionCount: 1, previewOnDoubleClick: true },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
function dimension(wrapper: Pick<VueWrapper, "findAllComponents">, axis: "width" | "height") {
  return wrapper
    .findAllComponents(InputNumber)
    .find((input) => input.attributes("data-picture-size") === axis)!;
}

function ownedFixture(commitResize = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.floatingImages = [framedPicture(), legacyPicture()];
  const selectedIds = ref(["framed"]);
  const revision = ref(0);
  const image = computed(() => {
    void revision.value;
    return sheet.floatingImages.find((entry) => entry.id === selectedIds.value.at(-1));
  });
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 800, height: 500 },
  });
  const context = shallowRef({
    layout,
    metrics: createPictureViewMetrics(sheet, geometry, rows),
  });
  const resize = vi.fn((source: FloatingImage, edit: PictureSizeEdit) => {
    if (commitResize) {
      const next = resizePictureTo(source, edit, context.value);
      if (!next) return false;
      sheet.floatingImages = sheet.floatingImages.map((entry) =>
        entry.id === source.id ? next : entry,
      );
      revision.value += 1;
    }
    return true;
  });
  const aspectRatio = vi.fn(() => true);
  const appearance = vi.fn(() => true);
  const Parent = defineComponent({
    setup() {
      const owner = usePictureToolbarOwner({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getGeneration: () => 0,
        getImage: () => image.value,
        getSelectedIds: () => selectedIds.value,
        getFrameContext: () => context.value,
        isBusy: () => false,
        resize,
        aspectRatio,
        appearance,
      });
      return () =>
        h(PictureToolbar, {
          image: image.value!,
          draftOwnerKey: owner.value?.draftKey,
          appearanceDraftKey: owner.value?.appearanceDraftKey,
          geometry: owner.value?.geometry,
          resizeHandler: owner.value?.resize,
          aspectRatioHandler: owner.value?.aspectRatio,
          appearanceHandler: owner.value?.appearance,
          disabled: false,
          selectionCount: selectedIds.value.length,
          previewOnDoubleClick: true,
        });
    },
  });
  const wrapper = mount(Parent, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, sheet, selectedIds, revision, image, context, resize, aspectRatio, appearance };
}

describe("picture ribbon numerical intents", () => {
  test("shows legacy fallback dimensions and emits pixel intents without mutating geometry", () => {
    const image = legacyPicture();
    const before = structuredClone(image);
    const wrapper = fixture(image);
    expect(dimension(wrapper, "width").props("modelValue")).toBe(90);
    expect(dimension(wrapper, "height").props("modelValue")).toBe(60);
    dimension(wrapper, "width").vm.$emit("change", 150);
    dimension(wrapper, "height").vm.$emit("change", 75);
    expect(wrapper.emitted("resize")).toEqual([
      [{ axis: "width", value: 200 }],
      [{ axis: "height", value: 100 }],
    ]);
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(image).toEqual(before);
  });

  test("uses only derived frame dimensions and common aspect-lock state", async () => {
    const image = { ...framedPicture(), lockAspectRatio: false };
    const before = structuredClone(image);
    const wrapper = fixture(image);
    await wrapper.setProps({ geometry: { width: 240, height: 100, angleDeg: 37 } });
    expect(dimension(wrapper, "width").props("modelValue")).toBe(180);
    expect(dimension(wrapper, "height").props("modelValue")).toBe(75);
    expect(dimension(wrapper, "width").props("disabled")).toBe(false);
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(false);
    dimension(wrapper, "height").vm.$emit("change", 120);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("resize")).toEqual([[{ axis: "height", value: 160 }]]);
    expect(wrapper.emitted("aspectRatio")).toEqual([[true]]);
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(image).toEqual(before);
    expect(image).not.toHaveProperty("width");
    expect(image).not.toHaveProperty("height");
  });

  test("unresolved or invalid frame geometry renders empty disabled size inputs", async () => {
    const wrapper = fixture(framedPicture());
    for (const axis of ["width", "height"] as const) {
      const input = dimension(wrapper, axis);
      expect(input.props("modelValue")).toBeUndefined();
      expect(input.props("disabled")).toBe(true);
      expect((input.get("input").element as HTMLInputElement).value).toBe("");
      input.vm.$emit("change", 100);
    }
    await wrapper.setProps({ geometry: { width: Number.NaN, height: 80, angleDeg: 37 } });
    expect(dimension(wrapper, "width").props("modelValue")).toBeUndefined();
    expect(dimension(wrapper, "height").props("modelValue")).toBeUndefined();
    expect(wrapper.text()).not.toContain("NaN");
    expect(wrapper.emitted("resize")).toBeUndefined();
  });

  test("rejects nonnumeric and out-of-range edits and disabled or multiselection intents", async () => {
    const wrapper = fixture();
    for (const invalid of [undefined, "100", Number.NaN, Infinity, -1, 0, 0.74, 7500.01])
      dimension(wrapper, "width").vm.$emit("change", invalid);
    for (const invalid of [undefined, "false", "true", 0, 1])
      wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", invalid);
    expect(wrapper.emitted("resize")).toBeUndefined();
    await wrapper.setProps({ disabled: true });
    dimension(wrapper, "width").vm.$emit("change", 100);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", false);
    await wrapper.setProps({ disabled: false, selectionCount: 2 });
    dimension(wrapper, "height").vm.$emit("change", 100);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("resize")).toBeUndefined();
    expect(wrapper.emitted("aspectRatio")).toBeUndefined();
  });

  test("keeps valid size boundaries and the legacy default aspect lock", () => {
    const wrapper = fixture();
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(true);
    dimension(wrapper, "width").vm.$emit("change", 0.75);
    dimension(wrapper, "height").vm.$emit("change", 7500);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("resize")).toEqual([
      [{ axis: "width", value: 1 }],
      [{ axis: "height", value: 10000 }],
    ]);
    expect(wrapper.emitted("aspectRatio")).toEqual([[false]]);
  });

  test("shows owner-reported size errors without changing the display geometry", async () => {
    const wrapper = fixture(framedPicture());
    await wrapper.setProps({
      geometry: { width: 120, height: 80, angleDeg: 37 },
      error: "Size could not be applied",
    });
    expect(wrapper.get('[role="alert"]').text()).toBe("Size could not be applied");
    expect(dimension(wrapper, "width").props("modelValue")).toBe(90);
    expect(dimension(wrapper, "height").props("modelValue")).toBe(60);
    await wrapper.setProps({ error: undefined });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  test("calls render-bound handlers without also emitting fallback intents", async () => {
    const wrapper = fixture();
    const resizeHandler = vi.fn(() => false);
    const aspectRatioHandler = vi.fn(() => false);
    const appearanceHandler = vi.fn(() => false);
    await wrapper.setProps({ resizeHandler, aspectRatioHandler, appearanceHandler });
    dimension(wrapper, "width").vm.$emit("change", 150);
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", false);
    wrapper.getComponent(PictureAppearanceTools).vm.$emit("change", { opacity: 0.5 });
    expect(resizeHandler).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 200 });
    expect(aspectRatioHandler).toHaveBeenCalledExactlyOnceWith(false);
    expect(appearanceHandler).toHaveBeenCalledExactlyOnceWith({ opacity: 0.5 });
    for (const event of ["resize", "aspectRatio", "appearance"])
      expect(wrapper.emitted(event)).toBeUndefined();
  });

  test("an embedding handler change rejects captured old callbacks even without a draft key", async () => {
    const wrapper = fixture();
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    await wrapper.setProps({ resizeHandler: first });
    const oldCallback = dimension(wrapper, "width").vm.$.vnode.props!.onChange as (
      points: unknown,
    ) => void;
    await wrapper.setProps({ resizeHandler: second });
    oldCallback(120);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(wrapper.emitted("resize")).toBeUndefined();
    dimension(wrapper, "width").vm.$emit("change", 150);
    expect(second).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 200 });
  });
});

describe("picture ribbon rendered owner identity", () => {
  test.each(["blur", "enter"] as const)(
    "typing multiple digits retains focus and commits once on %s",
    async (completion) => {
      const { wrapper, resize } = ownedFixture(true);
      const rendered = wrapper.getComponent(PictureToolbar);
      const width = dimension(rendered, "width");
      const input = width.get<HTMLInputElement>("input");
      input.element.focus();
      await input.setValue("2");
      expect(document.activeElement).toBe(input.element);
      expect(input.element.value).toBe("2");
      expect(resize).not.toHaveBeenCalled();
      await input.setValue("20");
      expect(document.activeElement).toBe(input.element);
      expect(input.element.value).toBe("20");
      expect(dimension(rendered, "width").vm.$.uid).toBe(width.vm.$.uid);
      expect(resize).not.toHaveBeenCalled();
      if (completion === "blur") input.element.blur();
      else await input.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(resize).toHaveBeenCalledTimes(1);
      expect(resize.mock.calls[0]?.[1]).toEqual({ axis: "width", value: 80 / 3 });
      expect(dimension(rendered, "width").vm.$.uid).toBe(width.vm.$.uid);
      expect(dimension(rendered, "width").props("modelValue")).toBe(20);
      if (completion === "enter") expect(document.activeElement).toBe(input.element);
    },
  );

  test("arrow and step-button commits preserve the current numeric control and focus", async () => {
    const { wrapper, resize } = ownedFixture(true);
    const rendered = wrapper.getComponent(PictureToolbar);
    const width = dimension(rendered, "width");
    const input = width.get<HTMLInputElement>("input");
    input.element.focus();
    await input.trigger("keydown", { key: "ArrowUp" });
    await flushPromises();
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize.mock.calls[0]?.[1]).toEqual({ axis: "width", value: 364 / 3 });
    expect(dimension(rendered, "width").vm.$.uid).toBe(width.vm.$.uid);
    expect(document.activeElement).toBe(input.element);
    const increase = width.get<HTMLButtonElement>(".t-input-number__increase");
    increase.element.focus();
    await increase.trigger("click");
    await flushPromises();
    expect(resize).toHaveBeenCalledTimes(2);
    expect(resize.mock.calls[1]?.[1]).toEqual({ axis: "width", value: 368 / 3 });
    expect(dimension(rendered, "width").vm.$.uid).toBe(width.vm.$.uid);
    expect(document.activeElement).toBe(increase.element);
  });

  test.each(["selection", "source", "context"] as const)(
    "an already-rendered toolbar rejects %s changes before Vue flushes new props",
    async (kind) => {
      const {
        wrapper,
        sheet,
        selectedIds,
        revision,
        image,
        context,
        resize,
        aspectRatio,
        appearance,
      } = ownedFixture();
      const rendered = wrapper.getComponent(PictureToolbar);
      const oldHandler = rendered.props("resizeHandler");
      const oldWidth = dimension(rendered, "width");
      const oldHeight = dimension(rendered, "height");
      const oldWidthCallback = oldWidth.vm.$.vnode.props!.onChange as (points: unknown) => void;
      const oldHeightCallback = oldHeight.vm.$.vnode.props!.onChange as (points: unknown) => void;
      const oldAppearance = rendered.getComponent(PictureAppearanceTools);
      const oldAppearanceCallback = oldAppearance.vm.$.vnode.props!.onChange as (patch: {
        opacity: number;
      }) => void;
      await oldWidth.get("input").setValue("90.");
      await oldHeight.get("input").setValue("60.");
      expect((oldWidth.get("input").element as HTMLInputElement).value).toBe("90.");
      expect((oldHeight.get("input").element as HTMLInputElement).value).toBe("60.");
      expect(resize).not.toHaveBeenCalled();
      await oldAppearance.get('[aria-label="Color"]').trigger("click");
      await flushPromises();
      if (kind === "selection") selectedIds.value = ["legacy"];
      if (kind === "source") {
        sheet.floatingImages[0] = { ...sheet.floatingImages[0]!, assetId: "replacement-asset" };
        revision.value += 1;
      }
      if (kind === "context") context.value = { ...context.value };
      expect(rendered.props("resizeHandler")).toBe(oldHandler);
      dimension(rendered, "width").vm.$emit("change", 150);
      rendered.getComponent(Checkbox).vm.$emit("update:modelValue", false);
      rendered.getComponent(PictureAppearanceTools).vm.$emit("change", { opacity: 0.5 });
      expect(resize).not.toHaveBeenCalled();
      expect(aspectRatio).not.toHaveBeenCalled();
      expect(appearance).not.toHaveBeenCalled();
      for (const event of ["resize", "aspectRatio", "appearance"])
        expect(rendered.emitted(event)).toBeUndefined();

      await wrapper.vm.$nextTick();
      expect(rendered.props("resizeHandler")).not.toBe(oldHandler);
      expect(wrapper.getComponent(PictureToolbar).vm.$.uid).toBe(rendered.vm.$.uid);
      expect(rendered.getComponent(PictureAppearanceTools).vm.$.uid).not.toBe(
        oldAppearance.vm.$.uid,
      );
      expect(
        rendered
          .getComponent(PictureAppearanceTools)
          .get('[aria-label="Color"]')
          .attributes("aria-expanded"),
      ).toBe("false");
      expect(dimension(rendered, "width").vm.$.uid).not.toBe(oldWidth.vm.$.uid);
      expect(dimension(rendered, "height").vm.$.uid).not.toBe(oldHeight.vm.$.uid);
      expect((dimension(rendered, "width").get("input").element as HTMLInputElement).value).toBe(
        "90.00",
      );
      expect((dimension(rendered, "height").get("input").element as HTMLInputElement).value).toBe(
        "60.00",
      );
      oldWidth.vm.$emit("change", 180);
      oldHeight.vm.$emit("change", 120);
      oldWidthCallback(180);
      oldHeightCallback(120);
      oldAppearance.vm.$emit("change", { opacity: 0.25 });
      oldAppearanceCallback({ opacity: 0.25 });
      expect(resize).not.toHaveBeenCalled();
      expect(appearance).not.toHaveBeenCalled();
      dimension(rendered, "width").vm.$emit("change", 150);
      rendered.getComponent(Checkbox).vm.$emit("update:modelValue", false);
      rendered.getComponent(PictureAppearanceTools).vm.$emit("change", { opacity: 0.5 });
      expect(resize).toHaveBeenCalledExactlyOnceWith(image.value, { axis: "width", value: 200 });
      expect(aspectRatio).toHaveBeenCalledExactlyOnceWith(image.value, false);
      expect(appearance).toHaveBeenCalledExactlyOnceWith({ opacity: 0.5 });
    },
  );

  test("own style commits keep appearance drafts open while new context discards them", async () => {
    const { wrapper, sheet, revision, appearance, context } = ownedFixture();
    const rendered = wrapper.getComponent(PictureToolbar);
    const oldAppearance = rendered.getComponent(PictureAppearanceTools);
    await oldAppearance.get('[aria-label="Color"]').trigger("click");
    await flushPromises();
    const brightness = oldAppearance.findAllComponents(InputNumber)[0]!;
    brightness.vm.$emit("change", 125);
    expect(appearance).toHaveBeenCalledExactlyOnceWith({ brightness: 1.25 });
    sheet.floatingImages[0] = {
      ...sheet.floatingImages[0]!,
      transform: { appearance: { brightness: 1.25 } },
    };
    revision.value += 1;
    await wrapper.vm.$nextTick();
    expect(rendered.getComponent(PictureAppearanceTools).vm.$.uid).toBe(oldAppearance.vm.$.uid);
    expect(oldAppearance.get('[aria-label="Color"]').attributes("aria-expanded")).toBe("true");
    expect(oldAppearance.findAllComponents(InputNumber)[0]!.vm.$.uid).toBe(brightness.vm.$.uid);
    brightness.vm.$emit("change", 150);
    expect(appearance).toHaveBeenNthCalledWith(2, { brightness: 1.5 });
    context.value = { ...context.value };
    await wrapper.vm.$nextTick();
    expect(rendered.getComponent(PictureAppearanceTools).vm.$.uid).not.toBe(oldAppearance.vm.$.uid);
    expect(
      rendered
        .getComponent(PictureAppearanceTools)
        .get('[aria-label="Color"]')
        .attributes("aria-expanded"),
    ).toBe("false");
    brightness.vm.$emit("change", 175);
    expect(appearance).toHaveBeenCalledTimes(2);
  });
});

describe("framed picture ribbon capability boundary", () => {
  test("disables unsupported frame consumers while keeping ready tools available", async () => {
    const image = { ...framedPicture(), groupId: "existing-group" };
    const wrapper = fixture(image);
    await wrapper.setProps({ geometry: { width: 120, height: 80, angleDeg: 37 } });
    for (const action of ["replace", "convert-to-cell", "crop", "restore", "annotate"]) {
      expect(wrapper.get(`[data-picture-tool="${action}"]`).attributes("aria-disabled")).toBe(
        "true",
      );
      await wrapper.get(`[data-picture-tool="${action}"]`).trigger("click");
    }
    expect(wrapper.getComponent(PictureAssetTools).props()).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(wrapper.getComponent(PictureViewMenu).props("disabled")).toBe(true);
    expect(wrapper.getComponent(PictureRotationMenu).props("disabled")).toBe(false);
    expect(wrapper.getComponent(PictureAppearanceTools).props("disabled")).toBe(false);
    expect(wrapper.getComponent(PictureArrangeTools).props()).toMatchObject({
      disabled: false,
      groupDisabled: true,
      alignmentDisabled: true,
    });
    for (const label of ["Group", "Ungroup", "Align"])
      expect(
        wrapper.get(`.picture-arrange [aria-label="${label}"]`).attributes("aria-disabled"),
      ).toBe("true");
    expect(
      wrapper.get('.picture-arrange [aria-label="Bring to front"]').attributes("aria-disabled"),
    ).toBe("false");
    expect(
      wrapper.get('.picture-arrange [aria-label="Selection pane"]').attributes("aria-disabled"),
    ).toBe("false");
    for (const event of ["replace", "convertToCell", "crop", "restore", "annotate"])
      expect(wrapper.emitted(event)).toBeUndefined();
    wrapper.getComponent(PictureRotationMenu).vm.$emit("rotate", 1);
    wrapper.getComponent(PictureRotationMenu).vm.$emit("flip", "horizontal");
    wrapper.getComponent(PictureAppearanceTools).vm.$emit("change", { opacity: 0.5 });
    await wrapper.get('.picture-arrange [aria-label="Bring to front"]').trigger("click");
    expect(wrapper.emitted("rotate")).toEqual([[1]]);
    expect(wrapper.emitted("flip")).toEqual([["horizontal"]]);
    expect(wrapper.emitted("appearance")).toEqual([[{ opacity: 0.5 }]]);
    expect(wrapper.emitted("layer")).toEqual([["front"]]);
  });

  test("retains existing legacy tool availability", async () => {
    const wrapper = fixture({ ...legacyPicture(), groupId: "existing-group" });
    for (const action of ["replace", "convert-to-cell", "crop", "restore", "annotate"])
      expect(wrapper.get(`[data-picture-tool="${action}"]`).attributes("aria-disabled")).toBe(
        "false",
      );
    await wrapper.setProps({ selectionCount: 2 });
    expect(wrapper.get('.picture-arrange [aria-label="Group"]').attributes("aria-disabled")).toBe(
      "false",
    );
    expect(wrapper.get('.picture-arrange [aria-label="Ungroup"]').attributes("aria-disabled")).toBe(
      "false",
    );
    expect(wrapper.getComponent(PictureAssetTools).props()).toMatchObject({
      disabled: false,
      busy: false,
    });
  });
});
