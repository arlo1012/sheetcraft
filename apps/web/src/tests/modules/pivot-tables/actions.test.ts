import { describe, expect, test } from "vitest";
import { getCellValue, setCellContent } from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { undoWorkbookCommand } from "@idea10/core/history";
import { fixture } from "./fixture";

describe("pivot actions", () => {
  test("creates genuine output and an optional chart on a new sheet in one undoable action", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.actions.open(true);
    const draft = f.actions.editing.value!;
    expect(draft.newSheet).toBe(true);
    expect(draft.overwrite).toBe(false);
    f.actions.confirm(draft);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.id).not.toBe(f.source.id);
    expect(f.sheet.pivotTables).toHaveLength(1);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
    expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBe(40);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("refreshes an existing pivot from changed source values and restores them through undo", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    f.selectOutput();
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 15 });
    const before = serializeWorkbook(f.workbook);
    f.actions.refresh();
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(35);
    expect(f.sheet.pivotTables).toHaveLength(1);
    expect(f.onError).not.toHaveBeenCalled();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("closes an unchanged confirmation without adding a history entry or reporting an error", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    f.selectOutput();
    f.actions.open();
    expect(f.actions.editing.value!.existing).toBe(true);
    f.actions.confirm(f.actions.editing.value!);
    expect(f.execute.mock.results.at(-1)?.value).toBe(false);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(f.onError).not.toHaveBeenCalled();
    undoWorkbookCommand(f.session);
    expect(f.workbook.sheets.size).toBe(1);
  });
  test("rejects refresh expansion conflicts atomically and leaves the editor open", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    f.selectOutput();
    ["North", "Q1", 50].forEach((value, column) =>
      setCellContent(f.source, { row: 4, column }, { kind: "literal", value }),
    );
    setCellContent(f.sheet, { row: 4, column: 0 }, { kind: "literal", value: "Blocker" });
    f.actions.open();
    const draft = { ...f.actions.editing.value!, source: "'Source Data'!A1:C5" };
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm(draft);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBeDefined();
    f.actions.confirm({ ...draft, overwrite: true });
    expect(f.actions.editing.value).toBeUndefined();
    expect(getCellValue(f.sheet, { row: 4, column: 1 })).toBe(120);
  });
  test("honors explicit existing-sheet destinations without silently overwriting cells", () => {
    const f = fixture();
    f.actions.open();
    const draft = { ...f.actions.editing.value!, newSheet: false, destination: "'Source Data'!E1" };
    setCellContent(f.source, { row: 0, column: 4 }, { kind: "literal", value: "Existing" });
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm(draft);
    expect(f.actions.error.value).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.actions.confirm({ ...draft, overwrite: true });
    expect(f.source.pivotTables).toHaveLength(1);
    expect(getCellValue(f.source, { row: 1, column: 5 })).toBe(30);
  });
  test("rejects a draft captured from a replaced workbook", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.replaceWorkbook();
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("rejects new-sheet creation after workbook structure protection changes", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.workbook.structureProtected = true;
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
  });
  test("rechecks pivot permissions on a protected existing destination", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!);
    f.selectOutput();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.execute.mockClear();
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
    f.actions.close();
    f.actions.refresh();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
