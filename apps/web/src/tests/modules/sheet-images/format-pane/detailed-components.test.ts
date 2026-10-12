import { h, defineComponent } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Slider } from "tdesign-vue-next/es/slider";
import PictureFormatPane from "../../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PicturePaintEditor from "../../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureGradientEditor from "../../../../modules/sheet-images/components/format-pane/PictureGradientEditor.vue";
import PicturePaintNumber from "../../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";
import PicturePaintColor from "../../../../modules/sheet-images/components/format-pane/PicturePaintColor.vue";
import PictureShadowEditor from "../../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import PicturePresetGallery from "../../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import PictureFormat3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import PictureRotation3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import { createPictureGradientPaint } from "../../../../modules/sheet-images/picture-paint-edit";
import { createAppI18n } from "../../../../shared/i18n";
import {
  appearanceCheckpoint,
  appearanceOwnerFixture,
  expectAppearanceUnchanged,
} from "./appearance-owner-fixture";
import { selectedNode } from "./source-scale/owner-fixture";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const wrappers: VueWrapper[] = [];
afterEach(async () => {
  await flushPromises();
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
const paletteStub = {
  props: ["modelValue", "disabled", "label"],
  emits: ["select"],
  template: '<button :aria-label="label" :disabled="disabled" />',
};
function mountOwner() {
  const f = appearanceOwnerFixture();
  const host = defineComponent({
    setup: () => () =>
      h(PictureFormatPane, {
        snapshot: f.pane.snapshot.value,
        capabilities: f.pane.capabilities.value,
        onIntent: f.pane.onIntent,
        t: (key) => key,
      }),
  });
  const wrapper = mount(host, {
    global: { plugins: [createAppI18n("en-US")], stubs: { ColorPaletteSelect: paletteStub } },
  });
  wrappers.push(wrapper);
  return { f, wrapper };
}
function select(wrapper: Pick<VueWrapper, "findAllComponents">, label: string, value: string) {
  const component = wrapper
    .findAllComponents(Select)
    .find((c) => c.attributes("aria-label") === label)!;
  expect(component).toBeDefined();
  component.vm.$emit("change", value);
  return flushPromises();
}
function number(wrapper: Pick<VueWrapper, "findAllComponents">, label: string) {
  const result = wrapper
    .findAllComponents(PicturePaintNumber)
    .find((c) => c.props("label") === label)!;
  expect(result).toBeDefined();
  return result;
}
test("live fill form changes the genuine owner; editing 20 does not commit 2 or remount its field", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!;
  await select(editor, "paintMode", "solid");
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.fill?.kind).toBe("value");
  const field = number(editor, "paintOpacity"),
    element = field.getComponent(Input).get<HTMLInputElement>("input").element;
  await field.getComponent(Input).get("input").setValue("2");
  await field.getComponent(Input).get("input").setValue("20");
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(field.getComponent(Input).get("input").element).toBe(element);
  field
    .getComponent(Input)
    .vm.$emit("enter", "20", { e: new KeyboardEvent("keydown", { key: "Enter" }) });
  await flushPromises();
  expect(f.session.history.undoStack).toHaveLength(2);
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.fill).toMatchObject({
    kind: "value",
    value: { kind: "solid", opacity: 0.8 },
  });
});
test("failed Enter followed by blur is a single attempted transaction and preserves the actual draft/history", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!;
  await select(editor, "paintMode", "solid");
  const field = number(editor, "paintOpacity"),
    input = field.getComponent(Input);
  f.refuse();
  const before = appearanceCheckpoint(f);
  f.execute.mockClear();
  await input.get("input").setValue("37");
  input.vm.$emit("enter", "37", { e: new KeyboardEvent("keydown", { key: "Enter" }) });
  input.vm.$emit("blur", "37", { e: new FocusEvent("blur") });
  await flushPromises();
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(input.get<HTMLInputElement>("input").element.value).toBe("37");
  expect(field.text()).toContain("applyRejected");
  expectAppearanceUnchanged(f, before);
  input.vm.$emit("keydown", "37", { e: new KeyboardEvent("keydown", { key: "Escape" }) });
  await flushPromises();
  expect(input.get<HTMLInputElement>("input").element.value).toBe("0");
  expect(f.execute).toHaveBeenCalledTimes(1);
});
test("structured palette preserves the genuine live theme reference including tint", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!;
  await select(editor, "paintMode", "solid");
  const color = editor.getComponent(PicturePaintColor),
    palette = color.findComponent(paletteStub);
  palette.vm.$emit("select", "#123456", { slot: "accent2", tint: 0.4 });
  await flushPromises();
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.fill).toMatchObject({
    kind: "value",
    value: { color: { kind: "theme", reference: { slot: "accent2", tint: 0.4 } } },
  });
});
test("gradient selected-stop brightness is independent of every other stop and source corrections", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!;
  await select(editor, "paintMode", "gradient");
  const gradient = editor.getComponent(PictureGradientEditor),
    field = number(gradient, "gradientBrightness");
  await field.getComponent(Input).get("input").setValue("0");
  field
    .getComponent(Input)
    .vm.$emit("enter", "0", { e: new KeyboardEvent("keydown", { key: "Enter" }) });
  await flushPromises();
  const fill = selectedNode(f).transform?.appearance?.detailedStyle?.fill;
  expect(fill?.kind).toBe("value");
  if (fill?.kind !== "value" || fill.value.kind !== "linear") throw Error("Wrong paint.");
  expect(fill.value.stops[0]!.brightness).toBe(0);
  expect(fill.value.stops[1]!).toEqual(createPictureGradientPaint().stops[1]);
  expect(selectedNode(f).transform?.appearance?.opacity).toBe(0.8);
});
test("old field callback cannot apply to a later selection/session", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!,
    old = editor.props("onCommit");
  f.generation.value++;
  await flushPromises();
  const before = appearanceCheckpoint(f);
  expect(old({ kind: "none" })).toBe(false);
  expectAppearanceUnchanged(f, before);
});
test.each(["callback", "close"] as const)(
  "detailed gallery identity expires on pane %s without changing workbook history",
  async (boundary) => {
    const f = appearanceOwnerFixture(),
      wrapper = mount(PictureFormatPane, {
        props: {
          snapshot: f.pane.snapshot.value,
          capabilities: f.pane.capabilities.value,
          onIntent: f.pane.onIntent,
          t: (key) => key,
        },
        global: {
          plugins: [createAppI18n("en-US")],
          stubs: { ColorPaletteSelect: paletteStub, TTextarea: true },
        },
      });
    wrappers.push(wrapper);
    await flushPromises();
    const editor = wrapper.findAllComponents(PicturePaintEditor)[0]!,
      old = editor.props("onCommit"),
      key = editor.props("ownerKey");
    if (boundary === "callback") await wrapper.setProps({ onIntent: vi.fn(f.pane.onIntent) });
    else await wrapper.setProps({ snapshot: null });
    if (boundary === "callback")
      expect(wrapper.findAllComponents(PicturePaintEditor)[0]!.props("ownerKey")).not.toBe(key);
    else expect(wrapper.findAllComponents(PicturePaintEditor)).toHaveLength(0);
    const before = appearanceCheckpoint(f);
    expect(old({ kind: "none" })).toBe(false);
    expectAppearanceUnchanged(f, before);
  },
);
test("shadow, material and real camera controls use detailed transactions instead of inert legacy fields", async () => {
  const { f, wrapper } = mountOwner(),
    shadow = wrapper.getComponent(PictureShadowEditor);
  await select(shadow, "shadowSection", "inner");
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.shadow).toMatchObject({
    kind: "value",
    value: { kind: "inner" },
  });
  const format = wrapper.getComponent(PictureFormat3dEditor);
  await select(format, "format3dSection", "value");
  const material = format
    .findAllComponents(PicturePresetGallery)
    .find((c) => c.props("label") === "material")!;
  expect(material.props("onSelect")("metal")).toBe(true);
  await flushPromises();
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.format3d).toMatchObject({
    kind: "value",
    value: { material: "metal" },
  });
  const rotation = wrapper.getComponent(PictureRotation3dEditor);
  await select(rotation, "rotation3dSection", "perspective");
  const field = number(rotation, "rotation3dXDeg");
  await field.getComponent(Input).get("input").setValue("45");
  field
    .getComponent(Input)
    .vm.$emit("enter", "45", { e: new KeyboardEvent("keydown", { key: "Enter" }) });
  await flushPromises();
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.rotation3d).toMatchObject({
    kind: "value",
    value: { projection: "perspective", xDeg: 45 },
  });
});
test("a late local file loader cannot deliver to the next owner", async () => {
  let resolve!: (value: string) => void;
  const loader = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    ),
    apply = vi.fn(() => true);
  const wrapper = mount(PicturePaintEditor, {
    props: {
      ownerKey: "original",
      sourceAssetId: "source",
      value: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "source",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
      t: (key) => key,
      loadAsset: loader,
      onCommit: apply,
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { ColorPaletteSelect: paletteStub } },
  });
  wrappers.push(wrapper);
  const input = wrapper.get<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input.element, "files", {
    value: [new File(["synthetic"], "test.png", { type: "image/png" })],
    configurable: true,
  });
  await input.trigger("change");
  expect(loader).toHaveBeenCalledTimes(1);
  await wrapper.setProps({ ownerKey: "new-owner" });
  resolve("late-image");
  await flushPromises();
  expect(apply).not.toHaveBeenCalled();
});

test("slider gestures keep intermediate numbers local and submit once on release", async () => {
  const { f, wrapper } = mountOwner(),
    editor = wrapper.findAllComponents(PicturePaintEditor)[0]!;
  await select(editor, "paintMode", "solid");
  const field = number(editor, "paintOpacity"),
    slider = field.findComponent(Slider);
  expect(slider.exists()).toBe(true);
  f.execute.mockClear();
  slider.vm.$emit("change", 10);
  slider.vm.$emit("change", 20);
  await flushPromises();
  expect(f.execute).not.toHaveBeenCalled();
  slider.vm.$emit("changeEnd", 20);
  await flushPromises();
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(selectedNode(f).transform?.appearance?.detailedStyle?.fill).toMatchObject({
    kind: "value",
    value: { opacity: 0.8 },
  });
});

test("mixed member fill is an explicit non-applying placeholder, not the inherited setting", async () => {
  const onCommit = vi.fn(() => true);
  const wrapper = mount(PicturePaintEditor, {
    props: { ownerKey: "group", mixed: true, t: (key) => key, onCommit },
    global: { stubs: { ColorPaletteSelect: paletteStub } },
  });
  wrappers.push(wrapper);
  const mode = wrapper.getComponent(Select);
  expect(mode.props("modelValue")).toBe("mixed");
  expect(mode.props("options")).toContainEqual({
    value: "mixed",
    label: "paintMixed",
    disabled: true,
  });
  expect(onCommit).not.toHaveBeenCalled();
  mode.vm.$emit("change", "mixed");
  expect(onCommit).not.toHaveBeenCalled();
  mode.vm.$emit("change", "solid");
  await flushPromises();
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ kind: "value", value: expect.objectContaining({ kind: "solid" }) }),
  );
});
