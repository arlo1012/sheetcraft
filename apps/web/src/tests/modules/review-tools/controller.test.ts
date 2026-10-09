import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSetCellNoteCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  getActiveSheet,
  getCellNote,
  type CellAddress,
  type CellRange,
} from "@sheetcraft/core/workbook";
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
  test("moves an existing note with one undo and keeps its box when editing text", () => {
    const f = fixture();
    f.add(0, 0, "original");
    const box = { offsetX: 36, offsetY: -12, width: 220, height: 100 };
    f.execute.mockClear();
    f.review.updateBox({ address: f.address.value, box });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual(box);
    undoWorkbookCommand(f.session);
    f.revision.value++;
    expect(getCellNote(f.sheet, f.address.value)?.box).toBeUndefined();
    f.review.updateBox({ address: f.address.value, box });
    f.review.edit();
    f.review.save({ text: "updated", author: "Alice", restoreFocus: false });
    expect(getCellNote(f.sheet, f.address.value)).toEqual({
      text: "updated",
      author: "Alice",
      box,
    });
  });
  test("keeps inline draft text and geometry in one save and discards cancelled geometry", () => {
    const f = fixture();
    f.review.edit();
    const box = { offsetX: 80, offsetY: 20, width: 180, height: 120 };
    f.review.updateBox({ address: f.address.value, box });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.review.draft.value?.box).toEqual(box);
    f.review.save({ text: "note", author: "Alice" });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual(box);
    f.review.edit();
    f.review.updateBox({ address: f.address.value, box: { ...box, width: 300 } });
    f.review.close(false);
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual(box);
  });
  test("resets position and size independently with undo/redo and preserves author/text", () => {
    const f = fixture();
    const box = { offsetX: 70, offsetY: 30, width: 240, height: 140 };
    f.execute(
      createSetCellNoteCommand(f.workbook, f.sheet.id, f.address.value, {
        text: "Keep",
        author: "Ada",
        box,
      }),
    );
    f.execute.mockClear();
    f.review.resetBox("position");
    expect(getCellNote(f.sheet, f.address.value)).toEqual({
      text: "Keep",
      author: "Ada",
      box: { ...box, offsetX: 15, offsetY: -10 },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    undoWorkbookCommand(f.session);
    f.revision.value++;
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual(box);
    redoWorkbookCommand(f.session);
    f.revision.value++;
    expect(getCellNote(f.sheet, f.address.value)?.box?.width).toBe(240);
    f.review.resetBox("size");
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual({
      offsetX: 15,
      offsetY: -10,
      width: 128,
      height: 80,
    });
    f.review.updateBox({ address: f.address.value, box });
    f.review.resetBox("all");
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual({
      offsetX: 15,
      offsetY: -10,
      width: 128,
      height: 80,
    });
  });
  test("reset respects protection and keeps draft geometry in its save transaction", () => {
    const f = fixture();
    f.add(0, 0, "Keep");
    const box = { offsetX: 70, offsetY: 30, width: 240, height: 140 };
    f.review.updateBox({ address: f.address.value, box });
    f.sheet.properties.protected = true;
    f.review.resetBox("all");
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual(box);
    f.sheet.properties.protected = false;
    f.review.edit();
    f.execute.mockClear();
    f.review.resetBox("size");
    expect(f.execute).not.toHaveBeenCalled();
    f.review.save({ text: "Updated", author: "Ada" });
    expect(getCellNote(f.sheet, f.address.value)?.box).toEqual({ ...box, width: 128, height: 80 });
    undoWorkbookCommand(f.session);
    expect(getCellNote(f.sheet, f.address.value)).toEqual({ text: "Keep", box });
  });
  test("all-note visibility is view state and allows hiding a single note", async () => {
    const f = fixture();
    f.add(0, 0, "First");
    f.add(1, 1, "Second");
    f.execute.mockClear();
    f.review.setAllNotesVisible(true);
    f.review.toggleNote();
    expect(f.review.showAllNotes.value).toBe(true);
    expect(f.review.hiddenNoteKeys.value).toEqual(["0:0"]);
    f.address.value = { row: 1, column: 1 };
    await nextTick();
    expect(f.review.showActiveNote.value).toBe(true);
    f.address.value = { row: 0, column: 0 };
    await nextTick();
    expect(f.review.showActiveNote.value).toBe(false);
    f.review.setAllNotesVisible(false);
    f.address.value = { row: 1, column: 1 };
    await nextTick();
    expect(f.review.showActiveNote.value).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    f.review.step(1);
    await nextTick();
    expect(f.review.showActiveNote.value).toBe(true);
    f.generation.value++;
    await nextTick();
    expect(f.review.showAllNotes.value).toBe(false);
    expect(f.review.showActiveNote.value).toBe(true);
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
