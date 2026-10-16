import { displayNumber, commitDisplay } from "./numeric-test-actions";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import PictureEffectsMenu from "../../../../modules/sheet-images/components/PictureEffectsMenu.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
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
  let wrapper: VueWrapper;
  wrapper = mount(PictureAppearanceTools, {
    attachTo: document.body,
    props: {
      image,
      disabled: false,
      appearanceCommitHandler: (patch) => {
        wrapper.vm.$emit("change", patch);
        return true;
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function openMenu(wrapper: VueWrapper, label: string): Promise<void> {
  if (["Transparency", "Picture design", "Filters"].includes(label)) {
    await wrapper.get('[role="button"][aria-label="Picture style"]').trigger("click");
    await flushPromises();
    const item = wrapper.findAllComponents(MenuItem).find((entry) => entry.text() === label)!;
    item.vm.$emit("select");
  } else {
    await wrapper.get(`[aria-label="${label}"]`).trigger("click");
  }
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
      const input = wrapper.getComponent(NumericField);
      expect(displayNumber(input)).toBe(50);
      commitDisplay(input, 25);
      expect(wrapper.emitted("change")).toEqual([[{ opacity: 0.75 }]]);
      expect(wrapper.emitted("update")).toBeUndefined();
      await wrapper.get('[aria-label="Reset style"]').trigger("click");
      expect(wrapper.emitted("change")).toEqual([[{ opacity: 0.75 }], [undefined]]);
      expect(image).toEqual(before);
    },
  );

  test.each(["legacy", "frame", "owned"])(
    "%s effects route through the typed menu and detailed effects target",
    async (kind) => {
      const wrapper = fixture(
        kind === "legacy" ? legacyPicture() : kind === "frame" ? framedPicture() : ownedPicture(),
      );
      const effects = wrapper.getComponent(PictureEffectsMenu);
      effects.vm.$emit("format");
      expect(wrapper.emitted("format")).toEqual([["effects"]]);
      expect(wrapper.emitted("change")).toBeUndefined();
    },
  );

  test.each(["frame", "owned"])(
    "%s reflection design opens formatting without a legacy patch",
    async (kind) => {
      const wrapper = fixture(kind === "frame" ? framedPicture() : ownedPicture());
      await openMenu(wrapper, "Picture design");
      const reflection = wrapper
        .findAllComponents(MenuItem)
        .find((item) => item.text().startsWith("Reflection ·"))!;
      reflection.vm.$emit("select");
      await flushPromises();
      expect(wrapper.emitted("format")).toEqual([[]]);
      expect(wrapper.emitted("change")).toBeUndefined();
      expect(document.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test.each(["disabled", "source"])(
    "a stale reflection entry cannot open formatting after %s changes",
    async (change) => {
      const image = framedPicture();
      const wrapper = fixture(image);
      await openMenu(wrapper, "Picture design");
      const reflection = wrapper
        .findAllComponents(MenuItem)
        .find((item) => item.text().startsWith("Reflection ·"))!;
      const old = reflection.vm.$.vnode.props!.onSelect as () => void;
      if (change === "disabled") await wrapper.setProps({ disabled: true });
      else await wrapper.setProps({ image: { ...image, assetId: "replacement" } });
      old();
      expect(wrapper.emitted("format")).toBeUndefined();
      expect(wrapper.emitted("change")).toBeUndefined();
      await wrapper.setProps({ disabled: false });
      await openMenu(wrapper, "Picture design");
      old();
      expect(wrapper.emitted("format")).toBeUndefined();
      const current = wrapper
        .findAllComponents(MenuItem)
        .find((item) => item.text().startsWith("Reflection ·"))!;
      current.vm.$emit("select");
      expect(wrapper.emitted("format")).toEqual([[]]);
    },
  );

  test.each(["legacy", "frame", "owned"])(
    "rejects invalid border widths for %s pictures",
    async (kind) => {
      const wrapper = fixture(
        kind === "legacy" ? legacyPicture() : kind === "frame" ? framedPicture() : ownedPicture(),
      );
      await openMenu(wrapper, "Border");
      const input = wrapper.getComponent(NumericField);
      for (const invalid of [undefined, "2", Number.NaN, Infinity, -1, 20.01])
        commitDisplay(input, invalid);
      expect(wrapper.emitted("change")).toBeUndefined();
      commitDisplay(input, 2);
      expect(wrapper.emitted("change")).toEqual([[{ border: { color: "#000000", width: 2 } }]]);
    },
  );

  test.each(["legacy", "owned"])(
    "%s source changes discard drafts while own appearance changes stay open",
    async (kind) => {
      const image = kind === "legacy" ? legacyPicture() : ownedPicture();
      const wrapper = fixture(image);
      await openMenu(wrapper, "Transparency");
      const oldInput = wrapper.getComponent(NumericField);
      await oldInput.get("input").setValue("50.");
      expect((oldInput.get("input").element as HTMLInputElement).value).toBe("50.");
      await wrapper.setProps({ image: { ...image, transform: { appearance: { opacity: 0.25 } } } });
      expect(
        wrapper.get('[role="button"][aria-label="Picture style"]').attributes("aria-expanded"),
      ).toBe("true");
      expect(wrapper.getComponent(NumericField).vm.$.uid).toBe(oldInput.vm.$.uid);
      await wrapper.setProps({ image: { ...image, assetId: "replacement-asset" } });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      commitDisplay(oldInput, 20);
      expect(wrapper.emitted("change")).toBeUndefined();
      await openMenu(wrapper, "Transparency");
      expect(wrapper.getComponent(NumericField).vm.$.uid).not.toBe(oldInput.vm.$.uid);
      expect(
        (wrapper.getComponent(NumericField).get("input").element as HTMLInputElement).value,
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
    await openMenu(wrapper, "Color adjustments");
    const input = wrapper.findAllComponents(NumericField)[0]!;
    for (const invalid of [undefined, "100", Number.NaN, Infinity]) commitDisplay(input, invalid);
    await wrapper.setProps({ disabled: true });
    commitDisplay(input, 50);
    await wrapper.get('[aria-label="Reset style"]').trigger("click");
    expect(wrapper.emitted("change")).toBeUndefined();
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  test("the real owned leaf reuses color adjustments, color modes and RGB transparent-color patches", async () => {
    const image = ownedPicture();
    const before = structuredClone(image);
    const wrapper = fixture(image);
    await openMenu(wrapper, "Color adjustments");
    const inputs = wrapper.findAllComponents(NumericField);
    commitDisplay(inputs[0]!, 125);
    commitDisplay(inputs[1]!, 75);
    commitDisplay(inputs[2]!, 150);
    await openMenu(wrapper, "Color");
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
