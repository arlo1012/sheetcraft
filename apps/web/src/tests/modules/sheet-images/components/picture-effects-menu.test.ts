import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import PictureEffectsMenu from "../../../../modules/sheet-images/components/PictureEffectsMenu.vue";
import PicturePresetChoices from "../../../../modules/sheet-images/components/format-pane/PicturePresetChoices.vue";
import MenuItem from "../../../../shared/menu/MenuItem.vue";
import { createAppI18n } from "../../../../shared/i18n";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
function fixture(accept = true) {
  const effectHandler = vi.fn(() => accept);
  const wrapper = mount(PictureEffectsMenu, {
    attachTo: document.body,
    props: { source: { id: "picture" }, disabled: false, effectHandler },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { wrapper, effectHandler };
}
async function open(wrapper: VueWrapper, category?: string) {
  await wrapper.get('[aria-label="Effects"]').trigger("click");
  await flushPromises();
  if (category) {
    (document.querySelector(`[data-effect-category="${category}"]`) as HTMLElement).click();
    await flushPromises();
  }
}
test.each([
  ["shadow", 24, 3],
  ["reflection", 10, 3],
  ["glow", 25, 6],
  ["softEdges", 7, 1],
  ["rotation3d", 26, 4],
])("%s exposes actual category layout and typed choices", async (category, count, columns) => {
  const { wrapper, effectHandler } = fixture();
  await open(wrapper, category as string);
  expect(wrapper.findAllComponents(MenuItem)).toHaveLength(6);
  const grid = wrapper.getComponent(PicturePresetChoices);
  expect(grid.props("columns")).toBe(columns);
  expect(grid.findAll("button")).toHaveLength(count);
  expect(grid.props("showLabels")).toBe(category === "softEdges");
  await grid.findAll("button")[1]!.trigger("click");
  expect(effectHandler).toHaveBeenCalledTimes(1);
  expect(effectHandler.mock.calls[0]).toEqual([
    { category, value: expect.objectContaining({ kind: "value" }) },
  ]);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
test("none explicitly clears one category; a refused choice remains open with feedback", async () => {
  const { wrapper, effectHandler } = fixture(false);
  await open(wrapper, "glow");
  await wrapper.getComponent(PicturePresetChoices).findAll("button")[0]!.trigger("click");
  expect(effectHandler).toHaveBeenCalledWith({ category: "glow", value: { kind: "none" } });
  expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
});
test.each(["source", "handler", "disabled", "closed", "unmounted"])(
  "captured preset refuses stale %s",
  async (change) => {
    const { wrapper, effectHandler } = fixture();
    await open(wrapper, "shadow");
    const old = wrapper.getComponent(PicturePresetChoices).props("onSelect");
    if (change === "source") await wrapper.setProps({ source: { id: "replacement" } });
    if (change === "handler") await wrapper.setProps({ effectHandler: vi.fn(() => true) });
    if (change === "disabled") await wrapper.setProps({ disabled: true });
    if (change === "closed") await wrapper.get('[aria-label="Effects"]').trigger("click");
    if (change === "unmounted") wrapper.unmount();
    expect(old("outer-top-left")).toBe(false);
    expect(effectHandler).not.toHaveBeenCalled();
  },
);
test("More Options opens detailed effects, can reopen, and stale callback cannot retarget", async () => {
  const { wrapper } = fixture();
  await open(wrapper);
  let item = wrapper.findAllComponents(MenuItem).at(-1)!;
  const old = item.vm.$.vnode.props!.onSelect as () => void;
  item.vm.$emit("select");
  await flushPromises();
  expect(wrapper.emitted("format")).toHaveLength(1);
  await open(wrapper);
  item = wrapper.findAllComponents(MenuItem).at(-1)!;
  old();
  expect(wrapper.emitted("format")).toHaveLength(1);
  item.vm.$emit("select");
  await flushPromises();
  expect(wrapper.emitted("format")).toHaveLength(2);
});
test("keyboard opens category, navigates choices and returns to parent without a write", async () => {
  const { wrapper, effectHandler } = fixture();
  await open(wrapper);
  const parent = document.querySelector('[data-effect-category="shadow"]') as HTMLElement;
  parent.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await flushPromises();
  const grid = wrapper.getComponent(PicturePresetChoices),
    buttons = grid.findAll("button");
  expect(document.activeElement).toBe(buttons[0]!.element);
  await buttons[0]!.trigger("keydown", { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons[1]!.element);
  await buttons[1]!.trigger("keydown", { key: "Escape" });
  await flushPromises();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  expect(document.activeElement).toBe(parent);
  expect(effectHandler).not.toHaveBeenCalled();
});

test("multi-selection keeps presets active while detailed options are unavailable", async () => {
  const { wrapper, effectHandler } = fixture();
  await wrapper.setProps({ formatDisabled: true });
  await open(wrapper, "shadow");
  const more = wrapper.findAllComponents(MenuItem).find((item) => item.text().includes("options"))!;
  expect(more.props("disabled")).toBe(true);
  const descriptionId = more.attributes("aria-describedby");
  if (!descriptionId) throw new Error("Disabled detailed options must describe their reason.");
  expect(document.getElementById(descriptionId)?.textContent).toBe(
    "Select one picture to edit detailed effects.",
  );
  more.vm.$emit("select");
  expect(wrapper.emitted("format")).toBeUndefined();
  await wrapper.getComponent(PicturePresetChoices).findAll("button")[1]!.trigger("click");
  expect(effectHandler).toHaveBeenCalledTimes(1);
});
