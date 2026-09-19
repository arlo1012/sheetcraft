import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import {
  createWorkbook,
  getCellContent,
  getCellStyle,
  setCellContent,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { DUPLICATE_ERROR_CHECKS_STORAGE_KEY } from "../../../modules/data-tools/duplicate-error-preferences";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import CellEditor from "../../../modules/sheet-grid/components/CellEditor.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../shared/i18n";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";

let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => localStorage.removeItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY));
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  localStorage.removeItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY);
});

async function setup() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: async () => ({ revision: 2, savedAt: 2 }),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await flushPromises();
  const grid = wrapper.getComponent(SheetGrid);
  const session = grid.props("editSession") as CellEditSession;
  const sheet = grid.props("sheet");
  async function enter(input: string) {
    session.begin(
      { sheetId: sheet.id, address: { row: 0, column: 0 }, input: "" },
      { surface: "grid", mode: "replace", initialValue: input },
    );
    expect(session.finish()).toBe(true);
    await flushPromises();
  }
  return { grid, sheet, enter };
}

describe("numeric text cell errors", () => {
  test("marks long numeric input without losing digits and exposes the matching error message", async () => {
    const { grid, sheet, enter } = await setup();
    const value = "11111111111111111111";
    await enter(value);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value });
    expect(grid.props("errorCells")).toEqual(new Set(["0:0"]));
    const trigger = grid.get("[data-sheet-cell-error-trigger]");
    expect(trigger.attributes("aria-label")).toBe("Numbers stored as text");
    await trigger.trigger("click");
    const menu = new DOMWrapper(document.body).get(
      '[role="menu"][aria-label="Numbers stored as text"]',
    );
    expect(menu.text()).toContain(
      "This number is stored as text and may cause calculation errors.",
    );
    expect(menu.text()).not.toContain("duplicate-entry restriction");
    await menu.get('[data-sheet-cell-error-action="ignore"]').trigger("click");
    await flushPromises();
    expect(grid.props("errorCells")).toEqual(new Set());
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value });
    await enter("12");
    await enter(value);
    expect(grid.props("errorCells")).toEqual(new Set(["0:0"]));
  });

  test("distinguishes numeric text from actual numbers and ordinary text", async () => {
    const { grid, enter } = await setup();
    await enter("'0012");
    expect(grid.props("errorCells")).toEqual(new Set(["0:0"]));
    await enter("12");
    expect(grid.props("errorCells")).toEqual(new Set());
    await enter("product123");
    expect(grid.props("errorCells")).toEqual(new Set());
  });
  test.each([
    ["convert-number", [0]],
    ["convert-number-batch", [0, 1]],
    ["correct-sheet", [0, 1, 3]],
  ] as const)(
    "routes %s to its intended scope and converts long text only within that scope",
    async (action, convertedRows) => {
      const { grid, sheet, enter } = await setup();
      for (const row of [1, 3]) {
        setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: "0012" });
      }
      const longValue = "11111111111111111111";
      setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: longValue });
      await enter("'0012");
      grid.vm.$emit(
        "viewStateChange",
        createSheetGridViewState({
          selection: {
            active: { row: 0, column: 0 },
            anchor: { row: 0, column: 0 },
            focus: { row: 1, column: 0 },
            mode: "cells",
          },
        }),
      );
      await flushPromises();
      await grid.get("[data-sheet-cell-error-trigger]").trigger("click");
      const menu = new DOMWrapper(document.body).get(
        '[role="menu"][aria-label="Numbers stored as text"]',
      );
      expect(
        menu
          .findAll("[data-sheet-cell-error-action]")
          .map((item) => item.attributes("data-sheet-cell-error-action")),
      ).toEqual([
        "convert-number",
        "convert-number-batch",
        "correct-sheet",
        "ignore",
        "ignore-all",
        "edit-formula-bar",
        "options",
      ]);
      await menu.get(`[data-sheet-cell-error-action="${action}"]`).trigger("click");
      await flushPromises();
      for (const row of [0, 1, 3]) {
        expect(getCellContent(sheet, { row, column: 0 })).toEqual({
          kind: "literal",
          value: (convertedRows as readonly number[]).includes(row) ? 12 : "0012",
        });
      }
      expect(getCellContent(sheet, { row: 4, column: 0 })).toEqual({
        kind: "literal",
        value: action === "correct-sheet" ? 1.11111111111111e19 : longValue,
      });
      if (action === "correct-sheet") {
        expect(getCellStyle(sheet, { row: 4, column: 0 })?.numberFormat).toEqual({
          kind: "scientific",
          fractionDigits: 2,
        });
      }
    },
  );
  test("explicit conversion displays long numeric text scientifically and undo restores every original digit", async () => {
    const { grid, sheet, enter } = await setup();
    const address = { row: 0, column: 0 };
    const value = "11111111111111111111";
    await enter(value);
    await grid.get("[data-sheet-cell-error-trigger]").trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-sheet-cell-error-action="convert-number"]')
      .trigger("click");
    await flushPromises();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 1.11111111111111e19 });
    expect(getCellStyle(sheet, address)?.numberFormat).toEqual({
      kind: "scientific",
      fractionDigits: 2,
    });
    expect(grid.getComponent(CellEditor).props("displayValue")).toBe("1.11E+19");
    expect(grid.props("errorCells")).toEqual(new Set());
    grid.vm.$emit("undo");
    await flushPromises();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value });
    expect(getCellStyle(sheet, address)?.numberFormat).toBeUndefined();
    expect(grid.props("errorCells")).toEqual(new Set(["0:0"]));
  });
});
