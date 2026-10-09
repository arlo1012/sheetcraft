import { defineComponent, nextTick, reactive, ref, watch } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  createSheetEvaluator,
  getActiveSheet,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataComparisonController } from "../../../../modules/data-tools/useDataComparisonController";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const second = createSheet("Other", "other");
  session.workbook.sheets.set(second.id, second);
  const selection = { range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } } };
  const generation = ref(0);
  let busy = false;
  let canFlush = true;
  let controller!: ReturnType<typeof useDataComparisonController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        // The workspace observes the active sheet synchronously while clearing input feedback.
        watch(
          () => getActiveSheet(session.workbook).id,
          () => {},
          { flush: "sync" },
        );
        controller = useDataComparisonController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getGeneration: () => generation.value,
          isBusy: () => busy,
          flush: () => canFlush,
          execute: (command) => executeWorkbookCommand(session, command),
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  ["Item", "a", "b", "a", "c"].forEach((value, row) =>
    setCellValue(sheet, { row, column: 0 }, value),
  );
  ["Item", "a", "d", "a"].forEach((value, row) => setCellValue(second, { row, column: 0 }, value));
  return {
    session,
    sheet,
    second,
    selection,
    generation,
    controller,
    setBusy: (value: boolean) => {
      busy = value;
    },
    setFlush: (value: boolean) => {
      canFlush = value;
    },
  };
}

describe("data comparison controller", () => {
  test.each([
    ["markDuplicate", [1, 3]],
    ["markUnique", [2, 4]],
  ] as const)("%s marks the matching source cells", (action, expectedRows) => {
    const f = fixture();
    f.controller.openComparison(action);
    f.controller.applyComparison({ ...f.controller.comparisonDraft.value, hasHeader: true });
    const marked = [0, 1, 2, 3, 4].filter(
      (row) => f.sheet.cells.get(`${row}:0`)?.style?.fillColor === "#ffc7ce",
    );
    expect(marked).toEqual(expectedRows);
    expect(f.controller.comparisonVisible.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each([
    ["extractDuplicate", ["a", "a"]],
    ["extractUnique", ["b", "c"]],
  ] as const)("%s writes matching values to a new sheet", (action, expectedValues) => {
    const f = fixture();
    f.controller.openComparison(action);
    f.controller.applyComparison({ ...f.controller.comparisonDraft.value, hasHeader: true });
    const result = getActiveSheet(f.session.workbook);
    expect(result.id).not.toBe(f.sheet.id);
    const evaluator = createSheetEvaluator(result);
    expect(
      expectedValues.map((_, index) => evaluator.getComputedValue({ row: index + 1, column: 0 })),
    ).toEqual(expectedValues);
    expect(f.sheet.cells.size).toBe(5);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("compares across sheets and applies only to the requested result side", () => {
    const f = fixture();
    f.controller.openComparison("markUnique");
    f.controller.applyComparison({
      ...f.controller.comparisonDraft.value,
      scope: "double",
      secondRange: "Other!A1:A4",
      side: "second",
      hasHeader: true,
    });
    expect(f.second.cells.get("2:0")?.style?.fillColor).toBe("#ffc7ce");
    expect(f.second.cells.get("1:0")?.style).toBeUndefined();
    expect(f.sheet.cells.get("2:0")?.style).toBeUndefined();
  });

  test("keeps the original default sheet when a picker visits another sheet", () => {
    const f = fixture();
    f.controller.openComparison("markUnique");
    f.session.workbook.activeSheetId = f.second.id;
    f.controller.applyComparison({
      ...f.controller.comparisonDraft.value,
      firstRange: "A1:A5",
      scope: "double",
      secondRange: "Other!A1:A4",
      hasHeader: true,
    });
    expect(f.sheet.cells.get("2:0")?.style?.fillColor).toBe("#ffc7ce");
    expect(f.second.cells.get("2:0")?.style).toBeUndefined();
  });

  test("publishes a valid active sheet when extracting after a cross-sheet pick and undoing", () => {
    const f = fixture();
    f.controller.openComparison("extractDuplicate");
    f.session.workbook.activeSheetId = f.second.id;
    f.controller.applyComparison({
      ...f.controller.comparisonDraft.value,
      scope: "double",
      secondRange: "Other!A1:A4",
      hasHeader: true,
    });
    expect(f.controller.comparisonError.value).toBe("");
    const resultId = getActiveSheet(f.session.workbook).id;
    expect(resultId).not.toBe(f.second.id);
    expect(f.session.workbook.sheets.size).toBe(3);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(getActiveSheet(f.session.workbook).id).toBe(f.second.id);
    expect(f.session.workbook.sheets.size).toBe(2);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(getActiveSheet(f.session.workbook).id).toBe(resultId);
    expect(f.session.workbook.sheets.size).toBe(3);
  });

  test("keeps invalid and empty comparisons open without history changes", () => {
    const f = fixture();
    f.controller.openComparison("extractDuplicate");
    const initial = { ...f.controller.comparisonDraft.value };
    for (const patch of [
      { firstRange: "missing!A1:A5" },
      { scope: "double" as const, secondRange: "" },
      { firstRange: "G1:G5" },
    ]) {
      f.controller.applyComparison({ ...initial, ...patch });
      expect(f.controller.comparisonVisible.value).toBe(true);
      expect(f.controller.comparisonError.value).not.toBe("");
      expect(f.session.workbook.sheets.size).toBe(2);
      expect(f.session.history.undoStack).toHaveLength(0);
    }
  });

  test("refreshes column choices after changing the first range and preserves row-only edits", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 2 }, "Code");
    setCellValue(f.sheet, { row: 0, column: 3 }, "Name");
    f.controller.openComparison("extractUnique");
    f.controller.updateComparisonDraft({
      ...f.controller.comparisonDraft.value,
      firstRange: "C1:D5",
      comparisonMode: "rows",
      hasHeader: true,
    });
    expect(f.controller.comparisonDraft.value.columns).toEqual([0, 1]);
    expect(f.controller.comparisonColumns.value).toEqual([
      { column: 0, label: "C", header: "Code" },
      { column: 1, label: "D", header: "Name" },
    ]);
    f.controller.updateComparisonDraft({ ...f.controller.comparisonDraft.value, columns: [1] });
    f.controller.updateComparisonDraft({
      ...f.controller.comparisonDraft.value,
      firstRange: "C1:D8",
    });
    expect(f.controller.comparisonDraft.value.columns).toEqual([1]);
  });

  test("allows extraction from a protected source but rejects marking it", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.controller.openComparison("markDuplicate");
    f.controller.applyComparison(f.controller.comparisonDraft.value);
    expect(f.controller.comparisonVisible.value).toBe(true);
    expect(f.controller.comparisonError.value).not.toBe("");
    expect(f.session.history.undoStack).toHaveLength(0);
    f.controller.closeComparison();
    f.controller.openComparison("extractDuplicate");
    f.controller.applyComparison(f.controller.comparisonDraft.value);
    expect(f.controller.comparisonVisible.value).toBe(false);
    expect(f.session.workbook.sheets.size).toBe(3);
  });

  test("rejects stale drafts and closes when the document is replaced", async () => {
    const f = fixture();
    f.controller.openComparison("markDuplicate");
    const stale = f.controller.comparisonDraft.value;
    f.generation.value++;
    f.controller.applyComparison(stale);
    expect(f.session.history.undoStack).toHaveLength(0);
    await nextTick();
    expect(f.controller.comparisonVisible.value).toBe(false);
  });

  test("respects busy and pending edit guards", () => {
    const f = fixture();
    f.setBusy(true);
    f.controller.openComparison("markDuplicate");
    expect(f.controller.comparisonVisible.value).toBe(false);
    f.setBusy(false);
    f.setFlush(false);
    f.controller.openComparison("markDuplicate");
    expect(f.controller.comparisonVisible.value).toBe(false);
    f.setFlush(true);
    f.controller.openComparison("markDuplicate");
    f.setBusy(true);
    f.controller.applyComparison(f.controller.comparisonDraft.value);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.controller.comparisonVisible.value).toBe(true);
  });
});
