import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import PicturePresetGallery from "../../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import PictureTextureGallery from "../../../../modules/sheet-images/components/format-pane/PictureTextureGallery.vue";
import PictureFormat3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import { getPictureEffectPresetGroups } from "../../../../modules/sheet-images/picture-effect-presets";
import { createPictureFormat3d } from "../../../../modules/sheet-images/picture-effect-edit";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const panelStub = defineComponent({
  props: ["disabled", "valueLabel"],
  emits: ["open-change"],
  setup(props, { slots, emit }) {
    const open = ref(false);
    function change(value: boolean) {
      open.value = value;
      emit("open-change", value);
    }
    return () =>
      h("div", [
        h(
          "button",
          {
            class: "gallery-trigger",
            disabled: props.disabled,
            onClick: () => change(!open.value),
          },
          slots.value?.(),
        ),
        open.value
          ? h("div", { class: "gallery-panel" }, slots.panel?.({ close: () => change(false) }))
          : null,
      ]);
  },
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
const global = {
  stubs: { PanelSelect: panelStub, PictureTexturePreview: { template: "<span />" } },
};
function gallery(accept = true) {
  const onSelect = vi.fn(() => accept);
  const wrapper = mount(PicturePresetGallery, {
    props: {
      ownerKey: "owner",
      groups: getPictureEffectPresetGroups("shadow"),
      selectedId: "outer-top-left",
      t: (key) => key,
      onSelect,
    },
    global,
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, onSelect };
}
test("presets are lazy, selected and named; accepted selection closes the menu once", async () => {
  const { wrapper, onSelect } = gallery();
  expect(wrapper.findAll(".gallery-panel button")).toHaveLength(0);
  await wrapper.get(".gallery-trigger").trigger("click");
  expect(wrapper.findAll(".gallery-panel button")).toHaveLength(24);
  const selected = wrapper.get('button[aria-label="alignTopLeft"][aria-pressed="true"]');
  await selected.trigger("click");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("outer-top-left");
  expect(wrapper.find(".gallery-panel").exists()).toBe(false);
});
test("refused selections leave the actual menu and current selection available", async () => {
  const { wrapper, onSelect } = gallery(false);
  await wrapper.get(".gallery-trigger").trigger("click");
  await wrapper.get('button[aria-label="effectNone"]').trigger("click");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("shadow-none");
  expect(wrapper.find(".gallery-panel").exists()).toBe(true);
  expect(wrapper.find('button[aria-label="alignTopLeft"][aria-pressed="true"]').exists()).toBe(
    true,
  );
});
test.each(["reopen", "owner", "callback", "disabled", "unmount"] as const)(
  "old preset action is rejected after %s",
  async (boundary) => {
    const { wrapper, onSelect } = gallery();
    await wrapper.get(".gallery-trigger").trigger("click");
    const old = wrapper.get('button[aria-label="effectNone"]').element;
    if (boundary === "reopen") {
      await wrapper.get(".gallery-trigger").trigger("click");
      await wrapper.get(".gallery-trigger").trigger("click");
    }
    if (boundary === "owner") {
      await wrapper.setProps({ ownerKey: "next-owner" });
      await wrapper.get(".gallery-trigger").trigger("click");
    }
    if (boundary === "callback") await wrapper.setProps({ onSelect: vi.fn(() => true) });
    if (boundary === "disabled") await wrapper.setProps({ disabled: true });
    if (boundary === "unmount") wrapper.unmount();
    old.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(onSelect).not.toHaveBeenCalled();
    if (boundary === "callback") expect(wrapper.props("onSelect")).not.toHaveBeenCalled();
  },
);
test("gallery arrows move within real enabled buttons without inserting or leaving the bounds", async () => {
  const { wrapper, onSelect } = gallery();
  await wrapper.get(".gallery-trigger").trigger("click");
  const buttons = wrapper.findAll<HTMLButtonElement>(".gallery-panel button");
  buttons[0]!.element.focus();
  await buttons[0]!.trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[3]!.element);
  await buttons[3]!.trigger("keydown", { key: "End" });
  expect(document.activeElement).toBe(buttons.at(-1)!.element);
  await buttons.at(-1)!.trigger("keydown", { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons.at(-1)!.element);
  expect(onSelect).not.toHaveBeenCalled();
});
test("the texture gallery has all 24 own choices and rejects an old reopened-menu callback", async () => {
  const onSelect = vi.fn(),
    wrapper = mount(PictureTextureGallery, {
      props: { ownerKey: "owner", selected: "paper", t: (key) => key, onSelect },
      global,
    });
  wrappers.push(wrapper);
  await wrapper.get(".gallery-trigger").trigger("click");
  expect(wrapper.findAll(".gallery-panel button")).toHaveLength(24);
  expect(wrapper.get('button[aria-label="texturePaper"]').attributes("aria-pressed")).toBe("true");
  const old = wrapper.get('button[aria-label="textureDenim"]').element;
  await wrapper.get(".gallery-trigger").trigger("click");
  await wrapper.get(".gallery-trigger").trigger("click");
  old.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  expect(onSelect).not.toHaveBeenCalled();
  await wrapper.get('button[aria-label="textureDenim"]').trigger("click");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("denim");
});
test("material and lighting galleries change only their actual field, retaining depth, contour and angle", () => {
  const value = {
      kind: "value" as const,
      value: { ...createPictureFormat3d(), depthPt: 37, contourPt: 2, lightingAngleDeg: 63 },
    },
    onCommit = vi.fn(() => true);
  const wrapper = mount(PictureFormat3dEditor, {
    props: { ownerKey: "owner", value, t: (key) => key, onCommit },
    global: {
      ...global,
      stubs: { ...global.stubs, PicturePaintColor: true, PicturePaintNumber: true },
    },
  });
  wrappers.push(wrapper);
  const galleries = wrapper.findAllComponents(PicturePresetGallery);
  expect(galleries[0]!.props("groups").flatMap((g) => g.items)).toHaveLength(11);
  expect(galleries[1]!.props("groups").flatMap((g) => g.items)).toHaveLength(15);
  expect(galleries[0]!.props("onSelect")("metal")).toBe(true);
  expect(onCommit).toHaveBeenLastCalledWith({
    kind: "value",
    value: { ...value.value, material: "metal" },
  });
  expect(galleries[1]!.props("onSelect")("soft")).toBe(true);
  expect(onCommit).toHaveBeenLastCalledWith({
    kind: "value",
    value: { ...value.value, lighting: "soft" },
  });
  onCommit.mockClear();
  expect(galleries[0]!.props("onSelect")("unknown")).toBe(false);
  expect(onCommit).not.toHaveBeenCalled();
});

test("a narrow selected preset keeps its complete label available without wrapping markup", async () => {
  const { wrapper } = gallery();
  await wrapper.setProps({
    groups: getPictureEffectPresetGroups("reflection"),
    selectedId: "reflection-1-1",
    t: (key) => (key === "reflectionSection" ? "Reflection" : key),
  });
  const value = wrapper.get(".picture-preset-gallery__value");
  expect(value.text()).toBe("Reflection 5");
  expect(value.attributes("title")).toBe("Reflection 5");
  expect(wrapper.getComponent(panelStub).props("valueLabel")).toBe("Reflection 5");
  expect(wrapper.get(".picture-preset-gallery__selected").attributes("alt")).toBe("");
});
