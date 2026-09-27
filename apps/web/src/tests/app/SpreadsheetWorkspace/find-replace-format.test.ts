import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getCellContent, getCellStyle, setCellStyle, setCellValue } from "@idea10/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { applyFindFormatChange } from "../../../modules/workbook/workbook-find-format";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;
let wrapper: ReturnType<typeof mount> | undefined;

function mountController(): Controller {
  let controller: Controller | undefined;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) throw new Error("Controller did not initialize");
  return controller;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("find replacement formatting", () => {
  test("applies text and cleared format keys atomically, then restores both on undo", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const address = { row: 0, column: 0 };
    setCellValue(sheet, address, "needle");
    setCellStyle(sheet, address, { italic: true, fillColor: "#ff0000" });

    controller.workbookFind.updateQuery("needle");
    controller.workbookFind.replacement.value = "changed";
    controller.workbookFind.setOptionsExpanded(true);
    controller.workbookFind.setReplacementFormat(
      applyFindFormatChange(undefined, { style: { bold: true, italic: false } }),
    );
    controller.workbookFind.replaceAll();

    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "changed" });
    expect(getCellStyle(sheet, address)).toEqual({ bold: true, fillColor: "#ff0000" });
    expect(controller.session.history.undoStack).toHaveLength(1);

    expect(controller.undo()).toBe(true);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "needle" });
    expect(getCellStyle(sheet, address)).toEqual({ italic: true, fillColor: "#ff0000" });
  });
});
