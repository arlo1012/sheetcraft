import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSetCellContentCommand } from "@idea10/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { datePartsToExcelSerial } from "@idea10/core/formula";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  type Workbook,
} from "@idea10/core/workbook";
import type { TextToColumnsDraft } from "../../../../modules/data-tools/data-tools-types";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function fixture(
  selection = {
    address: { row: 0, column: 0 },
    range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
  },
  workbook?: Workbook,
) {
  const session = reactive(
    createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
  );
  const sheet = getActiveSheet(session.workbook);
  let controller!: ReturnType<typeof useDataToolsController>;
  const set = (row: number, column: number, value: string | number) =>
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row, column }, { kind: "literal", value }),
    );

  mounted.push(
    mount(
      defineComponent({
        setup: () => {
          controller = useDataToolsController({
            getWorkbook: () => session.workbook,
            getSelection: () => selection,
            getSheetEvaluator: () => createSheetEvaluator(getActiveSheet(session.workbook)),
            getGeneration: () => 0,
            isBusy: () => false,
            execute: (command) => executeWorkbookCommand(session, command),
            flush: () => true,
            focusSheet: () => undefined,
          });
          return () => null;
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  return { session, sheet, controller, set };
}

function draft(patch: Partial<TextToColumnsDraft> = {}): TextToColumnsDraft {
  return {
    mode: "delimiter",
    delimiters: [],
    otherDelimiter: "",
    fixedWidths: [],
    columnTypes: [],
    destination: "E",
    overwrite: false,
    ...patch,
  };
}

function values(f: ReturnType<typeof fixture>, row: number, columns: number[]) {
  const evaluator = createSheetEvaluator(f.sheet);
  return columns.map((column) => evaluator.getComputedValue({ row, column }));
}

describe("text to columns controller", () => {
  test("uses one automatic, data-wide rule for preview and write, and undoes it in one step", () => {
    const f = fixture({
      address: { row: 1, column: 1 },
      range: { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
    });
    f.set(1, 1, "north,001");
    f.set(2, 1, "south,002,extra");
    f.set(3, 1, "west,003");
    f.controller.openTextToColumns();

    const automatic = draft({ mode: "auto", destination: "E" });
    f.controller.updateTextToColumnsDraft(automatic);
    expect(f.controller.splitSuggestions.value).toContainEqual(
      expect.objectContaining({
        id: 'delimiter:","',
        options: expect.objectContaining({ mode: "delimiter", delimiters: [","] }),
      }),
    );
    expect(f.controller.splitPreviewRows.value).toEqual([
      { row: 1, values: ["north", "001"] },
      { row: 2, values: ["south", "002", "extra"] },
      { row: 3, values: ["west", "003"] },
    ]);

    f.controller.applyTextToColumns(automatic);
    expect(values(f, 1, [4, 5])).toEqual(["north", 1]);
    expect(values(f, 2, [4, 5, 6])).toEqual(["south", 2, "extra"]);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(values(f, 1, [4, 5, 6])).toEqual([null, null, null]);
    expect(values(f, 1, [1])).toEqual(["north,001"]);
  });

  test("uses a replacement single-column source for automatic analysis, writing, and undo", () => {
    const f = fixture({
      address: { row: 0, column: 0 },
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    });
    f.set(0, 0, "stale,selection");
    f.set(1, 0, "must,not,write");
    f.set(2, 1, "north,001");
    f.set(3, 1, "south,002");
    f.controller.openTextToColumns();

    const replacement = draft({ mode: "auto", source: "B3:B4", destination: "E" });
    f.controller.updateTextToColumnsDraft(replacement);
    expect(f.controller.splitSuggestions.value).toContainEqual(
      expect.objectContaining({ id: 'delimiter:","' }),
    );
    expect(f.controller.splitPreviewRows.value).toEqual([
      { row: 2, values: ["north", "001"] },
      { row: 3, values: ["south", "002"] },
    ]);

    f.controller.applyTextToColumns(replacement);
    expect(values(f, 2, [4, 5])).toEqual(["north", 1]);
    expect(values(f, 3, [4, 5])).toEqual(["south", 2]);
    expect(values(f, 0, [4, 5])).toEqual([null, null]);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(values(f, 2, [4, 5])).toEqual([null, null]);
  });

  test("rejects empty, multi-column, and cross-sheet replacement sources without writing selection data", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    workbook.sheets.get("sheet")!.name = "Sheet1";
    workbook.sheets.set("other", createSheet("Other", "other"));
    const f = fixture(
      {
        address: { row: 0, column: 0 },
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      },
      workbook,
    );
    f.set(0, 0, "old,source");
    f.set(1, 0, "old,source");
    f.controller.openTextToColumns();

    for (const source of ["", "B1:C2", "='Other'!B1:B2"]) {
      const invalid = draft({ delimiters: [","], source, destination: "E" });
      f.controller.updateTextToColumnsDraft(invalid);
      expect(f.controller.splitPreviewError.value).not.toBe("");
      expect(f.controller.splitPreviewRows.value).toEqual([]);
      f.controller.applyTextToColumns(invalid);
      expect(values(f, 0, [4, 5])).toEqual([null, null]);
      expect(values(f, 1, [4, 5])).toEqual([null, null]);
    }
  });

  test("keeps keyword tokens at the chosen before or after boundary without treating them as characters", () => {
    const f = fixture({
      address: { row: 0, column: 0 },
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    });
    f.set(0, 0, "west::east");
    f.set(1, 0, "west:east");
    f.controller.openTextToColumns();

    f.controller.updateTextToColumnsDraft(
      draft({
        mode: "keyword",
        keywords: ["::"],
        keywordPosition: "after",
        keepKeywords: true,
      }),
    );
    expect(f.controller.splitPreviewRows.value).toEqual([
      { row: 0, values: ["west::", "east"] },
      { row: 1, values: ["west:east"] },
    ]);

    f.controller.updateTextToColumnsDraft(
      draft({
        mode: "keyword",
        keywords: ["::"],
        keywordPosition: "before",
        keepKeywords: true,
      }),
    );
    expect(f.controller.splitPreviewRows.value[0]?.values).toEqual(["west", "::east"]);

    f.controller.updateTextToColumnsDraft(
      draft({
        mode: "keyword",
        keywords: ["::"],
        keywordPosition: "before",
        keepKeywords: false,
      }),
    );
    expect(f.controller.splitPreviewRows.value[0]?.values).toEqual(["west", "east"]);
  });

  test("normalizes CRLF custom delimiters and treats CRLF as one newline delimiter", () => {
    const f = fixture();
    f.set(0, 0, "first\r\nsecond");
    f.controller.openTextToColumns();
    const newline = draft({
      delimiters: [],
      otherDelimiter: "\r\n",
      otherDelimiterMode: "token",
      destination: "E1",
    });
    f.controller.updateTextToColumnsDraft(newline);
    expect(f.controller.splitPreviewRows.value).toEqual([{ row: 0, values: ["first", "second"] }]);
    const standardNewline = draft({ delimiters: ["\n"], destination: "E1" });
    f.controller.updateTextToColumnsDraft(standardNewline);
    expect(f.controller.splitPreviewRows.value).toEqual([{ row: 0, values: ["first", "second"] }]);
    f.controller.applyTextToColumns(standardNewline);
    expect(values(f, 0, [4, 5])).toEqual(["first", "second"]);
  });

  test("distinguishes an atomic custom separator from its individual characters when writing", () => {
    const f = fixture();
    f.set(0, 0, "west::east:rest");
    f.controller.openTextToColumns();
    const characters = draft({ otherDelimiter: "::", destination: "E1" });
    f.controller.applyTextToColumns(characters);
    expect(values(f, 0, [4, 5, 6, 7])).toEqual(["west", "", "east", "rest"]);
    expect(undoWorkbookCommand(f.session)).toBe(true);

    f.controller.openTextToColumns();
    const token = draft({
      otherDelimiter: "::",
      otherDelimiterMode: "token",
      destination: "E1",
    });
    f.controller.applyTextToColumns(token);
    expect(values(f, 0, [4, 5])).toEqual(["west", "east:rest"]);
  });

  test("splits selected Chinese, English, and number runs, while text and date formats preserve their semantics", () => {
    const f = fixture();
    f.set(0, 0, "中文ABC001");
    f.controller.openTextToColumns();
    f.controller.updateTextToColumnsDraft(
      draft({ mode: "text-type", textTypes: ["chinese", "english", "number"] }),
    );
    expect(f.controller.splitPreviewRows.value).toEqual([
      { row: 0, values: ["中文", "ABC", "001"] },
    ]);

    f.set(0, 0, "001|13/02/2025");
    const typed = draft({
      delimiters: ["|"],
      destination: "E1",
      columnTypes: ["text", "date"],
      dateOrders: ["YMD", "DMY"],
    });
    f.controller.updateTextToColumnsDraft(typed);
    f.controller.applyTextToColumns(typed);
    expect(values(f, 0, [4])).toEqual(["001"]);
    expect(values(f, 0, [5])[0]).toBe(
      datePartsToExcelSerial(
        { year: 2025, month: 2, day: 13, hour: 0, minute: 0, second: 0, millisecond: 0 },
        f.session.workbook.dateSystem,
      ),
    );
    expect(getCellStyle(f.sheet, { row: 0, column: 5 })?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
  });

  test("counts a field appearing after the preview limit and refuses empty or unreliable automatic settings", () => {
    const f = fixture({
      address: { row: 0, column: 0 },
      range: { start: { row: 0, column: 0 }, end: { row: 20, column: 0 } },
    });
    f.set(0, 0, "first|row");
    f.set(20, 0, "late|field|needs|format");
    f.controller.openTextToColumns();
    f.controller.updateTextToColumnsDraft(draft({ delimiters: ["|"] }));
    expect(f.controller.splitPreviewRows.value).toHaveLength(20);
    expect(f.controller.splitColumnCount.value).toBe(4);

    const noDelimiter = draft({ delimiters: [] });
    f.controller.updateTextToColumnsDraft(noDelimiter);
    expect(f.controller.splitPreviewRows.value).toEqual([]);
    f.controller.applyTextToColumns(noDelimiter);
    expect(values(f, 0, [4])).toEqual([null]);

    const noSuggestion = fixture();
    noSuggestion.set(0, 0, "~~~~");
    noSuggestion.controller.openTextToColumns();
    noSuggestion.controller.applyTextToColumns(draft({ mode: "auto" }));
    expect(values(noSuggestion, 0, [4])).toEqual([null]);
  });
});
