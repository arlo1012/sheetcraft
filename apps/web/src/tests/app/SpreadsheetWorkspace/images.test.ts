import PictureFormatPane from "../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureCellOverwriteDialog from "../../../modules/sheet-images/components/PictureCellOverwriteDialog.vue";
import { framedPicture } from "../../modules/sheet-images/framed-picture-fixture";
import { pictureGroup } from "../../modules/sheet-images/picture-group-fixture";
import SheetOwnedPictureGroupLayer from "../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import PictureToolbar from "../../../modules/sheet-images/components/PictureToolbar.vue";
import PictureOwnedLeafRibbon from "../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import * as pictureExport from "../../../modules/sheet-images/picture-source-export";
import * as download from "../../../shared/files/download";
import type { PictureSourcePresentation } from "../../../modules/sheet-images/picture-source-presentation";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";
import { requireLegacyPicture } from "../../../modules/sheet-images/picture-document-support";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  cloneFloatingImage,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetSurface from "../../../modules/sheet-grid/components/SheetSurface.vue";
import type { SheetRenderFrame } from "../../../modules/sheet-grid/rendering/sheet-render-frame";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";

vi.mock("../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});
async function fixture(cellImage = false, kind?: "framed" | "owned") {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  if (cellImage)
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: {
          assetId: "asset",
          altText: "Cell diagram",
          transform: { crop: { x: 0, y: 0, width: 0.5, height: 0.75 }, rotation: 90 },
        },
      },
    );
  setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: "original" });
  sheet.floatingImages.push({
    id: "float",
    assetId: "asset",
    altText: "Diagram",
    anchor: { row: 2, column: 2 },
    offsetX: 0,
    offsetY: 0,
    width: 120,
    height: 80,
    transform: { crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, rotation: 180 },
  });
  if (kind === "framed")
    sheet.floatingImages = [{ ...framedPicture(), id: "float", assetId: "asset" }];
  if (kind === "owned") {
    const group = pictureGroup(),
      leaf = group.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected real leaf.");
    leaf.assetId = "asset";
    sheet.floatingImages = [group];
  }
  const imageAssetStore = createMemoryImageAssetStore();
  const asset = {
    id: "asset",
    mimeType: "image/png",
    width: 120,
    height: 80,
    blob: new Blob([new Uint8Array(actualPng)], { type: "image/png" }),
  };
  await imageAssetStore.put(asset);
  vi.mocked(prepareImageAsset).mockResolvedValue(asset);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbookStore = {
    load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
    save: vi.fn(async (_snapshot: WorkbookSnapshot, revision?: number) => ({
      revision: (revision ?? 0) + 1,
      savedAt: 2,
    })),
    replace: async () => ({ revision: 2, savedAt: 2 }),
  };
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore, imageAssetStore },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        SheetImagePreview: {
          name: "SheetImagePreview",
          props: ["src", "altText", "frameSource"],
          emits: ["close"],
          template:
            '<div data-image-preview :data-src="src">{{ altText }}<button @click="$emit(\'close\')">Close preview</button></div>',
        },
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, workbookStore, sheet: wrapper.findComponent(SheetGrid).props("sheet") };
}

async function triggerFloatingImage(
  wrapper: ReturnType<typeof mount>,
  sourceImage: FloatingImage,
  event: "contextmenu" | "dblclick" | "pointerdown",
  options: PointerEventInit = {},
): Promise<void> {
  const image = requireLegacyPicture(sourceImage);
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const anchor = frame.layout.getCellViewportRect(image.anchor);
  if (!anchor) throw new Error("Floating image anchor is outside the viewport");
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event, {
    ...options,
    clientX:
      bounds.left + (frame.body.x + anchor.x + image.offsetX + image.width / 2) * frame.scale,
    clientY:
      bounds.top + (frame.body.y + anchor.y + image.offsetY + image.height / 2) * frame.scale,
  });
}

describe("workspace cell image entry points", () => {
  test.each([false, true])(
    "native paste resolves menu image metadata while editing=%s",
    async (editing) => {
      const { wrapper, sheet } = await fixture();
      const image = sheet.floatingImages[0]!;
      vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
        write: vi.fn(async () => {}),
        read: vi.fn(async () => [
          {
            types: ["text/plain", "web application/x-sheetcraft-floating-image"],
            getType: async (type: string) =>
              new Blob([type === "text/plain" ? "Diagram" : JSON.stringify(image)]),
          },
        ]),
      } as unknown as Clipboard);
      await triggerFloatingImage(wrapper, image, "contextmenu");
      await flushPromises();
      document.querySelector<HTMLButtonElement>('[data-floating-image-action="copy"]')!.click();
      await flushPromises();
      await triggerCanvasCell(wrapper, { row: 0, column: 0 }, editing ? "dblclick" : "mousedown", {
        button: 0,
      });
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          types: ["text/plain"],
          files: [],
          getData: (type: string) => (type === "text/plain" ? "Diagram" : ""),
        },
      });
      wrapper.get("textarea.cell-editor").element.dispatchEvent(event);
      await flushPromises();
      if (editing) {
        expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({
          kind: "image",
          image: { transform: { crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, rotation: 180 } },
        });
        expect(sheet.floatingImages).toHaveLength(1);
      } else {
        expect(sheet.floatingImages).toHaveLength(2);
        expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
      }
    },
  );

  test("preserves the captured native text and caret when an optional image metadata read is denied", async () => {
    const { wrapper, sheet } = await fixture();
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
      write: vi.fn(async () => {}),
      read: vi.fn(async () => {
        throw new Error("denied");
      }),
      readText: vi.fn(async () => {
        throw new Error("denied");
      }),
    } as unknown as Clipboard);
    await triggerFloatingImage(wrapper, sheet.floatingImages[0]!, "contextmenu");
    await flushPromises();
    document.querySelector<HTMLButtonElement>('[data-floating-image-action="copy"]')!.click();
    await flushPromises();
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "dblclick", { button: 0 });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.setValue("ab");
    editor.element.setSelectionRange(1, 1);
    let readable = true;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        types: ["text/plain"],
        files: [],
        getData: (type: string) => (readable && type === "text/plain" ? "X" : ""),
      },
    });
    editor.element.dispatchEvent(event);
    readable = false;
    await flushPromises();
    expect(editor.element.value).toBe("aXb");
    expect(editor.element.selectionStart).toBe(2);
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: "aXb" });
    expect(sheet.floatingImages).toHaveLength(1);
  });

  test("converts a cell image to floating with its asset geometry and restores it through undo", async () => {
    const { wrapper, sheet } = await fixture(true);
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "contextmenu");
    await flushPromises();
    document
      .querySelector<HTMLButtonElement>('[data-cell-action="convert-image-to-floating"]')!
      .click();
    await flushPromises();
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
    expect(sheet.floatingImages).toHaveLength(2);
    expect(sheet.floatingImages[1]).toMatchObject({
      assetId: "asset",
      altText: "Cell diagram",
      anchor: { row: 0, column: 0 },
      width: 60,
      height: 60,
      transform: { crop: { x: 0, y: 0, width: 0.5, height: 0.75 }, rotation: 90 },
    });
    expect(wrapper.find(".spreadsheet-workspace__image-feedback").exists()).toBe(false);
    expect(wrapper.find(".workbook-status-bar__status").exists()).toBe(false);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })?.kind).toBe("image");
  });

  test("double-click previews cell and floating images without altering document contents", async () => {
    const { wrapper, sheet } = await fixture(true);
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "dblclick", { button: 0 });
    expect(wrapper.get("[data-image-preview]").text()).toContain("Cell diagram");
    expect(wrapper.get("[data-image-preview]").attributes("data-src")).toBe("blob:fixture");
    await wrapper.get("[data-image-preview] button").trigger("click");
    expect(wrapper.find("[data-image-preview]").exists()).toBe(false);
    await triggerFloatingImage(wrapper, sheet.floatingImages[0]!, "dblclick", { button: 0 });
    expect(wrapper.get("[data-image-preview]").text()).toContain("Diagram");
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })?.kind).toBe("image");
  });

  test.each(["framed", "owned"] as const)(
    "%s preview receives a genuine resolved source frame without editing the workbook",
    async (kind) => {
      const { wrapper, sheet } = await fixture(false, kind);
      const grid = wrapper.getComponent(SheetGrid),
        root = sheet.floatingImages[0]!;
      grid.vm.selectFloatingImages([root.id]);
      await flushPromises();
      if (kind === "owned") {
        expect(grid.vm.canPreviewPicture()).toBe(false);
        wrapper
          .getComponent(SheetOwnedPictureGroupLayer)
          .vm.$emit("selectPath", [root.id, "owned-leaf"]);
        await flushPromises();
      }
      const before = sheet.floatingImages.map(cloneFloatingImage);
      expect(grid.vm.canPreviewPicture()).toBe(true);
      expect(grid.vm.previewSelectedPicture()).toBe(true);
      await flushPromises();
      const preview = wrapper.getComponent({ name: "SheetImagePreview" });
      const presentation = preview.props("frameSource") as PictureSourcePresentation;
      expect(presentation.picture.assetId).toBe("asset");
      expect(presentation.geometry.sourceRect).not.toBeNull();
      if (kind === "owned") {
        expect(presentation.picture).toMatchObject({
          kind: "grouped-picture-v1",
          id: "owned-leaf",
        });
        expect(presentation.geometry.angleDeg).toBe(74);
      }
      expect(sheet.floatingImages).toEqual(before);
      const oldClose = preview.vm.$.vnode.props!.onClose as () => void;
      expect(grid.vm.previewSelectedPicture()).toBe(true);
      await flushPromises();
      oldClose();
      await flushPromises();
      expect(wrapper.find("[data-image-preview]").exists()).toBe(true);
    },
  );
  test.each(["framed", "owned"] as const)(
    "%s ribbon saves its actual rendered source through current worksheet geometry",
    async (kind) => {
      const { wrapper, sheet } = await fixture(false, kind),
        grid = wrapper.getComponent(SheetGrid),
        root = sheet.floatingImages[0]!;
      grid.vm.selectFloatingImages([root.id]);
      await flushPromises();
      if (kind === "owned") {
        wrapper
          .getComponent(SheetOwnedPictureGroupLayer)
          .vm.$emit("selectPath", [root.id, "owned-leaf"]);
        await flushPromises();
      }
      const before = sheet.floatingImages.map(cloneFloatingImage),
        render = vi
          .spyOn(pictureExport, "exportPictureSourceBlob")
          .mockResolvedValue(new Blob(["rendered"], { type: "image/png" })),
        save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
      if (kind === "owned")
        wrapper.getComponent(PictureOwnedLeafRibbon).vm.$emit("export", "png", false);
      else wrapper.getComponent(PictureToolbar).vm.$emit("export", "png", false);
      await flushPromises();
      expect(render).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledOnce();
      const presentation = render.mock.calls[0]![1];
      expect(presentation.picture.assetId).toBe("asset");
      if (kind === "owned") expect(presentation.geometry.angleDeg).toBe(74);
      expect(sheet.floatingImages).toEqual(before);
    },
  );

  test("lets a selected image proxy bubble wheel scrolling to the grid root", async () => {
    const { wrapper, sheet } = await fixture();
    await triggerFloatingImage(wrapper, sheet.floatingImages[0]!, "pointerdown", {
      button: 0,
      pointerId: 54,
    });
    await flushPromises();
    const selected = wrapper.get<HTMLElement>("[data-floating-image-selected]");
    const scroller = wrapper.get<HTMLElement>(".sheet-grid__scroller").element;
    scroller.scrollTop = 0;
    selected.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 }),
    );
    await flushPromises();
    expect(scroller.scrollTop).toBe(100);
  });

  test("returns canvas preview focus to an operable control after closing", async () => {
    const { wrapper, sheet } = await fixture();
    vi.spyOn(
      wrapper.get<HTMLElement>("[data-floating-image-layer]").element,
      "focus",
    ).mockImplementation(() => {});
    await triggerFloatingImage(wrapper, sheet.floatingImages[0]!, "dblclick", { button: 0 });
    await flushPromises();
    await wrapper.get("[data-image-preview] button").trigger("click");
    await flushPromises();
    const active = document.activeElement;
    expect(
      active === wrapper.get("textarea.cell-editor").element ||
        active?.matches("[data-floating-image-selected]"),
    ).toBe(true);
  });

  test("right-click copy and cut preserve cell images when system clipboard access is unavailable", async () => {
    const { wrapper, sheet } = await fixture(true);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(undefined as unknown as Clipboard);
    async function menu(row: number, column: number, action: string) {
      await triggerCanvasCell(wrapper, { row, column }, "contextmenu");
      await flushPromises();
      document
        .querySelector<HTMLButtonElement>(`[data-context-clipboard-action="${action}"]`)!
        .click();
      await flushPromises();
    }
    await menu(0, 0, "copy");
    await menu(1, 1, "paste");
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual(
      getCellContent(sheet, { row: 0, column: 0 }),
    );
    await menu(1, 1, "cut");
    expect(getCellContent(sheet, { row: 1, column: 1 })?.kind).toBe("image");
    await menu(3, 3, "paste");
    expect(getCellContent(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellContent(sheet, { row: 3, column: 3 })?.kind).toBe("image");
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellContent(sheet, { row: 1, column: 1 })?.kind).toBe("image");
    expect(getCellContent(sheet, { row: 3, column: 3 })).toBeNull();
  });
  test("double-click plus bitmap paste creates a saved and undoable cell image", async () => {
    const { wrapper, sheet, workbookStore } = await fixture();
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "dblclick", { button: 0 });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [new File(["fixture"], "clipboard.png", { type: "image/png" })],
        getData: () => "",
      },
    });
    wrapper.get("textarea.cell-editor").element.dispatchEvent(event);
    await flushPromises();
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "image",
      image: { assetId: "asset", altText: "clipboard.png" },
    });
    expect(sheet.floatingImages).toHaveLength(1);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(
      workbookStore.save.mock.calls
        .at(-1)?.[0]
        .sheets[0]?.cells.some((cell) => cell.content?.kind === "image"),
    ).toBe(true);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
  });
  test("right-click conversion confirms a nonempty anchor and undoes in one step", async () => {
    const { wrapper, sheet } = await fixture();
    await triggerFloatingImage(wrapper, sheet.floatingImages[0]!, "contextmenu");
    await flushPromises();
    const action = document.querySelector<HTMLButtonElement>(
      '[data-floating-image-action="convert-to-cell"]',
    );
    expect(action).not.toBeNull();
    action!.click();
    await flushPromises();
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: "original",
    });
    const confirmation = wrapper.getComponent(PictureCellOverwriteDialog).props("confirmation");
    expect(confirmation.address).toEqual({ row: 2, column: 2 });
    expect(confirmation.confirm()).toBe(true);
    await flushPromises();
    expect(sheet.floatingImages).toHaveLength(0);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "image",
      image: {
        assetId: "asset",
        altText: "Diagram",
        transform: { crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, rotation: 180 },
      },
    });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: "original",
    });
  });
});

test("group floating Fill/Outline shortcuts open the actual member pane at the requested section", async () => {
  const { wrapper, sheet } = await fixture(false, "owned"),
    grid = wrapper.getComponent(SheetGrid),
    root = sheet.floatingImages[0]!;
  grid.vm.selectFloatingImages([root.id]);
  await flushPromises();
  const layer = wrapper.getComponent(SheetOwnedPictureGroupLayer);
  layer.vm.$emit("format", [root.id], sheet, "fill");
  await flushPromises();
  const pane = wrapper.getComponent(PictureFormatPane);
  expect(pane.props("snapshot")).toMatchObject({
    paintScope: "group-leaves",
    owner: { pictureId: root.id },
  });
  expect(pane.get("[data-group-picture-paint-scope]").text()).toContain("every picture member");
  expect(
    pane
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === "Fill & Line")!
      .attributes("aria-selected"),
  ).toBe("true");
  expect(
    pane
      .findAll(".picture-format-section__heading")
      .find((button) => button.text() === "Fill")!
      .attributes("aria-expanded"),
  ).toBe("true");
  layer.vm.$emit("format", [root.id], sheet, "line");
  await flushPromises();
  expect(wrapper.getComponent(PictureFormatPane).vm.$.uid).toBe(pane.vm.$.uid);
  expect(
    pane
      .findAll(".picture-format-section__heading")
      .find((button) => button.text() === "Line")!
      .attributes("aria-expanded"),
  ).toBe("true");
});
