import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import SheetPictureAdjustmentHandles from "../../../../modules/sheet-images/components/SheetPictureAdjustmentHandles.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { fixture } from "../picture-crop-overlay/fixture";
const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
function owner(preset: "roundRect" | "rightArrow" | "ellipse" = "rightArrow", frozen = false) {
  const f = fixture(frozen);
  const wrapper = mount(SheetPictureAdjustmentHandles, {
    props: { shape: { preset }, geometry: f.resolved(), layout: f.layout },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return { ...f, wrapper };
}
test.each([
  ["roundRect", 1],
  ["rightArrow", 2],
  ["ellipse", 0],
] as const)("%s exposes its actual adjustment count %s", (preset, count) => {
  const f = owner(preset);
  const handles = f.wrapper.findAll("[data-picture-shape-adjustment]");
  expect(handles).toHaveLength(count);
  for (const handle of handles) {
    expect(handle.attributes("aria-label")).toContain("形状调整点");
    expect(handle.attributes("type")).toBe("button");
  }
});
test("handle pointer and keyboard input use typed indexes/deltas and ignore non-editing modifiers", async () => {
  const { wrapper } = owner();
  const handle = wrapper.get('[data-picture-shape-adjustment="0"]');
  await handle.trigger("pointerdown", { button: 0, pointerId: 1 });
  await handle.trigger("pointerdown", { button: 2, pointerId: 1 });
  expect(wrapper.emitted("start")).toHaveLength(1);
  expect(wrapper.emitted("start")![0]![0]).toBe(0);
  await handle.trigger("keydown", { key: "ArrowRight" });
  await handle.trigger("keydown", { key: "ArrowUp", shiftKey: true });
  await handle.trigger("keydown", { key: "ArrowLeft", ctrlKey: true });
  expect(wrapper.emitted("nudge")).toEqual([
    [0, { x: 1, y: 0 }],
    [0, { x: 0, y: -10 }],
  ]);
  await wrapper.setProps({ disabled: true });
  expect(wrapper.findAll("[data-picture-shape-adjustment]")).toHaveLength(0);
});
