import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellValue,
  setCellStyle,
} from "@idea10/core/workbook";
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
  test("adds header-excluding highlight rules without changing base fills and clears only highlights", () => {
    const f = fixture();
    setCellStyle(f.sheet, { row: 1, column: 0 }, { fillColor: "#0000ff" });
    f.controller.openDuplicateValues("highlight");
    f.controller.applyDuplicateValues({
      ...f.controller.duplicateValuesDraft.value,
      hasHeader: true,
    });
    expect(f.sheet.duplicateRules).toHaveLength(1);
    expect(f.sheet.duplicateRules![0]!.range).toEqual({
      start: { row: 1, column: 0 },
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

  test("writes header and per-value frequencies to a separate column and preserves source", () => {
    const f = fixture();
    f.controller.openDuplicateValues("count");
    f.controller.applyDuplicateValues({
      ...f.controller.duplicateValuesDraft.value,
      hasHeader: true,
    });
    const evaluator = createSheetEvaluator(f.sheet);
    expect([0, 1, 2, 3, 4].map((row) => evaluator.getComputedValue({ row, column: 1 }))).toEqual([
      "Count",
      2,
      2,
      2,
      2,
    ]);
    expect(evaluator.getComputedValue({ row: 1, column: 0 })).toBe("a");
    expect(f.controller.duplicateValuesVisible.value).toBe(false);
    undoWorkbookCommand(f.session);
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 1, column: 1 })).toBeNull();
    f.wrapper.unmount();
  });

  test("keeps the dialog open and writes nothing when the output contains data", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 3, column: 1 }, "keep");
    f.controller.openDuplicateValues("count");
    f.controller.applyDuplicateValues(f.controller.duplicateValuesDraft.value);
    expect(f.controller.duplicateValuesVisible.value).toBe(true);
    expect(f.controller.duplicateValuesError.value).toBeTruthy();
    const evaluator = createSheetEvaluator(f.sheet);
    expect(evaluator.getComputedValue({ row: 0, column: 1 })).toBeNull();
    expect(evaluator.getComputedValue({ row: 3, column: 1 })).toBe("keep");
    f.wrapper.unmount();
  });

  test("rejects multicolumn counts and does not apply a cancelled draft", () => {
    const f = fixture();
    f.controller.openDuplicateValues("count");
    f.controller.applyDuplicateValues({
      ...f.controller.duplicateValuesDraft.value,
      range: "A1:B5",
    });
    expect(f.controller.duplicateValuesError.value).toBeTruthy();
    expect(f.session.history.undoStack).toHaveLength(0);
    f.controller.closeDuplicateValues();
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
