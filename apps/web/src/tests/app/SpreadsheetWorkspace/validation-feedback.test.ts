import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../shared/i18n";
import type {
  CellEditSession,
  CellEditSurface,
} from "../../../shared/cell-editing/useCellEditSession";

let wrapper: ReturnType<typeof mount> | undefined;
const address = { row: 0, column: 0 };
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

async function setup(style: "warning" | "stop" = "warning", surface: CellEditSurface = "grid") {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const initialSheet = getActiveSheet(workbook);
  setCellContent(initialSheet, address, { kind: "literal", value: 5 });
  initialSheet.dataValidations = [
    {
      id: "validation",
      range: { start: address, end: address },
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "10",
      allowBlank: false,
      errorStyle: style,
      error: "Choose a number from 1 to 10",
    },
  ];
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
  session.begin(
    { sheetId: sheet.id, address, input: "5" },
    { surface, mode: "replace", initialValue: "12" },
  );
  expect(session.finish()).toBe(false);
  await flushPromises();
  return { session, sheet };
}

function actions() {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] .t-dialog__footer button',
    ),
  ];
}
async function click(label: string) {
  const button = actions().find((button) => button.textContent?.trim() === label);
  expect(button).toBeDefined();
  button!.click();
  await flushPromises();
}

describe("validation feedback actions", () => {
  test.each(["grid", "formula-bar"] as const)(
    "No retains the draft and returns focus to %s for correction",
    async (surface) => {
      const { session, sheet } = await setup("warning", surface);
      expect(actions().map((button) => button.textContent?.trim())).toEqual([
        "Yes",
        "No",
        "Cancel",
      ]);
      expect(
        document.querySelector('[role="alertdialog"] :is(.t-dialog__body, .t-dialog__body__icon)')
          ?.textContent,
      ).toBe("Choose a number from 1 to 10");
      await click("No");
      expect(session.state).toMatchObject({
        active: true,
        draft: "12",
        surface,
        owner: { address },
      });
      expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 5 });
      const selector = surface === "grid" ? "[data-cell-editor]" : "[data-formula-input]";
      expect(document.activeElement).toBe(document.querySelector(selector));
      session.setDraft("8");
      expect(session.finish()).toBe(true);
      expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 8 });
    },
  );

  test("Yes retains the invalid warning value and ends editing", async () => {
    const { session, sheet } = await setup();
    await click("Yes");
    expect(session.state.active).toBe(false);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 12 });
  });

  test.each(["warning", "stop"] as const)(
    "Cancel discards the %s draft and preserves the old value",
    async (style) => {
      const { session, sheet } = await setup(style);
      await click("Cancel");
      expect(session.state.active).toBe(false);
      expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 5 });
    },
  );

  test("stop errors only offer Retry and Cancel, with Retry keeping the draft editable", async () => {
    const { session, sheet } = await setup("stop");
    expect(
      actions()
        .map((button) => button.textContent?.trim())
        .sort(),
    ).toEqual(["Cancel", "Retry"]);
    await click("Retry");
    expect(session.state).toMatchObject({ active: true, draft: "12" });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: 5 });
    expect(document.activeElement).toBe(document.querySelector("[data-cell-editor]"));
    expect(session.finish()).toBe(false);
  });
});
