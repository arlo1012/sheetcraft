import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSetCellNoteCommand } from "@idea10/core/commands";
import {
  createWorkbook,
  getActiveSheet,
  getCellNote,
  type CellAddress,
  type CellRange,
} from "@idea10/core/workbook";
import { useReviewController } from "../../../modules/review-tools/useReviewController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount>;
function fixture() {
  const workbook = createWorkbook({ id: "review", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const generation = ref(0);
  const revision = ref(0);
  const address = ref<CellAddress>({ row: 0, column: 0 });
  const selection = ref<CellRange>({ start: address.value, end: address.value });
  const navigate = vi.fn((value: CellAddress) => {
    address.value = value;
  });
  const finishEditing = vi.fn(() => true);
  const busy = ref(false);
  const rejected = ref(false);
  const execute = vi.fn((command) => {
    if (rejected.value) return false;
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  let review!: ReturnType<typeof useReviewController>;
  wrapper = mount(
    defineComponent({
      setup() {
        review = useReviewController({
          getWorkbook: () => workbook,
          getSheet: () => sheet,
          getAddress: () => address.value,
          getSelection: () => selection.value,
          getGeneration: () => generation.value,
          getRevision: () => revision.value,
          isBusy: () => busy.value,
          finishEditing,
          execute,
          navigate,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const add = (row: number, column: number, text: string) =>
    execute(createSetCellNoteCommand(workbook, sheet.id, { row, column }, { text }));
  return {
    workbook,
    sheet,
    session,
    generation,
    revision,
    address,
    selection,
    review,
    execute,
    navigate,
    finishEditing,
    busy,
    rejected,
    add,
  };
}
afterEach(() => wrapper?.unmount());

describe("review controller", () => {
  test("creates a note without touching cell contents and undo removes it", () => {
    const f = fixture();
    f.review.edit();
    f.review.save({ text: "Check\nthis total", author: "Alice" });
    expect(getCellNote(f.sheet, { row: 0, column: 0 })).toEqual({
      text: "Check\nthis total",
      author: "Alice",
    });
    expect(f.review.draft.value).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(getCellNote(f.sheet, { row: 0, column: 0 })).toBeUndefined();
  });
  test("navigates notes in row-major order and wraps without workbook commands", () => {
    const f = fixture();
    f.add(4, 0, "last");
    f.add(0, 3, "first");
    f.add(2, 1, "middle");
    f.execute.mockClear();
    f.review.step(1);
    expect(f.navigate).toHaveBeenLastCalledWith({ row: 0, column: 3 });
    f.review.step(-1);
    expect(f.navigate).toHaveBeenLastCalledWith({ row: 4, column: 0 });
    f.review.step(1);
    expect(f.navigate).toHaveBeenLastCalledWith({ row: 0, column: 3 });
    expect(f.review.showActiveNote.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("shows a selected note by default and restores viewing after switching cells", async () => {
    const f = fixture();
    f.add(0, 0, "First");
    f.add(1, 1, "Second");
    f.execute.mockClear();
    expect(f.review.showActiveNote.value).toBe(true);
    f.review.toggleNote();
    expect(f.review.showActiveNote.value).toBe(false);
    f.address.value = { row: 1, column: 1 };
    await nextTick();
    expect(f.review.showActiveNote.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("deletes only selected notes atomically and one undo restores the range", () => {
    const f = fixture();
    f.add(0, 0, "a");
    f.add(1, 0, "b");
    f.add(4, 0, "outside");
    f.selection.value = { start: { row: 1, column: 0 }, end: { row: 0, column: 0 } };
    expect(f.review.hasSelectedNotes.value).toBe(true);
    f.execute.mockClear();
    f.review.remove();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.review.notes.value.map((note) => note.text)).toEqual(["outside"]);
    undoWorkbookCommand(f.session);
    f.revision.value++;
    expect(f.review.notes.value.map((note) => note.text)).toEqual(["a", "b", "outside"]);
  });
  test("keeps a rejected or empty draft and refuses writes to a changed target", async () => {
    const f = fixture();
    f.review.edit();
    f.review.save({ text: "  ", author: "" });
    expect(f.review.error.value).not.toBe("");
    f.rejected.value = true;
    f.review.save({ text: "note", author: "" });
    expect(f.review.draft.value).toBeDefined();
    f.rejected.value = false;
    f.revision.value++;
    f.review.save({ text: "stale", author: "" });
    expect(getCellNote(f.sheet, { row: 0, column: 0 })).toBeUndefined();
    f.generation.value++;
    await nextTick();
    expect(f.review.draft.value).toBeUndefined();
  });
  test("protected sheets allow browsing only and failed edit flush prevents navigation", () => {
    const f = fixture();
    f.add(0, 0, "keep");
    f.sheet.properties.protected = true;
    f.review.edit();
    f.review.remove();
    expect(f.review.draft.value).toBeUndefined();
    expect(getCellNote(f.sheet, { row: 0, column: 0 })?.text).toBe("keep");
    f.review.step(1);
    expect(f.navigate).toHaveBeenCalledTimes(1);
    f.finishEditing.mockReturnValue(false);
    f.review.step(1);
    expect(f.navigate).toHaveBeenCalledTimes(1);
  });
});
