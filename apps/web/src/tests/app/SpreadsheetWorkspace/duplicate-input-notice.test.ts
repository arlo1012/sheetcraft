import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type SheetDataValidation,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import DataValidationFeedbackDialog from "../../../modules/data-tools/components/DataValidationFeedbackDialog.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../shared/i18n";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

async function mountWorkspace(
  options: { duplicate?: boolean; validation?: SheetDataValidation } = {},
) {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Overview",
  });
  const sheet = getActiveSheet(workbook);
  if (options.duplicate) {
    sheet.duplicateRules = [
      {
        id: "reject-duplicates",
        kind: "reject",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      },
    ];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Taken" });
  }
  if (options.validation) sheet.dataValidations = [options.validation];

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
  return wrapper;
}

function grid(workspace: NonNullable<typeof wrapper>) {
  return workspace.getComponent(SheetGrid);
}

function editSession(workspace: NonNullable<typeof wrapper>): CellEditSession {
  return grid(workspace).props("editSession") as CellEditSession;
}

function rejectDuplicate(workspace: NonNullable<typeof wrapper>): CellEditSession {
  const session = editSession(workspace);
  const sheet = grid(workspace).props("sheet");
  expect(
    session.begin(
      { sheetId: sheet.id, address: { row: 1, column: 0 }, input: "" },
      { surface: "grid", mode: "replace", initialValue: "Taken" },
    ),
  ).toBe(true);
  expect(session.finish()).toBe(false);
  return session;
}

describe("duplicate input rejection notice", () => {
  test("anchors duplicate rejection to the edited cell without blocking the workspace", async () => {
    const workspace = await mountWorkspace({ duplicate: true });
    const session = rejectDuplicate(workspace);
    await nextTick();

    expect(grid(workspace).props("inputError")).toMatchObject({
      address: { row: 1, column: 0 },
      title: "Reject Duplicate Entries",
      message: "This value duplicates another cell in this range. Change the value and try again.",
    });
    expect(workspace.find("[data-sheet-input-error-notice]").exists()).toBe(true);
    expect(workspace.findComponent(DataValidationFeedbackDialog).exists()).toBe(false);
    expect(workspace.get(".spreadsheet-workspace__grid").attributes("inert")).toBeUndefined();
    expect(session.state).toMatchObject({
      active: true,
      draft: "Taken",
      owner: { address: { row: 1, column: 0 } },
    });
  });

  test("dismisses the notice while keeping the rejected draft editable", async () => {
    const workspace = await mountWorkspace({ duplicate: true });
    const session = rejectDuplicate(workspace);
    await nextTick();

    grid(workspace).vm.$emit("dismissInputError");
    await nextTick();

    expect(grid(workspace).props("inputError")).toBeUndefined();
    expect(session.state).toMatchObject({ active: true, draft: "Taken" });
  });

  test("clears a duplicate notice when the draft changes or editing is cancelled", async () => {
    const workspace = await mountWorkspace({ duplicate: true });
    const session = rejectDuplicate(workspace);
    await nextTick();

    session.setDraft("Available");
    await nextTick();
    expect(grid(workspace).props("inputError")).toBeUndefined();

    expect(session.finish()).toBe(true);
    const sheet = grid(workspace).props("sheet");
    session.begin(
      { sheetId: sheet.id, address: { row: 2, column: 0 }, input: "" },
      { surface: "grid", mode: "replace", initialValue: "Taken" },
    );
    expect(session.finish()).toBe(false);
    await nextTick();
    expect(grid(workspace).props("inputError")).toBeDefined();

    session.cancel();
    await nextTick();
    expect(grid(workspace).props("inputError")).toBeUndefined();
  });

  test("keeps ordinary stop validation modal and inert", async () => {
    const workspace = await mountWorkspace({
      validation: {
        id: "whole-number",
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "10",
        allowBlank: false,
        errorStyle: "stop",
      },
    });
    const session = editSession(workspace);
    const sheet = grid(workspace).props("sheet");
    session.begin(
      { sheetId: sheet.id, address: { row: 0, column: 0 }, input: "" },
      { surface: "grid", mode: "replace", initialValue: "12" },
    );
    expect(session.finish()).toBe(false);
    await nextTick();

    expect(grid(workspace).props("inputError")).toBeUndefined();
    expect(workspace.findComponent(DataValidationFeedbackDialog).exists()).toBe(true);
    expect(workspace.get(".spreadsheet-workspace__grid").attributes("inert")).toBe("");
  });
});
