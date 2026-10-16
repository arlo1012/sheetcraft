import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import PictureFormatPane from "../../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureEffectPresetField from "../../../../modules/sheet-images/components/format-pane/PictureEffectPresetField.vue";
import PicturePresetGallery from "../../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import PictureGlowEditor from "../../../../modules/sheet-images/components/format-pane/PictureGlowEditor.vue";
import PictureSoftEdgesEditor from "../../../../modules/sheet-images/components/format-pane/PictureSoftEdgesEditor.vue";
import PictureRotation3dEditor from "../../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import { picturePaintEnUS } from "../../../../modules/sheet-images/picture-paint-messages.en-US";
import { picturePaintZhCN } from "../../../../modules/sheet-images/picture-paint-messages.zh-CN";
import { createAppI18n } from "../../../../shared/i18n";
import type { PictureFormatSnapshot } from "../../../../modules/sheet-images/picture-format-pane-model";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
test("default effect labels are localized without renaming real theme inheritance", () => {
  expect(picturePaintEnUS.effectDefaultNone).toBe("Default (no effect)");
  expect(picturePaintZhCN.effectDefaultNone).toBe("默认（无效果）");
  expect(picturePaintEnUS.effectInherit).toBe("Use theme");
  expect(picturePaintZhCN.effectInherit).toBe("使用主题");
});
test("collapsed defaults distinguish unsupported theme categories without dispatching edits", () => {
  const snapshot: PictureFormatSnapshot = {
    owner: {
      workbookId: "book",
      sheetId: "sheet",
      pictureId: "picture",
      assetId: "asset",
      sessionId: "session",
    },
    revision: 1,
    values: {},
    name: "Picture",
    appearance: {
      suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
    },
  };
  const before = structuredClone(snapshot);
  const onIntent = vi.fn(() => true);
  const wrapper = mount(PictureFormatPane, {
    props: {
      snapshot,
      capabilities: {
        fields: {},
        detailed: {
          glow: { enabled: true },
          softEdges: { enabled: true },
          rotation3d: { enabled: true },
          reflection: { enabled: true },
          shadow: { enabled: true },
          format3d: { enabled: true },
        },
      },
      onIntent,
      t: (key) => key,
      initialTab: "effects",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  for (const field of wrapper.findAllComponents(PictureEffectPresetField)) {
    const category = field.props("category");
    const gallery = field.getComponent(PicturePresetGallery);
    if (["glow", "softEdges", "rotation3d"].includes(category)) {
      expect(gallery.props("emptyLabel")).toBe("effectDefaultNone");
      expect(gallery.props("selectedId")).toBeUndefined();
    } else {
      expect(gallery.props("selectedId")).toBeTruthy();
      expect(gallery.props("emptyLabel")).not.toBe("effectDefaultNone");
    }
  }
  expect(onIntent).not.toHaveBeenCalled();
  expect(snapshot).toEqual(before);
});
test.each([PictureGlowEditor, PictureSoftEdgesEditor, PictureRotation3dEditor])(
  "expanded defaults retain undefined / none / value semantics and do not commit on display",
  async (component) => {
    const onCommit = vi.fn(() => true);
    const wrapper = mount(component, {
      props: { ownerKey: "owner", value: undefined, t: (key: string) => key, onCommit },
      global: {
        plugins: [createAppI18n("en-US")],
        stubs: { PicturePresetGallery: true, PicturePaintNumber: true, PicturePaintColor: true },
      },
    });
    mounted.push(wrapper);
    const select = wrapper.getComponent(Select);
    expect(select.props("modelValue")).toBe("inherit");
    expect(select.props("options")).toContainEqual({
      value: "inherit",
      label: "effectDefaultNone",
    });
    expect(wrapper.getComponent(PicturePresetGallery).props("emptyLabel")).toBe(
      "effectDefaultNone",
    );
    expect(onCommit).not.toHaveBeenCalled();
    select.vm.$emit("change", "inherit");
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
    select.vm.$emit("change", "none");
    expect(onCommit).toHaveBeenLastCalledWith({ kind: "none" });
    await wrapper.setProps({ value: { kind: "none" } });
    expect(select.props("modelValue")).toBe("none");
    expect(wrapper.getComponent(PicturePresetGallery).props("emptyLabel")).toBe("effectCustom");
    expect(onCommit).toHaveBeenCalledTimes(2);
  },
);
