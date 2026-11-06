// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellNote,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useReviewController } from "../../../modules/review-tools/useReviewController";
import { createAppI18n } from "../../../shared/i18n";
import { capturePrintNoteBoxes } from "../../../modules/page-layout/page-print-note-boxes";
import { createPrintShapeMetrics } from "../../../modules/page-layout/page-print-shapes";
import { createSheetEvaluator } from "@sheetcraft/core/workbook";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture() {
  const workbook = createWorkbook({ id: "review-print", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.mergedCells = [{ start: { row: 2, column: 2 }, end: { row: 3, column: 3 } }];
  for (const [row, column, text] of [
    [0, 0, "First"],
    [1, 1, "Second"],
    [2, 2, "Merged"],
  ] as const)
    setCellNote(sheet, { row, column }, { text });
  const currentSheet = shallowRef(sheet);
  const address = ref<CellAddress>({ row: 0, column: 0 });
  const generation = ref(0),
    revision = ref(0);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const accepted = executeWorkbookCommand(session, command);
    if (accepted) revision.value++;
    return accepted;
  });
  let review!: ReturnType<typeof useReviewController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        review = useReviewController({
          getWorkbook: () => workbook,
          getSheet: () => currentSheet.value,
          getAddress: () => address.value,
          getSelection: () => ({ start: address.value, end: address.value }),
          getGeneration: () => generation.value,
          getRevision: () => revision.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute,
          navigate: (value) => {
            address.value = value;
          },
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  return { workbook, sheet, currentSheet, address, generation, revision, review, execute };
}

describe("committed note visibility for printing", () => {
  test("combines shown-all notes and the active merged anchor while honoring hidden notes and hide-all", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["0:0"]));
    f.review.setAllNotesVisible(true);
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["0:0", "1:1", "2:2"]));
    f.review.toggleNote();
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["1:1", "2:2"]));
    f.address.value = { row: 1, column: 1 };
    await nextTick();
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["1:1", "2:2"]));
    f.review.setAllNotesVisible(false);
    f.address.value = { row: 3, column: 3 };
    await nextTick();
    expect(f.review.displayedNoteKeys.value.size).toBe(0);
    f.review.toggleNote();
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["2:2"]));
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("does not print unsaved text or draft geometry and never adds an uncommitted new note key", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.review.edit();
    f.review.draft.value = { ...f.review.draft.value!, text: "Unsaved text" };
    f.review.updateBox({
      address: f.address.value,
      box: { offsetX: 200, offsetY: 50, width: 300, height: 150 },
    });
    const boxes = capturePrintNoteBoxes({
      sheet: f.sheet,
      metrics: createPrintShapeMetrics(f.sheet, createSheetEvaluator(f.sheet)),
      displayedKeys: f.review.displayedNoteKeys.value,
      anonymous: "Anonymous",
    });
    expect(boxes).toMatchObject([{ text: "First", width: 128, height: 80 }]);
    f.review.close(false);
    f.address.value = { row: 4, column: 4 };
    await nextTick();
    f.review.edit();
    f.review.draft.value = { ...f.review.draft.value!, text: "New draft only" };
    expect(f.review.displayedNoteKeys.value).toEqual(new Set());
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("clears old-sheet visibility and drafts when switching sheets, retaining only the new active committed note", async () => {
    const f = fixture();
    const other = createSheet("Other", "other");
    setCellNote(other, { row: 0, column: 0 }, { text: "Other active note" });
    insertSheet(f.workbook, other);
    const before = serializeWorkbook(f.workbook);
    f.review.setAllNotesVisible(true);
    f.review.toggleNote();
    f.review.edit();
    f.currentSheet.value = other;
    f.generation.value++;
    await nextTick();
    expect(f.review.draft.value).toBeUndefined();
    expect(f.review.showAllNotes.value).toBe(false);
    expect(f.review.hiddenNoteKeys.value).toEqual([]);
    expect(f.review.displayedNoteKeys.value).toEqual(new Set(["0:0"]));
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
