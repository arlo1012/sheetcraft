import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import PictureToolbar from "../../../../modules/sheet-images/components/PictureToolbar.vue";
import PictureOwnedLeafRibbon from "../../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import { createAppI18n } from "../../../../shared/i18n";
import type { LegacyFloatingImage } from "@sheetcraft/core/workbook";
import { pictureGroup } from "../picture-group-fixture";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function picture(): LegacyFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 120,
    height: 80,
  };
}
function toolbar(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(PictureToolbar, {
    attachTo: document.body,
    props: {
      image: picture(),
      disabled: false,
      selectionCount: 1,
      previewOnDoubleClick: true,
      draftOwnerKey: 1,
      appearanceDraftKey: 1,
      ...overrides,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
async function enter(input: ReturnType<VueWrapper["get"]>, text: string) {
  (input.element as HTMLInputElement).focus();
  await flushPromises();
  await input.setValue(text);
  await input.trigger("keydown", { key: "Enter", code: "Enter" });
  await input.trigger("keyup", { key: "Enter", code: "Enter" });
  await flushPromises();
}
test("Ribbon native size input exposes pt, converts exact canonical pixels once, and does not write on untouched focus/blur", async () => {
  const resize = vi.fn(() => true);
  const wrapper = toolbar({ resizeHandler: resize });
  const input = wrapper.get<HTMLInputElement>('input[data-picture-size="width"]');
  expect(input.attributes("role")).toBe("spinbutton");
  expect(input.element.readOnly).toBe(false);
  expect(input.attributes("aria-label")).toBe("Width (pt)");
  expect(input.attributes("aria-valuemin")).toBe("0.75");
  expect(input.attributes("aria-valuemax")).toBe("7500");
  expect(Number(input.element.value)).toBe(90);
  input.element.focus();
  await flushPromises();
  input.element.blur();
  await flushPromises();
  expect(resize).not.toHaveBeenCalled();
  await enter(input, "100.125");
  expect(resize).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 133.5 });
  input.element.blur();
  await flushPromises();
  expect(resize).toHaveBeenCalledTimes(1);
});
test("a rejected size commit leaves the document unchanged with field feedback, and an old owner callback cannot retarget", async () => {
  const image = picture(),
    resize = vi.fn(() => false);
  const wrapper = toolbar({ image, resizeHandler: resize });
  const input = wrapper.get<HTMLInputElement>('input[data-picture-size="width"]');
  await enter(input, "120");
  expect(resize).toHaveBeenCalledExactlyOnceWith({ axis: "width", value: 160 });
  expect(image.width).toBe(120);
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  const field = wrapper
    .findAllComponents(NumericField)
    .find((item) => item.props("label") === "Width (pt)")!;
  const old = field.props("onCommit");
  await wrapper.setProps({ draftOwnerKey: 2 });
  expect(
    old(
      { kind: "value", value: 200 },
      { ownerKey: "1:picture:width", sessionId: "old", source: "enter" },
    ).accepted,
  ).toBe(false);
  expect(resize).toHaveBeenCalledTimes(1);
});
test("standalone corrections use the real boolean appearance acknowledgement without quantizing a typed ratio", async () => {
  const appearance = vi.fn(() => true),
    wrapper = toolbar({ appearanceHandler: appearance });
  await wrapper.get('[role="button"][aria-label="Color adjustments"]').trigger("click");
  await flushPromises();
  const input = wrapper
    .findAllComponents(NumericField)
    .find((field) => field.props("label") === "Brightness (%)")!
    .get<HTMLInputElement>("input");
  expect(input.attributes("aria-valuemin")).toBe("0");
  expect(input.attributes("aria-valuemax")).toBe("200");
  await enter(input, "125.5");
  expect(appearance).toHaveBeenCalledExactlyOnceWith({ brightness: 1.255 });
  expect(wrapper.emitted("appearance")).toBeUndefined();
});
test("an owned leaf returns its actual appearance ack, rejects an expired lease, and never invents a source frame", async () => {
  const image = pictureGroup().members[0]!;
  if (image.kind !== "grouped-picture-v1") throw new Error("Expected leaf");
  const appearance = vi.fn(() => true);
  const wrapper = mount(PictureOwnedLeafRibbon, {
    attachTo: document.body,
    props: {
      image,
      disabled: false,
      ownerKey: "owner-1",
      canReplace: true,
      replaceHandler: vi.fn(),
      formatHandler: vi.fn(),
      appearanceHandler: appearance,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  await wrapper.get('[role="button"][aria-label="Color adjustments"]').trigger("click");
  await flushPromises();
  const input = wrapper
    .findAllComponents(NumericField)
    .find((field) => field.props("label") === "Contrast (%)")!
    .get<HTMLInputElement>("input");
  await enter(input, "75");
  expect(appearance).toHaveBeenCalledExactlyOnceWith({ contrast: 0.75 });
  const field = wrapper
    .findAllComponents(NumericField)
    .find((item) => item.props("label") === "Contrast (%)")!;
  const old = field.props("onCommit");
  await wrapper.setProps({ ownerKey: "owner-2" });
  expect(
    old({ kind: "value", value: 0.5 }, { ownerKey: "old", sessionId: "old", source: "enter" })
      .accepted,
  ).toBe(false);
  expect(appearance).toHaveBeenCalledTimes(1);
  expect(image).not.toHaveProperty("width");
  expect(image).not.toHaveProperty("anchor");
});
test("an unacknowledged viewer is honestly read-only while nonnumeric legacy color commands remain available", async () => {
  const wrapper = toolbar();
  const input = wrapper.get<HTMLInputElement>('input[data-picture-size="width"]');
  expect(input.element.readOnly).toBe(true);
  expect(input.attributes("aria-readonly")).toBe("true");
  expect(wrapper.text()).toContain("Numeric editing is unavailable in this viewer.");
  await enter(input, "120");
  expect(wrapper.emitted("resize")).toBeUndefined();
  await wrapper.get('[role="button"][aria-label="Color"]').trigger("click");
  await flushPromises();
  const item = document.querySelector<HTMLElement>('[role="menuitem"]');
  expect(item).not.toBeNull();
  item!.click();
  await flushPromises();
  expect(wrapper.emitted("appearance")).toHaveLength(1);
});
