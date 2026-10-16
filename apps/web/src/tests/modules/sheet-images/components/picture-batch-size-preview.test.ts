import { afterEach, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureBatchSizeDialog from "../../../../modules/sheet-images/components/PictureBatchSizeDialog.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import { createAppI18n } from "../../../../shared/i18n";
import {
  pictureBatchHeightPreview,
  type PictureBatchSizeScopes,
} from "../../../../modules/sheet-images/picture-batch-size-preview";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture(sizeScopes?: PictureBatchSizeScopes) {
  const wrapper = mount(PictureBatchSizeDialog, {
    attachTo: document.body,
    props: { width: 200, height: 100, ownerKey: "batch-one", sizeScopes },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const fields = wrapper.findAllComponents(NumericField);
  const width = fields[0]!,
    height = fields[1]!;
  const checkboxes = wrapper.findAllComponents(Checkbox);
  async function edit(value: string, field = width) {
    field.vm.edit(value);
    await nextTick();
  }
  async function toggle(index: number, value: boolean) {
    checkboxes[index]!.vm.$emit("update:modelValue", value);
    await nextTick();
  }
  return { wrapper, width, height, edit, toggle };
}
test("locked single picture height follows the point draft and submits pixel sizes", async () => {
  const f = fixture();
  await f.edit("300");
  expect(f.height.props("value")).toEqual({ kind: "value", value: 200 });
  expect(f.height.props("disabled")).toBe(true);
  expect(
    document.querySelector("[data-picture-batch-height] input")?.getAttribute("aria-valuetext"),
  ).toBe("150 pt");
  f.wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(f.wrapper.emitted("confirm")?.[0]).toEqual([
    { width: 400, height: 100, locked: true, all: false },
  ]);
});
test("different ratios are mixed and changing selected/all restores the selected single height", async () => {
  const f = fixture({
    selected: [{ width: 200, height: 100 }],
    all: [
      { width: 200, height: 100 },
      { width: 100, height: 100 },
    ],
  });
  await f.edit("300");
  await f.toggle(1, true);
  expect(f.height.props("value")).toEqual({ kind: "mixed" });
  expect(
    document.querySelector("[data-picture-batch-height] input")?.getAttribute("aria-valuetext"),
  ).toBe("Mixed");
  await f.toggle(1, false);
  expect(f.height.props("value")).toEqual({ kind: "value", value: 200 });
});
test("equal ratios with different original sizes show one derived height", async () => {
  const f = fixture({
    selected: [
      { width: 200, height: 100 },
      { width: 400, height: 200 },
    ],
    all: [],
  });
  await f.edit("300");
  expect(f.height.props("value")).toEqual({ kind: "value", value: 200 });
});
test("unlocking restores explicit height and locking does not overwrite its edited value", async () => {
  const f = fixture();
  await f.edit("300");
  await f.toggle(0, false);
  expect(f.height.props("value")).toEqual({ kind: "value", value: 100 });
  await f.edit("90", f.height);
  f.height.vm.commit("enter");
  await nextTick();
  await f.toggle(0, true);
  expect(f.height.props("value")).toEqual({ kind: "value", value: 200 });
  await f.toggle(0, false);
  expect(f.height.props("value")).toEqual({ kind: "value", value: 120 });
  f.wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(f.wrapper.emitted("confirm")?.[0]).toEqual([
    { width: 400, height: 120, locked: false, all: false },
  ]);
});
test.each(["", "nonsense", "0", "7501"])(
  "invalid width %s cannot confirm or show a false height",
  async (value) => {
    const f = fixture();
    await f.edit(value);
    expect(f.height.props("value")).toEqual({ kind: "empty" });
    f.wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
  },
);
test("cancelling a width draft restores the derived height without submitting", async () => {
  const f = fixture();
  await f.edit("300");
  f.width.vm.cancel();
  await nextTick();
  expect(f.height.props("value")).toEqual({ kind: "value", value: 100 });
  expect(f.wrapper.emitted("confirm")).toBeUndefined();
});
test("owner replacement resets the draft and rejects retained numeric callbacks", async () => {
  const f = fixture();
  const retained = f.width.props("onCommit");
  await f.edit("300");
  await f.wrapper.setProps({ ownerKey: "batch-two", width: 300, height: 300 });
  expect(
    retained(
      { kind: "value", value: 400 },
      { ownerKey: "batch-one", sessionId: "old", source: "external" },
    ).accepted,
  ).toBe(false);
  expect(f.width.props("value")).toEqual({ kind: "value", value: 300 });
  expect(f.height.props("value")).toEqual({ kind: "value", value: 300 });
});
test("preview ignores arithmetic noise but retains differing ratios and missing geometry", () => {
  expect(
    pictureBatchHeightPreview(400, [
      { width: 200, height: 100 },
      { width: 400, height: 200 + 1e-10 },
    ]),
  ).toEqual({ kind: "value", value: 200 });
  expect(
    pictureBatchHeightPreview(400, [
      { width: 200, height: 100 },
      { width: 400, height: 200.001 },
    ]),
  ).toEqual({ kind: "mixed" });
  expect(pictureBatchHeightPreview(400, [{ width: 200, height: 100 }, undefined])).toEqual({
    kind: "empty",
  });
  // A calculable out-of-range result remains visible; the unchanged planner rejects it.
  expect(pictureBatchHeightPreview(10000, [{ width: 1, height: 2 }])).toEqual({
    kind: "value",
    value: 20000,
  });
});
