import { defineComponent, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { datePartsToExcelSerial } from "@idea10/core/formula";
import { createSheet, getActiveSheet, getCellValue, setCellValue } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useFillToolsController } from "../../../../modules/data-tools/useFillToolsController";
const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture(blocked = false) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const generation = ref(0);
  const selection = { range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } } };
  let controller!: ReturnType<typeof useFillToolsController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useFillToolsController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getGeneration: () => generation.value,
          isBusy: () => false,
          flush: () => true,
          execute: (command) => !blocked && executeWorkbookCommand(session, command),
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  return { session, sheet, selection, generation, controller };
}
describe("fill tools controller", () => {
  test("fills the captured range and undoes the operation together", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 0 }, 5);
    f.controller.openFillBlanks();
    f.selection.range.end.row = 5;
    f.controller.applyFillBlanks({ mode: "up", value: "" });
    expect([0, 1, 2, 3].map((row) => getCellValue(f.sheet, { row, column: 0 }))).toEqual([
      5,
      5,
      5,
      null,
    ]);
    expect(f.controller.fillBlanksVisible.value).toBe(false);
    undoWorkbookCommand(f.session);
    expect(getCellValue(getActiveSheet(f.session.workbook), { row: 1, column: 0 })).toBe(null);
  });
  test("converts explicit blank-fill input to typed values and keeps formula-looking text literal", () => {
    const f = fixture();
    f.controller.openFillBlanks();
    f.controller.applyFillBlanks({ mode: "value", value: "42" });
    expect(getCellValue(f.sheet, { row: 2, column: 0 })).toBe(42);
    setCellValue(f.sheet, { row: 1, column: 0 }, null);
    f.controller.openFillBlanks();
    f.controller.applyFillBlanks({ mode: "value", value: "=1+1" });
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBe("=1+1");
  });
  test("writes a static current date using the workbook date system", () => {
    const f = fixture();
    f.session.workbook.dateSystem = "1904";
    f.controller.openFillCurrentDate();
    const draft = f.controller.fillCurrentDateInitial.value;
    f.controller.applyFillCurrentDate(draft);
    expect(getCellValue(f.sheet, { row: 2, column: 0 })).toBe(
      datePartsToExcelSerial({ ...draft, hour: 0, minute: 0, second: 0, millisecond: 0 }, "1904"),
    );
  });
  test("parses date stop values and extends a single seed", () => {
    const f = fixture();
    f.selection.range.end.row = 0;
    const serial = datePartsToExcelSerial(
      { year: 2026, month: 9, day: 20, hour: 0, minute: 0, second: 0, millisecond: 0 },
      "1900",
    );
    setCellValue(f.sheet, { row: 0, column: 0 }, serial);
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      stop: "2026-09-22",
    });
    expect(getCellValue(f.sheet, { row: 2, column: 0 })).toBe(serial + 2);
    expect(getCellValue(f.sheet, { row: 3, column: 0 })).toBe(null);
  });
  test("uses the end of a selected month as an ascending date-series stop", () => {
    const f = fixture();
    f.selection.range.end.row = 0;
    setCellValue(
      f.sheet,
      { row: 0, column: 0 },
      datePartsToExcelSerial(
        { year: 2026, month: 1, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "month",
      step: 1,
      stop: "2026-03",
    });
    expect([0, 1, 2].map((row) => getCellValue(f.sheet, { row, column: 0 }))).toEqual([
      datePartsToExcelSerial(
        { year: 2026, month: 1, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
      datePartsToExcelSerial(
        { year: 2026, month: 2, day: 28, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
      datePartsToExcelSerial(
        { year: 2026, month: 3, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    ]);
  });
  test("uses the start of a selected period for descending month and year series", () => {
    const f = fixture();
    f.selection.range.end.row = 0;
    setCellValue(
      f.sheet,
      { row: 0, column: 0 },
      datePartsToExcelSerial(
        { year: 2026, month: 5, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "month",
      step: -1,
      stop: "2026-03",
    });
    expect(getCellValue(f.sheet, { row: 2, column: 0 })).toBe(
      datePartsToExcelSerial(
        { year: 2026, month: 3, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
    f.selection.range.end.row = 0;
    setCellValue(
      f.sheet,
      { row: 0, column: 1 },
      datePartsToExcelSerial(
        { year: 2028, month: 2, day: 29, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
    f.selection.range.start.column = 1;
    f.selection.range.end.column = 1;
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "year",
      step: -1,
      stop: "2026",
    });
    expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBe(
      datePartsToExcelSerial(
        { year: 2026, month: 2, day: 28, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
  });
  test("uses calendar month boundaries with the 1904 date system", () => {
    const f = fixture();
    f.session.workbook.dateSystem = "1904";
    f.selection.range.end.row = 0;
    setCellValue(
      f.sheet,
      { row: 0, column: 0 },
      datePartsToExcelSerial(
        { year: 2026, month: 1, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1904",
      ),
    );
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "month",
      step: 1,
      stop: "2026-02",
    });
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBe(
      datePartsToExcelSerial(
        { year: 2026, month: 2, day: 28, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1904",
      ),
    );
  });
  test("uses the end of a selected year as an ascending date-series stop", () => {
    const f = fixture();
    f.selection.range.end.row = 0;
    setCellValue(
      f.sheet,
      { row: 0, column: 0 },
      datePartsToExcelSerial(
        { year: 2024, month: 12, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "year",
      step: 1,
      stop: "2026",
    });
    expect(getCellValue(f.sheet, { row: 2, column: 0 })).toBe(
      datePartsToExcelSerial(
        { year: 2026, month: 12, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1900",
      ),
    );
  });
  test("rejects invalid calendar stops without partially filling the range", () => {
    const f = fixture();
    f.selection.range.end.row = 0;
    const seed = datePartsToExcelSerial(
      { year: 2026, month: 1, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
      "1900",
    );
    setCellValue(f.sheet, { row: 0, column: 0 }, seed);
    f.controller.openFillSeries();
    f.controller.applyFillSeries({
      ...f.controller.fillSeriesInitial.value,
      type: "date",
      dateUnit: "day",
      stop: "2026-02-29",
    });
    expect(f.controller.fillSeriesVisible.value).toBe(true);
    expect(f.controller.fillError.value).not.toBe("");
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBe(seed);
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBe(null);
  });
  test("rejects stale workbook generations before writing", () => {
    const f = fixture();
    f.controller.openFillText();
    f.generation.value++;
    f.controller.applyFillText({ position: "start", from: "left", index: 0, text: "hello" });
    expect(f.controller.fillError.value).not.toBe("");
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBe(null);
  });
  test("retains the dialog when validation blocks the write", () => {
    const f = fixture(true);
    f.controller.openFillText();
    f.controller.applyFillText({ position: "end", from: "left", index: 0, text: "!" });
    expect(f.controller.fillTextVisible.value).toBe(true);
    expect(f.controller.fillError.value).not.toBe("");
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBe(null);
  });
  test("rejects a batch atomically when any filled cell fails ordinary validation", () => {
    const f = fixture();
    f.sheet.dataValidations = [
      {
        id: "limit",
        range: { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "10",
        allowBlank: true,
        showError: true,
      },
    ];
    f.controller.openFillBlanks();
    f.controller.applyFillBlanks({ mode: "value", value: "99" });
    expect(f.controller.fillBlanksVisible.value).toBe(true);
    expect(f.controller.fillError.value).toContain("validation");
    expect([0, 1, 2].map((row) => getCellValue(f.sheet, { row, column: 0 }))).toEqual([
      null,
      null,
      null,
    ]);
    f.controller.applyFillBlanks({ mode: "value", value: "5" });
    expect([0, 1, 2].map((row) => getCellValue(f.sheet, { row, column: 0 }))).toEqual([5, 5, 5]);
  });
  test("rejects invalid stopping values and protected destinations", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 0 }, 1);
    f.controller.openFillSeries();
    f.controller.applyFillSeries({ ...f.controller.fillSeriesInitial.value, stop: "oops" });
    expect(f.controller.fillError.value).not.toBe("");
    f.sheet.properties.protected = true;
    f.controller.applyFillSeries(f.controller.fillSeriesInitial.value);
    expect(f.controller.fillSeriesVisible.value).toBe(true);
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBe(null);
  });
});

describe("number and quick fill integration", () => {
  test("fills a captured rectangle with 123 sequence in one undo step", () => {
    const f = fixture();
    f.selection.range.end = { row: 1, column: 1 };
    f.controller.openFillNumberSequence();
    f.selection.range.end = { row: 9, column: 9 };
    f.controller.applyFillNumberSequence({ axis: "rows", start: 10, step: -2 });
    expect(
      [0, 1].flatMap((row) => [0, 1].map((column) => getCellValue(f.sheet, { row, column }))),
    ).toEqual([10, 8, 6, 4]);
    expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBeNull();
    expect(f.controller.fillNumberSequenceVisible.value).toBe(false);
    undoWorkbookCommand(f.session);
    expect(getCellValue(getActiveSheet(f.session.workbook), { row: 0, column: 0 })).toBeNull();
  });
  test("presets the requested text insertion mode", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 0 }, "hello");
    f.controller.openFillText("index");
    expect(f.controller.fillTextInitial.value.position).toBe("index");
    f.controller.applyFillText({ ...f.controller.fillTextInitial.value, index: 2, text: "!" });
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBe("he!llo");
  });
  test("quick date uses the chosen format and retains an error dialog when rejected", () => {
    const f = fixture();
    f.controller.fillCurrentDate("yyyymmdd");
    expect(typeof getCellValue(f.sheet, { row: 0, column: 0 })).toBe("number");
    expect(f.sheet.cells.get("0:0")?.style?.numberFormat).toEqual({
      kind: "custom",
      code: "yyyymmdd",
    });
    expect(f.controller.fillCurrentDateVisible.value).toBe(false);
    const blocked = fixture(true);
    blocked.controller.fillCurrentDate("yyyy.m.d");
    expect(blocked.controller.fillCurrentDateVisible.value).toBe(true);
    expect(blocked.controller.fillError.value).not.toBe("");
  });
  test("ranks into another sheet, protects existing contents and supports undo", () => {
    const f = fixture();
    [20, 50, 50].forEach((value, row) => setCellValue(f.sheet, { row, column: 0 }, value));
    const output = createSheet("Results", "results");
    f.session.workbook.sheets.set(output.id, output);
    setCellValue(output, { row: 1, column: 1 }, "keep");
    f.controller.openFillRank();
    const draft = { ...f.controller.fillRankInitial.value, destination: "=Results!$B$1" };
    f.controller.applyFillRank(draft);
    expect(f.controller.fillRankVisible.value).toBe(true);
    expect(f.controller.fillError.value).toContain("contains data");
    expect(getCellValue(output, { row: 0, column: 1 })).toBeNull();
    f.controller.applyFillRank({ ...draft, overwrite: true });
    expect(
      [0, 1, 2].map((row) =>
        getCellValue(f.session.workbook.sheets.get(output.id)!, { row, column: 1 }),
      ),
    ).toEqual([3, 1, 1]);
    expect(f.controller.fillRankVisible.value).toBe(false);
    undoWorkbookCommand(f.session);
    expect(getCellValue(f.session.workbook.sheets.get(output.id)!, { row: 1, column: 1 })).toBe(
      "keep",
    );
  });
  test("rank validates the complete output atomically", () => {
    const f = fixture();
    [20, 50, 50].forEach((value, row) => setCellValue(f.sheet, { row, column: 0 }, value));
    f.sheet.dataValidations = [
      {
        id: "rank-limit",
        range: { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "2",
        allowBlank: true,
        showError: true,
      },
    ];
    f.controller.openFillRank();
    f.controller.applyFillRank(f.controller.fillRankInitial.value);
    expect(f.controller.fillError.value).toContain("validation");
    expect([0, 1, 2].map((row) => getCellValue(f.sheet, { row, column: 1 }))).toEqual([
      null,
      null,
      null,
    ]);
  });
});
