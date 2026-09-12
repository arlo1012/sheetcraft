import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellValue,
  insertSheet,
  setCellValue,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
async function fixture() {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Overview",
  });
  const first = getActiveSheet(workbook);
  setCellValue(first, { row: 0, column: 0 }, 12);
  insertSheet(workbook, createSheet("Details", "details"));
  const save = vi.fn(async () => ({ revision: 2, savedAt: 2 }));
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({
          revision: 1,
          savedAt: 1,
          snapshot: serializeWorkbook(workbook),
        }),
        save,
        replace: save,
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, firstId: first.id };
}
async function action(
  wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"],
  sheetName: string,
  command: string,
) {
  await wrapper
    .get(`[role="tab"][title="${sheetName} (double-click to rename)"]`)
    .trigger("contextmenu");
  await new DOMWrapper(document.body).get(`[data-sheet-tab-action="${command}"]`).trigger("click");
}

describe("sheet management workspace integration", () => {
  test("hides the active sheet, restores it through navigation, and preserves properties in snapshots", async () => {
    const { wrapper, firstId } = await fixture();
    const sheet = wrapper.findComponent(SheetGrid).props("sheet");
    await action(wrapper, "Overview", "pin");
    expect(sheet.properties.pinned).toBe(true);
    await action(wrapper, "Overview", "hide");
    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe("details");
    expect(
      wrapper
        .findAll('[role="tablist"][aria-label="Workbook sheets"] [role="tab"]')
        .map((tab) => tab.text()),
    ).toEqual(["Details"]);
    await wrapper.get('[aria-label="All sheets"]').trigger("click");
    await new DOMWrapper(document.body)
      .get(`[data-workbook-hidden-sheet-id="${firstId}"]`)
      .trigger("click");
    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe(firstId);
    expect(sheet.properties.hidden).toBe(false);
    expect(sheet.properties.pinned).toBe(true);
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(sheet.properties.hidden).toBe(true);
    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe("details");
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
    expect(sheet.properties.hidden).toBe(false);
    // The same persisted sheet metadata is used by autosave and portable export.
    const persisted = serializeWorkbook({
      id: "roundtrip",
      dateSystem: "1900",
      calculation: { mode: "automatic", iterative: false, maxIterations: 100, maxChange: 0.001 },
      activeSheetId: firstId,
      sheets: new Map([[firstId, sheet]]),
      definedNames: new Map(),
    });
    expect(getActiveSheet(deserializeWorkbook(persisted)).properties.pinned).toBe(true);
  });

  test("protection reaches the grid, formula bar and ribbon, while unprotect and duplicate remain available", async () => {
    const { wrapper } = await fixture();
    const sheet = wrapper.findComponent(SheetGrid).props("sheet");
    await action(wrapper, "Overview", "protect");
    expect(sheet.properties.protected).toBe(true);
    expect(wrapper.findComponent(SheetGrid).props("readOnly")).toBe(true);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    expect(formula.element.readOnly).toBe(true);
    expect(wrapper.get('[data-ribbon-action="auto-sum"]').attributes("disabled")).toBe("");
    await formula.setValue("999");
    await formula.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe(12);
    await action(wrapper, "Overview", "duplicate");
    const copy = wrapper.findComponent(SheetGrid).props("sheet");
    expect(copy.id).not.toBe(sheet.id);
    expect(copy.properties.protected).toBe(false);
    expect(getCellValue(copy, { row: 0, column: 0 })).toBe(12);
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe(sheet.id);
    await wrapper.get('[data-ribbon-action="protect"]').trigger("click");
    expect(sheet.properties.protected).toBe(false);
    expect(wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element.readOnly).toBe(false);
  });

  test("commits a shared formula draft before protection and restoring a hidden sheet", async () => {
    const { wrapper, firstId } = await fixture();
    const overview = wrapper.findComponent(SheetGrid).props("sheet");
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await formula.trigger("focus");
    await formula.setValue("21");
    await action(wrapper, "Overview", "protect");
    expect(getCellValue(overview, { row: 0, column: 0 })).toBe(21);
    expect(overview.properties.protected).toBe(true);

    await action(wrapper, "Overview", "hide");
    const details = wrapper.findComponent(SheetGrid).props("sheet");
    const detailsFormula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    await detailsFormula.trigger("focus");
    await detailsFormula.setValue("34");
    await wrapper.get('[aria-label="All sheets"]').trigger("click");
    await new DOMWrapper(document.body)
      .get(`[data-workbook-hidden-sheet-id="${firstId}"]`)
      .trigger("click");

    expect(getCellValue(details, { row: 0, column: 0 })).toBe(34);
    expect(wrapper.findComponent(SheetGrid).props("sheet").id).toBe(firstId);
  });
});
