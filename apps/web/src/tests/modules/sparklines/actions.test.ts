// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
  setCellContent,
  setCellSparkline,
  setCellStyle,
  type CellRange,
} from "@sheetcraft/core/workbook";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { useSparklineActions } from "../../../modules/sparklines/useSparklineActions";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";

function fixture(range: CellRange = { start: { row: 0, column: 0 }, end: { row: 1, column: 2 } }) {
  let workbook = createWorkbook({ id: "sparklines", sheetId: "first" });
  let sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let busy = false;
  const flush = vi.fn(() => true);
  const execute = vi.fn((command) => executeWorkbookCommand(session, command));
  const actions = useSparklineActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => 0,
    getRange: () => range,
    flush,
    isBusy: () => busy,
    execute,
  });
  return {
    actions,
    session,
    execute,
    flush,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
    setBusy() {
      busy = true;
    },
  };
}

describe("sparkline actions", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "creates the selected %s sparkline type",
    (type) => {
      const f = fixture();
      f.actions.open(type);

      expect(f.actions.draft.value?.sparkline.type).toBe(type);
      expect(f.actions.draft.value?.source).toBe("");
      expect(f.actions.draft.value?.destination).toMatch(/!\$A\$1:\$C\$2$/);
      expect(f.actions.dialog.value?.editing).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      f.actions.confirm({ ...f.actions.draft.value!, source: "A1:C2", destination: "D1:D2" });

      expect(f.execute).toHaveBeenCalledTimes(1);
      for (let row = 0; row < 2; row++)
        expect(getCellSparkline(f.sheet, { row, column: 3 })).toMatchObject({
          type,
          source: { start: { row, column: 0 }, end: { row, column: 2 } },
        });
    },
  );

  test.each(["line", "column", "winLoss"] as const)(
    "changes an existing sparkline to %s while retaining its source and style",
    (type) => {
      const f = fixture();
      const address = { row: 0, column: 0 };
      const existing: CellSparkline = {
        type: type === "line" ? "column" : "line",
        source: { start: { row: 3, column: 1 }, end: { row: 3, column: 3 } },
        color: "#12ab34",
        negativeColor: "#ab1234",
        markers: true,
        axis: true,
        showHidden: true,
        empty: "connect",
      };
      setCellSparkline(f.sheet, address, existing);
      setCellContent(f.sheet, address, { kind: "literal", value: 0 });
      setCellContent(f.sheet, { row: 1, column: 2 }, { kind: "literal", value: "Selected data" });

      f.actions.open(type);

      const draft = f.actions.draft.value!;
      expect(f.actions.dialog.value?.editing).toBe(true);
      expect(draft.sparkline).toEqual({ ...existing, type });
      expect(draft.source).toMatch(/!\$B\$4:\$D\$4$/);
      expect(draft.destination).toMatch(/!\$A\$1$/);
      expect(getCellSparkline(f.sheet, address)).toEqual(existing);
      expect(f.execute).not.toHaveBeenCalled();

      f.actions.confirm(draft);

      expect(getCellSparkline(f.sheet, address)).toEqual({ ...existing, type });
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.actions.draft.value).toBeUndefined();
      undoWorkbookCommand(f.session);
      expect(getCellSparkline(f.sheet, address)).toEqual(existing);
    },
  );

  test("keeps the default and existing type when open has no type argument", () => {
    const f = fixture();
    f.actions.open();
    expect(f.actions.draft.value?.sparkline.type).toBe("line");
    expect(f.actions.draft.value?.source).toBe("");
    expect(f.actions.draft.value?.destination).toMatch(/!\$A\$1:\$C\$2$/);
    expect(f.actions.dialog.value?.editing).toBe(false);
    const existing: CellSparkline = {
      ...f.actions.draft.value!.sparkline,
      type: "winLoss",
      source: { start: { row: 4, column: 0 }, end: { row: 4, column: 2 } },
      color: "#aabbcc",
      markers: true,
    };
    setCellSparkline(f.sheet, { row: 0, column: 0 }, existing);

    f.actions.open();

    expect(f.actions.draft.value?.sparkline).toEqual(existing);
    expect(f.actions.draft.value?.source).toMatch(/!\$A\$5:\$C\$5$/);
    expect(f.actions.draft.value?.destination).toMatch(/!\$A\$1$/);
    expect(f.actions.dialog.value?.editing).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: "single cell",
      range: { start: { row: 5, column: 3 }, end: { row: 5, column: 3 } },
      destination: "!$D$6",
    },
    {
      label: "horizontal selection",
      range: { start: { row: 5, column: 3 }, end: { row: 5, column: 5 } },
      destination: "!$D$6:$F$6",
    },
    {
      label: "vertical selection",
      range: { start: { row: 5, column: 3 }, end: { row: 7, column: 3 } },
      destination: "!$D$6:$D$8",
    },
  ])("uses the selected destination for a new sparkline in a $label", ({ range, destination }) => {
    const f = fixture(range);
    f.actions.open();

    expect(f.actions.draft.value?.source).toBe("");
    expect(f.actions.draft.value?.destination.endsWith(destination)).toBe(true);
    expect(f.actions.dialog.value?.editing).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each([
    { label: "text", content: { kind: "literal", value: "Sales" } },
    { label: "numeric zero", content: { kind: "literal", value: 0 } },
    { label: "boolean false", content: { kind: "literal", value: false } },
    {
      label: "a formula producing an empty string",
      content: { kind: "formula", formula: { source: '=""' } },
    },
    {
      label: "an error",
      content: { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
    },
  ] satisfies Array<{ label: string; content: NonNullable<Parameters<typeof setCellContent>[2]> }>)(
    "uses the entire selection as source when its last cell contains $label",
    ({ content }) => {
      const f = fixture();
      setCellContent(f.sheet, { row: 1, column: 2 }, content);
      f.actions.open();

      expect(f.actions.draft.value?.source).toMatch(/!\$A\$1:\$C\$2$/);
      expect(f.actions.draft.value?.destination).toBe("");
      expect(f.actions.dialog.value?.editing).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("treats empty literals and style-only cells as a blank destination selection", () => {
    const f = fixture();
    setCellStyle(f.sheet, { row: 0, column: 0 }, { bold: true });
    setCellContent(f.sheet, { row: 1, column: 2 }, { kind: "literal", value: "" });
    setCellContent(f.sheet, { row: 0, column: 1 }, null);
    f.actions.open();

    expect(f.actions.draft.value?.source).toBe("");
    expect(f.actions.draft.value?.destination).toMatch(/!\$A\$1:\$C\$2$/);
    expect(f.actions.dialog.value?.editing).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("ignores nonempty cells just outside the selected range when choosing source and destination", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 1, column: 3 }, { kind: "literal", value: 12 });
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "Outside" });
    f.actions.open();

    expect(f.actions.draft.value?.source).toBe("");
    expect(f.actions.draft.value?.destination).toMatch(/!\$A\$1:\$C\$2$/);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("uses a nonempty single selected cell as source and requires an explicit destination", () => {
    const f = fixture({ start: { row: 5, column: 3 }, end: { row: 5, column: 3 } });
    setCellContent(f.sheet, { row: 5, column: 3 }, { kind: "literal", value: 0 });
    f.actions.open();
    const draft = f.actions.draft.value!;

    expect(draft.source).toMatch(/!\$D\$6$/);
    expect(draft.destination).toBe("");
    expect(f.actions.dialog.value?.editing).toBe(false);
    f.actions.confirm(draft);
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.draft.value).toBe(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("keeps a selected data range until the missing destination is supplied", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 1, column: 2 }, { kind: "literal", value: 18 });
    f.actions.open();
    const draft = f.actions.draft.value!;
    f.actions.confirm(draft);

    expect(f.actions.error.value).toBe(true);
    expect(f.actions.draft.value).toBe(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    f.actions.confirm({ ...draft, destination: "D1:D2" });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.draft.value).toBeUndefined();
    for (let row = 0; row < 2; row++)
      expect(getCellSparkline(f.sheet, { row, column: 3 })?.source).toEqual({
        start: { row, column: 0 },
        end: { row, column: 2 },
      });
  });

  test("requires an explicit source before creating a sparkline", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, destination: "D1:D2" });

    expect(f.actions.error.value).toBe(true);
    expect(f.actions.draft.value?.source).toBe("");
    expect(f.actions.dialog.value?.editing).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("creates one sparkline per source row in one undoable command", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "A1:C2", destination: "D1:D2" });
    expect(f.execute).toHaveBeenCalledTimes(1);
    for (let row = 0; row < 2; row++)
      expect(getCellSparkline(f.sheet, { row, column: 3 })?.source).toEqual({
        start: { row, column: 0 },
        end: { row, column: 2 },
      });
    expect(f.actions.draft.value).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.sheet, { row: 0, column: 3 })).toBeUndefined();
    expect(getCellSparkline(f.sheet, { row: 1, column: 3 })).toBeUndefined();
  });

  test("creates one sparkline per source column for a horizontal destination", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "A1:C2", destination: "A4:C4" });
    for (let column = 0; column < 3; column++)
      expect(getCellSparkline(f.sheet, { row: 3, column })?.source).toEqual({
        start: { row: 0, column },
        end: { row: 1, column },
      });
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test.each(["D1:D3", "D1:E2", "D1"])("rejects incompatible destination %s", (destination) => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "A1:C2", destination });
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.draft.value).toBeDefined();
  });

  test.each(["switchSheet", "replaceWorkbook", "setBusy"] as const)(
    "rejects a draft after %s",
    (change) => {
      const f = fixture();
      f.actions.open();
      const draft = { ...f.actions.draft.value!, source: "A1:C2", destination: "D1:D2" };
      f[change]();
      f.actions.confirm(draft);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("rechecks sheet permissions when a draft is confirmed", () => {
    const f = fixture();
    f.actions.open();
    const draft = { ...f.actions.draft.value!, source: "A1:C2", destination: "D1:D2" };
    f.sheet.properties.protected = true;
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("does not open when editing cannot be flushed", () => {
    const f = fixture();
    f.flush.mockReturnValue(false);
    f.actions.open();
    expect(f.actions.draft.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
