import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});
async function fixture(cellImage = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  if (cellImage)
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "asset", altText: "Cell diagram" },
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
  });
  const imageAssetStore = createMemoryImageAssetStore();
  const asset = {
    id: "asset",
    mimeType: "image/png",
    width: 120,
    height: 80,
    blob: new Blob(["fixture"], { type: "image/png" }),
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
          props: ["src", "altText"],
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
            types: ["text/plain", "web application/x-idea10-floating-image"],
            getType: async (type: string) =>
              new Blob([type === "text/plain" ? "Diagram" : JSON.stringify(image)]),
          },
        ]),
      } as unknown as Clipboard);
      await wrapper
        .get('[data-floating-image-id="float"]')
        .trigger("contextmenu", { clientX: 180, clientY: 180 });
      await flushPromises();
      document.querySelector<HTMLButtonElement>('[data-floating-image-action="copy"]')!.click();
      await flushPromises();
      await wrapper
        .get('[data-row="0"][data-column="0"]')
        .trigger(editing ? "dblclick" : "mousedown", { button: 0 });
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
        expect(getCellContent(sheet, { row: 0, column: 0 })?.kind).toBe("image");
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
    await wrapper
      .get('[data-floating-image-id="float"]')
      .trigger("contextmenu", { clientX: 180, clientY: 180 });
    await flushPromises();
    document.querySelector<HTMLButtonElement>('[data-floating-image-action="copy"]')!.click();
    await flushPromises();
    await wrapper.get('[data-row="0"][data-column="0"]').trigger("dblclick", { button: 0 });
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
    await wrapper
      .get('[data-row="0"][data-column="0"]')
      .trigger("contextmenu", { clientX: 80, clientY: 120 });
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
      width: 120,
      height: 80,
    });
    expect(wrapper.find(".spreadsheet-workspace__image-feedback").exists()).toBe(false);
    expect(wrapper.find(".workbook-status-bar__status").exists()).toBe(false);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })?.kind).toBe("image");
  });

  test("double-click previews cell and floating images without altering document contents", async () => {
    const { wrapper, sheet } = await fixture(true);
    await wrapper.get('[data-row="0"][data-column="0"]').trigger("dblclick", { button: 0 });
    expect(wrapper.get("[data-image-preview]").text()).toContain("Cell diagram");
    expect(wrapper.get("[data-image-preview]").attributes("data-src")).toBe("blob:fixture");
    await wrapper.get("[data-image-preview] button").trigger("click");
    expect(wrapper.find("[data-image-preview]").exists()).toBe(false);
    await wrapper.get('[data-floating-image-id="float"]').trigger("dblclick", { button: 0 });
    expect(wrapper.get("[data-image-preview]").text()).toContain("Diagram");
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })?.kind).toBe("image");
  });

  test("right-click copy and cut preserve cell images when system clipboard access is unavailable", async () => {
    const { wrapper, sheet } = await fixture(true);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(undefined as unknown as Clipboard);
    async function menu(row: number, column: number, action: string) {
      await wrapper
        .get(`[data-row="${row}"][data-column="${column}"]`)
        .trigger("contextmenu", { clientX: 80, clientY: 120 });
      await flushPromises();
      document.querySelector<HTMLButtonElement>(`[data-cell-action="${action}"]`)!.click();
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
    await wrapper.get('[data-row="0"][data-column="0"]').trigger("dblclick", { button: 0 });
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
  test("right-click conversion targets the image anchor and undoes in one step", async () => {
    const { wrapper, sheet } = await fixture();
    await wrapper
      .get('[data-floating-image-id="float"]')
      .trigger("contextmenu", { clientX: 220, clientY: 180 });
    await flushPromises();
    const action = document.querySelector<HTMLButtonElement>(
      '[data-floating-image-action="convert-to-cell"]',
    );
    expect(action).not.toBeNull();
    action!.click();
    await flushPromises();
    expect(sheet.floatingImages).toHaveLength(0);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "image",
      image: { assetId: "asset", altText: "Diagram" },
    });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(sheet.floatingImages).toHaveLength(1);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: "original",
    });
  });
});
