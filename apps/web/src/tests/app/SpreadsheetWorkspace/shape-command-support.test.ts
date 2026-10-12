import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { createSetSheetDrawingsCommand, getWorkbookOperation } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => wrapper?.unmount());
test("canonical shape ingress/replacement rejects before history, selection, generation, and current state change", () => {
  let controller!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  controller.commitCell({ address: { row: 0, column: 0 }, input: "retained" });
  const command = createSetSheetDrawingsCommand(controller.activeSheet.value.id, [framedShape()]);
  const before = serializeWorkbook(controller.session.workbook),
    history = JSON.parse(JSON.stringify(controller.session.history)),
    revision = controller.workbookRevision.value,
    generation = controller.workbookGeneration.value,
    selection = controller.activeSheetViewState.value;
  expect(controller.executeCommand(command)).toBe(false);
  expect(controller.executeReplaceableCommand(command)).toEqual({
    changed: false,
    accepted: false,
  });
  controller.session.history.undoStack.push({ command, operation: getWorkbookOperation(command) });
  const blockedUndo = JSON.parse(JSON.stringify(controller.session.history));
  expect(controller.undo()).toBe(false);
  expect(controller.session.history).toEqual(blockedUndo);
  controller.session.history.undoStack.pop();
  controller.session.history.redoStack.push({ command, operation: getWorkbookOperation(command) });
  const blockedRedo = JSON.parse(JSON.stringify(controller.session.history));
  expect(controller.redo()).toBe(false);
  expect(controller.session.history).toEqual(blockedRedo);
  controller.session.history.redoStack.pop();
  expect(controller.workspaceStatusText.value).toBe(controller.t("persistence.unsupportedShapes"));
  const incoming = createWorkbook({ id: "incoming", sheetId: "sheet" });
  getActiveSheet(incoming).drawings = [framedShape()];
  expect(() => controller.replaceWorkbook(incoming)).toThrow(/Canonical shape/);
  expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
  expect(controller.session.history).toEqual(history);
  expect(controller.workbookRevision.value).toBe(revision);
  expect(controller.workbookGeneration.value).toBe(generation);
  expect(controller.activeSheetViewState.value).toBe(selection);
});
