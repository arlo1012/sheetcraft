import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => wrapper?.unmount());
test("canonical ingress, real history and replacement preserve source-free placement", () => {
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
  const before = serializeWorkbook(controller.session.workbook);
  const command = createSetSheetDrawingsCommand(controller.activeSheet.value.id, [framedShape()]);
  expect(controller.executeCommand(command)).toBe(true);
  const saved = serializeWorkbook(controller.session.workbook);
  expect(saved.version).toBe(60);
  expect(controller.undo()).toBe(true);
  expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
  expect(controller.redo()).toBe(true);
  expect(serializeWorkbook(controller.session.workbook)).toEqual(saved);
  const incoming = createWorkbook({ id: "incoming", sheetId: "sheet" });
  getActiveSheet(incoming).drawings = [framedShape()];
  expect(() => controller.replaceWorkbook(incoming)).not.toThrow();
  expect(serializeWorkbook(controller.session.workbook)).toEqual(serializeWorkbook(incoming));
  expect(controller.session.history.undoStack).toHaveLength(0);
});
