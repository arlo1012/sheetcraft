import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { watch } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import PictureFormatPane from "../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureEffectPresetField from "../../../modules/sheet-images/components/format-pane/PictureEffectPresetField.vue";
import PicturePresetGallery from "../../../modules/sheet-images/components/format-pane/PicturePresetGallery.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { legacyPicture } from "../../modules/sheet-images/owned-picture-clipboard/fixture";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";
vi.mock("../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
test("real PictureFormatEffects expanded Shadow header mouse opens and retains its complete gallery without changing its owner", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:picture-header");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ id: "header-workbook", sheetId: "header-sheet" }),
    picture = legacyPicture();
  getActiveSheet(workbook).floatingImages = [picture];
  const assets = createMemoryImageAssetStore();
  await assets.put({
    id: picture.assetId,
    mimeType: "image/png",
    width: 120,
    height: 80,
    blob: new Blob([new Uint8Array(actualPng)], { type: "image/png" }),
  });
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: async () => ({ revision: 2, savedAt: 2 }),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: assets,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  let stop = () => {};
  try {
    await flushPromises();
    const grid = wrapper.getComponent(SheetGrid);
    grid.vm.selectFloatingImages([picture.id]);
    await flushPromises();
    grid.vm.$emit("format-owned-picture", undefined, grid.props("sheet"));
    await flushPromises();
    const pane = wrapper.getComponent(PictureFormatPane);
    await pane.get('[role="tab"][id$="effects-tab"]').trigger("click");
    const heading = pane
      .findAll(".format-section__heading")
      .find((item) => item.text() === "Shadow")!;
    await heading.trigger("click");
    expect(heading.attributes("aria-expanded")).toBe("true");
    const header = pane
      .findAllComponents(PictureEffectPresetField)
      .find((item) => item.props("category") === "shadow")!;
    const gallery = header.getComponent(PicturePresetGallery),
      trace: unknown[] = [];
    stop = watch(
      () => [
        gallery.props("ownerKey"),
        gallery.props("onInherit"),
        pane.props("onIntent"),
        pane.props("snapshot"),
      ],
      (next, old) =>
        trace.push({
          ownerChanged: next[0] !== old[0],
          inheritChanged: next[1] !== old[1],
          intentChanged: next[2] !== old[2],
          snapshotChanged: next[3] !== old[3],
        }),
      { flush: "sync" },
    );
    for (const target of header.findAll(".t-input__wrap, .t-input, .t-select-input"))
      vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 132, 28),
      );
    const trigger = header.get<HTMLInputElement>('input[role="combobox"]');
    // The readonly input can be zero-width when valueDisplay is rendered.
    // Click the same visible wrapper text as the browser regression.
    const visibleValue = header.get(".picture-preset-gallery__value");
    await visibleValue.trigger("pointerdown", { button: 0 });
    await visibleValue.trigger("mousedown", { button: 0 });
    await visibleValue.trigger("mouseup", { button: 0 });
    visibleValue.element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
    await flushPromises();
    expect(
      header.get('input[role="combobox"]').attributes("aria-expanded"),
      JSON.stringify(trace),
    ).toBe("true");
    expect(header.get('input[role="combobox"]').element).toBe(trigger.element);
    expect(
      document.querySelector("[data-picture-preset-inherit]"),
      JSON.stringify(trace),
    ).not.toBeNull();
    expect(document.querySelector('button[aria-label="None"]')).not.toBeNull();
    expect(
      (wrapper.vm.$ as unknown as { setupState: { selectedPictureIds: string[] } }).setupState
        .selectedPictureIds,
    ).toEqual([picture.id]);
    expect(pane.isVisible()).toBe(true);
  } finally {
    stop();
    wrapper.unmount();
  }
}, 15000);
