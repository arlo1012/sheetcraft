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
async function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
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
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, workbookStore, sheet: wrapper.findComponent(SheetGrid).props("sheet") };
}
describe("workspace cell image entry points", () => {
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
