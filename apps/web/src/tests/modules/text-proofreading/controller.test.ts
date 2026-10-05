import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkbookCommand } from "@idea10/core/commands";
import {
  createApplyCellStyleCommand,
  createSetSheetProtectionCommand,
} from "@idea10/core/commands";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@idea10/core/workbook";
import { useWordProofreading } from "../../../modules/text-proofreading/useWordProofreading";
import { createAppI18n } from "../../../shared/i18n";

const a1 = { row: 0, column: 0 },
  a2 = { row: 1, column: 0 };
const wrappers: ReturnType<typeof mount>[] = [];
function fixture() {
  const workbook = createWorkbook({ id: "words", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  setCellContent(sheet, a1, { kind: "literal", value: "再接再励和按步就班" });
  setCellContent(sheet, a2, { kind: "literal", value: "迫不急待" });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const revision = ref(0);
  const execute = vi.fn((command: WorkbookCommand) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  let review!: ReturnType<typeof useWordProofreading>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          review = useWordProofreading({
            getWorkbook: () => workbook,
            getSheet: () => sheet,
            getSelection: () => ({ start: a1, end: a2 }),
            getGeneration: () => 0,
            getRevision: () => revision.value,
            isBusy: () => false,
            finishEditing: () => true,
            execute,
          });
          return () => h("div");
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  return { workbook, sheet, session, revision, execute, review };
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  localStorage.clear();
});

describe("Chinese proofreading controller", () => {
  test("adds newline-separated accepted words atomically and removes conflicting mistakes", () => {
    const f = fixture();
    f.review.add("测试", "建议");
    expect(f.review.addAcceptedWords(" 测试 \r\n正词\n\n测试\r另一个")).toBe(true);
    expect(f.review.dictionary.value.accepted).toEqual(["测试", "正词", "另一个"]);
    expect(f.review.dictionary.value.mistakes).toEqual([]);
    expect(f.review.addAcceptedWords("有效\n" + "词".repeat(101))).toBe(false);
    expect(f.review.dictionary.value.accepted).toEqual(["测试", "正词", "另一个"]);
  });
  test("applies different suggestions across cells as one undoable command", () => {
    const f = fixture();
    f.review.open("review");
    expect(f.review.issues.value).toHaveLength(3);
    f.review.apply(f.review.issues.value);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(getCellContent(f.sheet, a1)).toEqual({ kind: "literal", value: "再接再厉和按部就班" });
    expect(getCellContent(f.sheet, a2)).toEqual({ kind: "literal", value: "迫不及待" });
    expect(f.review.issues.value).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, a1)).toEqual({ kind: "literal", value: "再接再励和按步就班" });
    expect(getCellContent(f.sheet, a2)).toEqual({ kind: "literal", value: "迫不急待" });
  });

  test("accepts selected words together, deduplicates them, and leaves unselected issues", () => {
    const f = fixture();
    setCellContent(f.sheet, a1, { kind: "literal", value: "再接再励再接再励" });
    f.review.open("review");
    f.review.selected.value = f.review.issues.value
      .filter((issue) => issue.word === "再接再励")
      .map((issue) => issue.id);
    expect(f.review.acceptSelected()).toBe(true);
    expect(f.review.dictionary.value.accepted).toEqual(["再接再励"]);
    expect(f.review.issues.value.map((issue) => issue.word)).toEqual(["迫不急待"]);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("does not partially accept words when dictionary persistence fails", () => {
    const f = fixture();
    f.review.open("review");
    f.review.selected.value = f.review.issues.value.map((issue) => issue.id);
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    try {
      expect(f.review.acceptSelected()).toBe(false);
      expect(f.review.dictionary.value.accepted).toEqual([]);
      expect(f.review.issues.value).toHaveLength(3);
    } finally {
      write.mockRestore();
    }
  });

  test("refuses stale results without invoking workbook commands", () => {
    const f = fixture();
    f.review.open("review");
    f.revision.value++;
    f.review.apply(f.review.issues.value);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.review.error.value).not.toBe("");
    expect(getCellContent(f.sheet, a1)).toEqual({ kind: "literal", value: "再接再励和按步就班" });
  });

  test("persists accepted words and reloads them to suppress matching mistakes", () => {
    const first = fixture();
    expect(first.review.add("再接再励")).toBe(true);
    const reloaded = fixture();
    expect(reloaded.review.dictionary.value.accepted).toEqual(["再接再励"]);
    reloaded.review.open("review");
    expect(reloaded.review.issues.value.map((issue) => issue.word)).toEqual([
      "按步就班",
      "迫不急待",
    ]);
    expect(reloaded.execute).not.toHaveBeenCalled();
  });

  test("renames an existing dictionary rule instead of leaving its old spelling behind", () => {
    const f = fixture();
    expect(f.review.add("旧错词", "旧正词")).toBe(true);
    expect(f.review.add("新错词", "新正词", "旧错词")).toBe(true);
    expect(f.review.dictionary.value.mistakes).toEqual([{ word: "新错词", replacement: "新正词" }]);
    expect(fixture().review.dictionary.value.mistakes).toEqual([
      { word: "新错词", replacement: "新正词" },
    ]);
  });

  test("keeps ignored occurrences hidden after applying another issue and shifting text offsets", () => {
    const f = fixture();
    setCellContent(f.sheet, a1, { kind: "literal", value: "错词再接再励" });
    expect(f.review.add("错词", "这是正确词")).toBe(true);
    f.review.open("review");
    const ignored = f.review.issues.value.find((issue) => issue.word === "再接再励")!;
    f.review.ignore([ignored.id]);
    expect(f.review.issues.value.some((issue) => issue.word === "再接再励")).toBe(false);
    f.review.apply([f.review.issues.value.find((issue) => issue.word === "错词")!]);
    expect(getCellContent(f.sheet, a1)).toEqual({ kind: "literal", value: "这是正确词再接再励" });
    expect(f.review.issues.value.map((issue) => issue.word)).toEqual(["迫不急待"]);
  });

  test("skips protected cells and corrects only an unlocked cell", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createApplyCellStyleCommand(f.sheet.id, { start: a2, end: a2 }, { unlocked: true }),
    );
    executeWorkbookCommand(f.session, createSetSheetProtectionCommand(f.sheet.id, true));
    f.review.open("review");
    expect(f.review.skipped.value).toBe(1);
    expect(f.review.issues.value.map((issue) => issue.word)).toEqual(["迫不急待"]);
    f.review.apply(f.review.issues.value);
    expect(getCellContent(f.sheet, a1)).toEqual({ kind: "literal", value: "再接再励和按步就班" });
    expect(getCellContent(f.sheet, a2)).toEqual({ kind: "literal", value: "迫不及待" });
  });
});
