import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import PictureFormatPane from "../../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureEffectPresetField from "../../../../modules/sheet-images/components/format-pane/PictureEffectPresetField.vue";
import PicturePresetGallery from "../../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import PictureShadowEditor from "../../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import { createPictureShadow } from "../../../../modules/sheet-images/picture-effect-edit";
import { getPictureEffectPresetGroups } from "../../../../modules/sheet-images/picture-effect-presets";
import { createAppI18n } from "../../../../shared/i18n";
import type {
  PictureFormatIntent,
  PictureFormatSnapshot,
} from "../../../../modules/sheet-images/picture-format-pane-model";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture() {
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
      detailedStyle: {
        shadow: { kind: "value", value: { ...createPictureShadow(), distancePt: 27 } },
      },
    },
  };
  const onIntent = vi.fn((_intent: PictureFormatIntent) => true);
  const wrapper = mount(PictureFormatPane, {
    attachTo: document.body,
    props: {
      snapshot,
      capabilities: { fields: {}, detailed: { shadow: { enabled: true } } },
      onIntent,
      t: (key) => key,
      initialTab: "effects",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, onIntent, snapshot };
}
async function openHeader(wrapper: VueWrapper) {
  const header = wrapper
    .findAllComponents(PictureEffectPresetField)
    .find((item) => item.props("category") === "shadow")!;
  for (const trigger of header.findAll(".t-input__wrap, .t-input, .t-select-input"))
    vi.spyOn(trigger.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 132, 28),
    );
  await header
    .get('input[role="combobox"]')
    .trigger("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  await flushPromises();
  await vi.waitFor(() =>
    expect(header.get('input[role="combobox"]').attributes("aria-expanded")).toBe("true"),
  );
  return header;
}
test("picture shadow has one complete header selector and retains custom parameter controls without a duplicate body mode", async () => {
  const f = fixture();
  const editor = f.wrapper.getComponent(PictureShadowEditor);
  expect(editor.props("hideMode")).toBe(true);
  expect(editor.findAllComponents(Select)).toHaveLength(1); // alignment remains
  expect(editor.find('input[aria-label="shadowSection"]').exists()).toBe(false);
  const heading = f.wrapper
    .findAll(".format-section__heading")
    .find((item) => item.text() === "shadowSection")!;
  expect(heading.attributes("aria-expanded")).toBe("false");
  await heading.trigger("click");
  expect(heading.attributes("aria-expanded")).toBe("true");
  expect(editor.find('input[aria-label="shadowSection"]').exists()).toBe(false);
  expect(editor.findAll(".numeric-field input").length).toBeGreaterThan(4);
  const header = await openHeader(f.wrapper);
  expect(
    header.getComponent(PicturePresetGallery).get(".picture-preset-gallery__value").text(),
  ).toBe("effectCustom");
  const inherit = document.querySelector<HTMLElement>("[data-picture-preset-inherit]")!;
  expect(inherit).not.toBeNull();
  inherit.click();
  await flushPromises();
  expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: "set-detailed",
      category: "shadow",
      value: undefined,
      owner: f.snapshot.owner,
    }),
  );
  expect(heading.attributes("aria-expanded")).toBe("true");
});
test("header retains None plus all outer, inner and perspective presets and preserves inherited display", async () => {
  const groups = getPictureEffectPresetGroups("shadow");
  expect(groups.flatMap((group) => group.items)).toHaveLength(24);
  for (const kind of ["outer", "inner", "perspective"])
    expect(
      groups
        .flatMap((group) => group.items)
        .some((item) => item.value.kind === "value" && item.value.value.kind === kind),
    ).toBe(true);
  const f = fixture();
  await f.wrapper.setProps({ snapshot: { ...f.snapshot, appearance: {} } });
  const header = await openHeader(f.wrapper);
  expect(
    header.getComponent(PicturePresetGallery).get(".picture-preset-gallery__value").text(),
  ).toBe("effectInherit");
  const none = document.querySelector<HTMLElement>('button[aria-label="effectNone"]')!;
  expect(none).not.toBeNull();
  none.click();
  await flushPromises();
  expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ category: "shadow", value: { kind: "none" } }),
  );
});
test("non-header shadow editor keeps its effect mode and optional inheritance is not enabled in unrelated header galleries", () => {
  const wrapper = mount(PictureShadowEditor, {
    props: {
      ownerKey: "shape-owner",
      value: { kind: "none" },
      t: (key) => key,
      onCommit: vi.fn(() => true),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  expect(wrapper.findAllComponents(Select)).toHaveLength(1);
  expect(wrapper.getComponent(Select).attributes("aria-label")).toBe("shadowSection");
  const f = fixture();
  const other = f.wrapper
    .findAllComponents(PictureEffectPresetField)
    .find((item) => item.props("category") === "reflection")!;
  expect(other.getComponent(PicturePresetGallery).props("onInherit")).toBeUndefined();
});

test("same-owner snapshot refresh keeps the live header open and its original guarded inherit action applies at the new revision", async () => {
  const f = fixture(),
    header = await openHeader(f.wrapper),
    gallery = header.getComponent(PicturePresetGallery);
  const input = header.get('input[role="combobox"]').element,
    old = gallery.props("onInherit")!;
  await f.wrapper.setProps({
    snapshot: { ...f.snapshot, revision: 2, appearance: { ...f.snapshot.appearance } },
  });
  await flushPromises();
  expect(gallery.props("onInherit")).toBe(old);
  expect(header.get('input[role="combobox"]').element).toBe(input);
  expect(header.get('input[role="combobox"]').attributes("aria-expanded")).toBe("true");
  const inherit = document.querySelector<HTMLElement>("[data-picture-preset-inherit]")!;
  expect(inherit).not.toBeNull();
  inherit.click();
  await flushPromises();
  expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      category: "shadow",
      value: undefined,
      baseRevision: 2,
      owner: f.snapshot.owner,
    }),
  );
});
test.each(["owner", "handler"] as const)(
  "cached header inheritance rejects its original action after a true %s change",
  async (boundary) => {
    const f = fixture(),
      header = await openHeader(f.wrapper),
      gallery = header.getComponent(PicturePresetGallery);
    const old = gallery.props("onInherit")!,
      button = document.querySelector<HTMLElement>("[data-picture-preset-inherit]")!,
      replacement = vi.fn((_intent: PictureFormatIntent) => true);
    if (boundary === "owner")
      await f.wrapper.setProps({
        snapshot: {
          ...f.snapshot,
          owner: { ...f.snapshot.owner, sessionId: "replacement-session" },
        },
      });
    else await f.wrapper.setProps({ onIntent: replacement });
    await flushPromises();
    expect(gallery.props("onInherit")).not.toBe(old);
    expect(old()).toBe(false);
    button.click();
    await flushPromises();
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(gallery.props("onInherit")!()).toBe(true);
    expect(boundary === "owner" ? f.onIntent : replacement).toHaveBeenCalledTimes(1);
  },
);
