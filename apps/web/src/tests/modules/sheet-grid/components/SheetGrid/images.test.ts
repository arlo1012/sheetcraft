import { afterEach, describe, expect, test, vi } from "vitest";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { recordCanvasRenderPlans } from "./canvas-render-fixture";
import { getCellContent, setCellContent } from "@sheetcraft/core/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid, triggerCell } from "./fixture";

const content = { kind: "image", image: { assetId: "asset", altText: "Diagram" } } as const;
describe("SheetGrid cell images", () => {
  afterEach(() => vi.restoreAllMocks());
  test("renders the image and keeps double-click / F2 out of text editing", async () => {
    const plans = recordCanvasRenderPlans();
    const { wrapper } = mountSheetGrid({
      beforeMount: (sheet) => setCellContent(sheet, { row: 0, column: 0 }, content),
    });
    await wrapper.setProps({ imageAssetUrls: new Map([["asset", "blob:fixture"]]) });
    const cell = plans.scene.panes.flatMap((pane) => pane.cells)[0]!;
    expect(cell.content.image).toEqual(content.image);
    expect(wrapper.getComponent(SheetSurface).props("imageAssetUrls")?.get("asset")).toBe(
      "blob:fixture",
    );
    expect(cell.content.text).toBe("");
    await triggerCell(wrapper, { row: 0, column: 0 }, "dblclick", { button: 0 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "F2" });
    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    wrapper.unmount();
  });
  test("passes cell image edits to the contained renderer", async () => {
    const plans = recordCanvasRenderPlans();
    const { wrapper } = mountSheetGrid({
      beforeMount: (sheet) =>
        setCellContent(
          sheet,
          { row: 0, column: 0 },
          {
            kind: "image",
            image: {
              assetId: "asset",
              altText: "Diagram",
              transform: { crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, rotation: 90 },
            },
          },
        ),
    });
    await wrapper.setProps({ imageAssetUrls: new Map([["asset", "blob:fixture"]]) });
    const image = plans.scene.panes.flatMap((pane) => pane.cells)[0]!.content.image;
    expect(image?.transform).toEqual({
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      rotation: 90,
    });
    wrapper.unmount();
  });
  test("copies image content locally with a blank text projection and undoable deletion", async () => {
    const { wrapper, sheet, session } = mountSheetGrid({
      beforeMount: (sheet) => setCellContent(sheet, { row: 0, column: 0 }, content),
    });
    const copy = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copy.event);
    expect(copy.data.get("text/plain")).toBe("");
    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", copy.data).event);
    await wrapper.vm.$nextTick();
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual(content);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Delete" });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(2);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual(content);
    wrapper.unmount();
  });
  test("typing replaces a cell image and undo restores it", async () => {
    const { wrapper, sheet } = mountSheetGrid({
      beforeMount: (sheet) => setCellContent(sheet, { row: 0, column: 0 }, content),
    });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "x" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: "x" });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual(content);
    wrapper.unmount();
  });
  test("routes a native bitmap paste to floating image insertion without pasting its text", async () => {
    const { wrapper, sheet } = mountSheetGrid();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [file],
        types: ["Files", "text/plain"],
        getData: (type: string) => (type === "text/plain" ? "do not paste" : ""),
      },
    });
    wrapper.get("textarea.cell-editor").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted("pasteImageFile")).toEqual([[file, "floating"]]);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
    wrapper.unmount();
  });
  test("pastes an image into the cell after double-clicking to edit", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 0, column: 0 }, "dblclick", { button: 0 });
    expect(wrapper.get("textarea.cell-editor").classes()).toContain("is-editing");
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
        getData: () => "",
      },
    });
    wrapper.get("textarea.cell-editor").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted("pasteImageFile")).toEqual([[file, "cell"]]);
    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    wrapper.unmount();
  });
});
