import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import RibbonMenuButton from "../../../../shared/ribbon/RibbonMenuButton.vue";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import ColorPalette from "../../../../shared/color/ColorPalette.vue";
import MenuItem from "../../../../shared/menu/MenuItem.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { framedPicture } from "../framed-picture-fixture";
import { pictureGroup } from "../picture-group-fixture";

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
    transform: { rotation: 90, appearance: { opacity: 0.5 } },
  };
}
function ownedPicture(): GroupedPicture {
  const leaf = pictureGroup().members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected a real picture leaf.");
  return { ...leaf, transform: { appearance: { opacity: 0.5 } } };
}
function fixture(image: FloatingImage | GroupedPicture) {
  const wrapper = mount(PictureAppearanceTools, {
    attachTo: document.body,
    props: { image, disabled: false },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function openMenu(wrapper: VueWrapper, label: string): Promise<void> {
  await wrapper.get(`[aria-label="${label}"]`).trigger("click");
  await flushPromises();
}

describe("picture appearance union-safe intents", () => {
  test.each(["legacy", "frame", "owned"])(
    "emits shared appearance patches only for %s pictures",
    async (kind) => {
      const image =
        kind === "legacy"
          ? legacyPicture()
          : kind === "frame"
            ? { ...framedPicture(), transform: { appearance: { opacity: 0.5 } } }
            : ownedPicture();
      const before = structuredClone(image);
      const wrapper = fixture(image);
      await openMenu(wrapper, "Transparency");
      const input = wrapper.getComponent(InputNumber);
      expect(input.props("modelValue")).toBe(50);
      input.vm.$emit("change", 25);
      expect(wrapper.emitted("change")).toEqual([[{ opacity: 0.75 }]]);
      expect(wrapper.emitted("update")).toBeUndefined();
      await wrapper.get('[aria-label="Reset style"]').trigger("click");
      expect(wrapper.emitted("change")).toEqual([[{ opacity: 0.75 }], [undefined]]);
      expect(image).toEqual(before);
    },
  );

  test.each(["frame", "owned"])(
    "disables %s reflection and leaves shadow presets usable",
    async (kind) => {
      const wrapper = fixture(kind === "frame" ? framedPicture() : ownedPicture());
      await openMenu(wrapper, "Effects");
      const reflection = wrapper.getComponent(Checkbox);
      expect(reflection.props("disabled")).toBe(true);
      reflection.vm.$emit("update:modelValue", true);
      expect(wrapper.emitted("change")).toBeUndefined();
      const shadow = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (item) => item.textContent?.trim() === "Soft shadow",
      )!;
      shadow.click();
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("change")).toEqual([[{ shadow: "soft" }]]);
      expect(wrapper.emitted("update")).toBeUndefined();
    },
  );

  test("keeps reflection available to legacy pictures", async () => {
    const wrapper = fixture(legacyPicture());
    await openMenu(wrapper, "Effects");
    const reflection = wrapper.getComponent(Checkbox);
    expect(reflection.props("disabled")).toBe(false);
    reflection.vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("change")).toEqual([[{ reflection: true }]]);
  });

  test("a disabled frame reflection design leaves the menu open and emits nothing", async () => {
    const wrapper = fixture(framedPicture());
    await openMenu(wrapper, "Picture design");
    const reflection = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "Reflection",
    )!;
    expect(reflection.getAttribute("aria-disabled")).toBe("true");
    reflection.click();
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(wrapper.emitted("change")).toBeUndefined();
  });

  test.each(["legacy", "frame", "owned"])(
    "rejects invalid border widths for %s pictures",
    async (kind) => {
      const wrapper = fixture(
        kind === "legacy" ? legacyPicture() : kind === "frame" ? framedPicture() : ownedPicture(),
      );
      await openMenu(wrapper, "Border");
      const input = wrapper.getComponent(InputNumber);
      for (const invalid of [undefined, "2", Number.NaN, Infinity, -1, 20.01])
        input.vm.$emit("change", invalid);
      expect(wrapper.emitted("change")).toBeUndefined();
      input.vm.$emit("change", 2);
      expect(wrapper.emitted("change")).toEqual([[{ border: { color: "#000000", width: 2 } }]]);
    },
  );

  test.each(["legacy", "owned"])(
    "%s source changes discard drafts while own appearance changes stay open",
    async (kind) => {
      const image = kind === "legacy" ? legacyPicture() : ownedPicture();
      const wrapper = fixture(image);
      await openMenu(wrapper, "Transparency");
      const oldInput = wrapper.getComponent(InputNumber);
      await oldInput.get("input").setValue("50.");
      expect((oldInput.get("input").element as HTMLInputElement).value).toBe("50.");
      await wrapper.setProps({ image: { ...image, transform: { appearance: { opacity: 0.25 } } } });
      expect(wrapper.get('[aria-label="Transparency"]').attributes("aria-expanded")).toBe("true");
      expect(wrapper.getComponent(InputNumber).vm.$.uid).toBe(oldInput.vm.$.uid);
      await wrapper.setProps({ image: { ...image, assetId: "replacement-asset" } });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      oldInput.vm.$emit("change", 20);
      expect(wrapper.emitted("change")).toBeUndefined();
      await openMenu(wrapper, "Transparency");
      expect(wrapper.getComponent(InputNumber).vm.$.uid).not.toBe(oldInput.vm.$.uid);
      expect(
        (wrapper.getComponent(InputNumber).get("input").element as HTMLInputElement).value,
      ).toBe("50");
    },
  );

  test.each(["frame", "owned"])(
    "an asynchronous %s old-source menu request cannot reopen after replacement",
    async (kind) => {
      const image = kind === "frame" ? framedPicture() : ownedPicture();
      const wrapper = fixture(image);
      const effects = wrapper
        .findAllComponents(RibbonMenuButton)
        .find((button) => button.props("label") === "Effects")!;
      effects.vm.$emit("activate");
      await wrapper.setProps({ image: { ...image, assetId: "replacement-asset" } });
      await flushPromises();
      expect(wrapper.get('[aria-label="Effects"]').attributes("aria-expanded")).toBe("false");
      expect(document.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test("disabled tools and invalid numeric changes do not emit patches", async () => {
    const wrapper = fixture(framedPicture());
    await openMenu(wrapper, "Color");
    const input = wrapper.findAllComponents(InputNumber)[0]!;
    for (const invalid of [undefined, "100", Number.NaN, Infinity])
      input.vm.$emit("change", invalid);
    await wrapper.setProps({ disabled: true });
    input.vm.$emit("change", 50);
    await wrapper.get('[aria-label="Reset style"]').trigger("click");
    expect(wrapper.emitted("change")).toBeUndefined();
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  test("the real owned leaf reuses color adjustments, color modes and RGB transparent-color patches", async () => {
    const image = ownedPicture();
    const before = structuredClone(image);
    const wrapper = fixture(image);
    await openMenu(wrapper, "Color");
    const inputs = wrapper.findAllComponents(InputNumber);
    inputs[0]!.vm.$emit("change", 125);
    inputs[1]!.vm.$emit("change", 75);
    inputs[2]!.vm.$emit("change", 150);
    wrapper
      .findAllComponents(MenuItem)
      .find((item) => item.text() === "Grayscale")!
      .vm.$emit("select");
    await wrapper.vm.$nextTick();
    await openMenu(wrapper, "Set transparent color");
    wrapper.getComponent(ColorPalette).vm.$emit("select", "#AABBCC");
    expect(wrapper.emitted("change")).toEqual([
      [{ brightness: 1.25 }],
      [{ contrast: 0.75 }],
      [{ saturation: 1.5 }],
      [{ grayscale: 1, sepia: undefined }],
      [{ transparentColor: "#AABBCC" }],
    ]);
    expect(image).toEqual(before);
    expect(image).not.toHaveProperty("anchor");
    expect(image).not.toHaveProperty("width");
    expect(image).not.toHaveProperty("groupId");
  });
});
