import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import RibbonMenuButton from "../../../../shared/ribbon/RibbonMenuButton.vue";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { framedPicture } from "../framed-picture-fixture";

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
function fixture(image: FloatingImage) {
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
  test.each(["legacy", "frame"])(
    "emits shared appearance patches only for %s pictures",
    async (kind) => {
      const image =
        kind === "legacy"
          ? legacyPicture()
          : { ...framedPicture(), transform: { appearance: { opacity: 0.5 } } };
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

  test("disables only frame reflection and leaves supported shadow presets usable", async () => {
    const wrapper = fixture(framedPicture());
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
  });

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

  test.each(["legacy", "frame"])("rejects invalid border widths for %s pictures", async (kind) => {
    const wrapper = fixture(kind === "legacy" ? legacyPicture() : framedPicture());
    await openMenu(wrapper, "Border");
    const input = wrapper.getComponent(InputNumber);
    for (const invalid of [undefined, "2", Number.NaN, Infinity, -1, 20.01])
      input.vm.$emit("change", invalid);
    expect(wrapper.emitted("change")).toBeUndefined();
    input.vm.$emit("change", 2);
    expect(wrapper.emitted("change")).toEqual([[{ border: { color: "#000000", width: 2 } }]]);
  });

  test("source asset changes discard open appearance drafts while own appearance changes stay open", async () => {
    const image = legacyPicture();
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
    expect((wrapper.getComponent(InputNumber).get("input").element as HTMLInputElement).value).toBe(
      "50",
    );
  });

  test("an asynchronous old-source menu request cannot reopen after replacement", async () => {
    const image = framedPicture();
    const wrapper = fixture(image);
    const effects = wrapper
      .findAllComponents(RibbonMenuButton)
      .find((button) => button.props("label") === "Effects")!;
    effects.vm.$emit("activate");
    await wrapper.setProps({ image: { ...image, assetId: "replacement-asset" } });
    await flushPromises();
    expect(wrapper.get('[aria-label="Effects"]').attributes("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

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
});
