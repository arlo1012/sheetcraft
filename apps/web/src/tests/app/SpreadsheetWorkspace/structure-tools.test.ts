import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { getCellValue } from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => wrapper?.unmount());
async function fixture() {
  wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => undefined,
        save: async () => ({ revision: 1, savedAt: 1 }),
        replace: async () => ({ revision: 1, savedAt: 1 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await flushPromises();
  return wrapper;
}

describe("ribbon structure tools", () => {
  test("places tools after number formats and commits the draft before an undoable row insertion", async () => {
    const workspace = await fixture();
    const groups = workspace
      .findAll("[data-ribbon-group]")
      .map((group) => group.attributes("data-ribbon-group"));
    expect(groups[groups.indexOf("number") + 1]).toBe("structure");
    const sheet = workspace.getComponent(SheetGrid).props("sheet");
    const formula = workspace.get<HTMLTextAreaElement>("[data-formula-input]");
    await formula.trigger("focus");
    await formula.setValue("21");
    await workspace.get('[data-ribbon-action="row-column-operations"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-row-column-action="insert"]').trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-row-column-action="insert-rows-above"]')
      .trigger("click");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 0 })).toBe(21);
    await workspace.get('[data-ribbon-action="undo"]').trigger("click");
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe(21);
  });

  test("creates an undoable worksheet and keeps worksheet unprotect available while row tools are disabled", async () => {
    const workspace = await fixture();
    const sheetId = workspace.getComponent(SheetGrid).props("sheet").id;
    async function worksheetAction(action: string) {
      await workspace.get('[data-ribbon-action="worksheet-operations"]').trigger("click");
      await new DOMWrapper(document.body)
        .get(`[data-worksheet-action="${action}"]`)
        .trigger("click");
    }
    await worksheetAction("add");
    expect(workspace.getComponent(SheetGrid).props("sheet").id).not.toBe(sheetId);
    await workspace.get('[data-ribbon-action="undo"]').trigger("click");
    expect(workspace.getComponent(SheetGrid).props("sheet").id).toBe(sheetId);
    await worksheetAction("protect");
    expect(workspace.getComponent(SheetGrid).props("readOnly")).toBe(true);
    expect(
      workspace.get('[data-ribbon-action="row-column-operations"]').attributes("disabled"),
    ).toBe("");
    expect(
      workspace.get('[data-ribbon-action="worksheet-operations"]').attributes("disabled"),
    ).toBeUndefined();
    await worksheetAction("protect");
    expect(workspace.getComponent(SheetGrid).props("readOnly")).toBe(false);
  });
});
