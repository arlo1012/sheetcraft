import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellValue,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDuplicateToolsController } from "../../../../modules/data-tools/useDuplicateToolsController";

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const selection = { range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } } };
  let controller!: ReturnType<typeof useDuplicateToolsController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useDuplicateToolsController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getGeneration: () => 0,
          isBusy: () => false,
          execute: (command) => executeWorkbookCommand(session, command),
          flush: () => true,
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  ["Item", "a", "b", "a", "b"].forEach((value, row) =>
    setCellValue(sheet, { row, column: 0 }, value),
  );
  return { session, sheet, selection, controller, wrapper };
}

describe("duplicate tools controller", () => {
  test("adds full-selection highlight rules without changing base fills and clears only highlights", () => {
    const f = fixture();
    setCellStyle(f.sheet, { row: 1, column: 0 }, { fillColor: "#0000ff" });
    f.controller.openDuplicateValues("highlight");
    f.controller.applyDuplicateValues(f.controller.duplicateValuesDraft.value);
    expect(f.sheet.duplicateRules).toHaveLength(1);
    expect(f.sheet.duplicateRules![0]!.range).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 4, column: 0 },
    });
    expect(f.sheet.cells.get("1:0")?.style?.fillColor).toBe("#0000ff");
    f.controller.openDuplicateValues("reject");
    f.controller.applyDuplicateValues(f.controller.duplicateValuesDraft.value);
    f.controller.clearDuplicateHighlights();
    expect(f.sheet.duplicateRules?.map((rule) => rule.kind)).toEqual(["reject"]);
    f.controller.clearDuplicateRejections();
    expect(f.sheet.duplicateRules).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(f.sheet.duplicateRules?.[0]?.kind).toBe("reject");
    f.wrapper.unmount();
  });

  test("summarizes the entire multicolumn selection in a new sheet and restores it with undo/redo", () => {
    const f = fixture();
    for (let column = 0; column < 5; column++) {
      setCellValue(f.sheet, { row: 0, column }, `title${column + 1}`);
      [3, 4, 5, 1, 2, 6].forEach((value, index) =>
        setCellValue(f.sheet, { row: index + 1, column }, value),
      );
    }
    f.selection.range.end = { row: 6, column: 4 };
    f.controller.openDuplicateValues("count");
    f.controller.applyDuplicateValues(f.controller.duplicateValuesDraft.value);
    const result = getActiveSheet(f.session.workbook);
    expect(result.id).not.toBe(f.sheet.id);
    expect(result.name).toBe("Duplicate counts");
    const evaluator = createSheetEvaluator(result);
    const rows = Array.from({ length: 12 }, (_, row) => [
      evaluator.getComputedValue({ row, column: 0 }),
      evaluator.getComputedValue({ row, column: 1 }),
    ]);
    expect(rows).toEqual([
      ["Value", "Count"],
      ...Array.from({ length: 5 }, (_, column) => [`title${column + 1}`, 1]),
      ...[3, 4, 5, 1, 2, 6].map((value) => [value, 5]),
    ]);
    expect(f.sheet.cells.size).toBe(35);
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 6, column: 4 })).toBe(6);
    expect(f.controller.duplicateValuesVisible.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(f.session);
    expect(f.session.workbook.sheets.size).toBe(1);
    expect(getActiveSheet(f.session.workbook).id).toBe(f.sheet.id);
    redoWorkbookCommand(f.session);
    expect(getActiveSheet(f.session.workbook).id).toBe(result.id);
    expect(
      createSheetEvaluator(getActiveSheet(f.session.workbook)).getComputedValue({
        row: 6,
        column: 1,
      }),
    ).toBe(5);
    f.wrapper.unmount();
  });

  test("leaves source neighbours intact and counts from a protected source", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 3, column: 1 }, "keep");
    f.sheet.properties.protected = true;
    f.controller.openDuplicateValues("count");
    expect(f.controller.duplicateValuesVisible.value).toBe(true);
    f.controller.applyDuplicateValues(f.controller.duplicateValuesDraft.value);
    expect(f.session.workbook.sheets.size).toBe(2);
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 3, column: 1 })).toBe("keep");
    const result = createSheetEvaluator(getActiveSheet(f.session.workbook));
    expect(result.getComputedValue({ row: 1, column: 0 })).toBe("Item");
    expect(result.getComputedValue({ row: 2, column: 1 })).toBe(2);
    f.wrapper.unmount();
  });

  test("keeps an empty selection open without creating a result sheet", () => {
    const f = fixture();
    f.controller.openDuplicateValues("count");
    f.controller.applyDuplicateValues({
      ...f.controller.duplicateValuesDraft.value,
      range: "G1:H5",
    });
    expect(f.controller.duplicateValuesVisible.value).toBe(true);
    expect(f.controller.duplicateValuesError.value).toBe(
      "The selected range has no data to process.",
    );
    expect(f.session.workbook.sheets.size).toBe(1);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.wrapper.unmount();
  });

  test("does not create a summary or change highlights when cancelled", () => {
    const f = fixture();
    f.controller.openDuplicateValues("count");
    f.controller.updateDuplicateValuesDraft({
      ...f.controller.duplicateValuesDraft.value,
      range: "A1:B5",
    });
    f.controller.closeDuplicateValues();
    expect(f.session.workbook.sheets.size).toBe(1);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.controller.openDuplicateValues("highlight");
    f.controller.updateDuplicateValuesDraft({
      ...f.controller.duplicateValuesDraft.value,
      fillColor: "#c6efce",
    });
    f.controller.closeDuplicateValues();
    expect(f.sheet.duplicateRules).toEqual([]);
    f.wrapper.unmount();
  });
});
