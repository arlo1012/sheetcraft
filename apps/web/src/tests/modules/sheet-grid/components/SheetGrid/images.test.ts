import { describe, expect, test } from "vitest";
import { getCellContent, setCellContent } from "@idea10/core/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid } from "./fixture";

const content = { kind: "image", image: { assetId: "asset", altText: "Diagram" } } as const;
describe("SheetGrid cell images", () => {
  test("renders the image and keeps double-click / F2 out of text editing", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount: (sheet) => setCellContent(sheet, { row: 0, column: 0 }, content),
    });
    await wrapper.setProps({ imageAssetUrls: new Map([["asset", "blob:fixture"]]) });
    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    expect(cell.get("img").attributes("src")).toBe("blob:fixture");
    expect(cell.text()).not.toContain("#VALUE!");
    await cell.trigger("dblclick", { button: 0 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "F2" });
    expect(wrapper.get("textarea.cell-editor").classes()).not.toContain("is-editing");
    wrapper.unmount();
  });
  test("copies image content locally with a blank text projection and undoable deletion", async () => {
    const { wrapper, sheet, session } = mountSheetGrid({
      beforeMount: (sheet) => setCellContent(sheet, { row: 0, column: 0 }, content),
    });
    const copy = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copy.event);
    expect(copy.data.get("text/plain")).toBe("");
    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
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
});
