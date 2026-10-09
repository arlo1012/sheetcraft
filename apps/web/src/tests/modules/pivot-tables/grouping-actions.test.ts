import { describe, expect, test, vi } from "vitest";
import { undoWorkbookCommand } from "@idea10/core/history";
import type { WorkbookCommand } from "@idea10/core/commands";
import type { PivotFieldGroup } from "@idea10/core/pivot-tables";
import { getCellValue, setCellContent, setCellStyle, type Sheet } from "@idea10/core/workbook";
import { usePivotGrouping } from "../../../modules/pivot-tables/usePivotGrouping";
import { fixture } from "./fixture";
const group: PivotFieldGroup = {
  field: 2,
  kind: "number",
  start: 0,
  end: 49,
  interval: 25,
};
function setup() {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  f.actions.update({
    ...f.sheet.pivotTables![0]!,
    rowFields: [2],
    values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
  });
  const report = f.sheet;
  let sheet: Sheet = report,
    busy = false;
  let field: number | undefined = 2;
  const execute = vi.fn((command: WorkbookCommand) => f.execute(command));
  const flush = vi.fn(() => true),
    onError = vi.fn();
  const grouping = usePivotGrouping({
    getWorkbook: () => f.workbook,
    getSheet: () => sheet,
    selected: (id) => sheet.pivotTables?.find((table) => !id || table.id === id),
    getField: () => field,
    isBusy: () => busy,
    flush,
    execute,
    onError,
  });
  return {
    ...f,
    report,
    grouping,
    execute,
    flush,
    onError,
    current: () => report.pivotTables![0]!,
    setBusy(value: boolean) {
      busy = value;
    },
    setSheet(value: Sheet) {
      sheet = value;
    },
    setField(value: number | undefined) {
      field = value;
    },
  };
}
describe("pivot grouping actions", () => {
  test("stages numeric bounds without mutation; grouping the measure field still sums raw numbers", () => {
    const f = setup();
    const before = f.session.history.undoStack.length;
    f.grouping.open();
    expect(f.grouping.draft.value).toMatchObject({
      field: 2,
      name: "Amount",
      initial: { kind: "number", start: 10, end: 40 },
    });
    expect(f.execute).not.toHaveBeenCalled();
    f.grouping.close();
    expect(f.current().groups).toBeUndefined();
    f.grouping.open();
    expect(f.grouping.apply(group)).toBe(true);
    expect(f.grouping.draft.value).toBeUndefined();
    expect(f.current().groups).toEqual([group]);
    expect([1, 2, 3].map((row) => getCellValue(f.report, { row, column: 1 }))).toEqual([
      30, 40, 70,
    ]);
    expect(f.session.history.undoStack).toHaveLength(before + 1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().groups).toBeUndefined();
  });
  test("cancelling edits to an existing group preserves it; ungroup creates one reversible command", () => {
    const f = setup();
    f.grouping.open();
    f.grouping.apply(group);
    f.execute.mockClear();
    f.grouping.open();
    expect(f.grouping.draft.value?.initial).toEqual(group);
    f.grouping.close();
    expect(f.current().groups).toEqual([group]);
    expect(f.execute).not.toHaveBeenCalled();
    const before = f.session.history.undoStack.length;
    expect(f.grouping.ungroup()).toBe(true);
    expect(f.current().groups).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(before + 1);
    undoWorkbookCommand(f.session);
    expect(f.current().groups).toEqual([group]);
  });
  test("reopening an automatic group captures current raw bounds without replacing its saved limits", () => {
    const f = setup();
    f.grouping.open();
    f.grouping.apply({ ...group, autoStart: true, autoEnd: true });
    const saved = { ...f.current().groups![0]! };
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 65 });
    f.execute.mockClear();
    f.grouping.open();
    expect(f.grouping.draft.value).toMatchObject({
      min: 20,
      max: 65,
      initial: saved,
    });
    f.grouping.close();
    expect(f.current().groups).toEqual([saved]);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("date-formatted members choose Months while preserving serials in the current epoch", () => {
    const f = setup();
    f.workbook.dateSystem = "1904";
    setCellStyle(
      f.source,
      { row: 1, column: 2 },
      { numberFormat: { kind: "date", code: "yyyy-mm-dd" } },
    );
    f.grouping.open();
    expect(f.grouping.draft.value?.initial).toEqual({
      field: 2,
      kind: "date",
      unit: "months",
      start: 10,
      end: 40,
      interval: 1,
    });
  });
  test.each([
    null,
    { kind: "literal", value: "" },
    { kind: "literal", value: "pending" },
    { kind: "formula", formula: { source: "=1/0" } },
  ] as const)("mixed non-numeric source members cannot open grouping", (content) => {
    const f = setup();
    setCellContent(f.source, { row: 2, column: 2 }, content);
    f.grouping.open();
    expect(f.grouping.draft.value).toBeUndefined();
    expect(f.onError).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["busy", "flush", "protected", "stale"] as const)(
    "%s changes after opening prevent apply without side effects",
    (guard) => {
      const f = setup();
      f.grouping.open();
      if (guard === "busy") f.setBusy(true);
      if (guard === "flush") f.flush.mockReturnValueOnce(false);
      if (guard === "protected") {
        f.report.properties.protected = true;
        f.report.protection = { editableRanges: [] };
      }
      if (guard === "stale") f.setSheet(f.source);
      expect(f.grouping.apply(group)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.current().groups).toBeUndefined();
    },
  );
  test("execution failure retains the draft and never updates grouping state", () => {
    const f = setup();
    f.grouping.open();
    f.execute.mockReturnValueOnce(false);
    expect(f.grouping.apply(group)).toBe(false);
    expect(f.grouping.draft.value).toBeDefined();
    expect(f.current().groups).toBeUndefined();
  });
  test("invalid and oversized groups are rejected without mutations", () => {
    const f = setup();
    f.grouping.open();
    expect(f.grouping.apply({ ...group, interval: 0 })).toBe(false);
    expect(f.grouping.apply({ ...group, end: 1000000, interval: 1 })).toBe(false);
    expect(f.current().groups).toBeUndefined();
    expect(f.onError).toHaveBeenCalledTimes(2);
  });
});
