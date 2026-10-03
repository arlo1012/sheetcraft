import { describe, expect, test } from "vitest";
import {
  createMultiKeySortSheetRangeCommand,
  createSortSheetRangeCommand,
  createSortCellColorResolver,
  getSortCellColor,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  setSheetMetadata,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet range sorting", () => {
  test("rejects sorting across an active advanced filter range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        columns: [],
        advanced: { uniqueOnly: false, hiddenRows: [{ start: 1, end: 1 }] },
      },
      mergedCells: [],
    });
    expect(() =>
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
          0,
        ),
      ),
    ).toThrow("advanced filter");
  });

  test("keeps a header fixed and resolves equal primary keys by a second key", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, values] of [
      [0, ["Name", "Score"]],
      [1, ["B", 1]],
      [2, ["A", 1]],
      [3, ["C", 2]],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: values[0] });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: values[1] });
    }
    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
          [
            { column: 1, direction: "ascending" },
            { column: 0, direction: "ascending" },
          ],
          { hasHeader: true },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Name",
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: "A" });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "B" });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({ kind: "literal", value: "C" });
  });

  test("sorts text without case sensitivity in both directions while keeping equal values stable", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["a", "B", "A", "b"].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    }

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          [{ column: 0, direction: "ascending" }],
          { caseSensitive: false },
        ),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "a" },
      { kind: "literal", value: "A" },
      { kind: "literal", value: "B" },
      { kind: "literal", value: "b" },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          [{ column: 0, direction: "descending" }],
          { caseSensitive: false },
        ),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "B" },
      { kind: "literal", value: "b" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "A" },
    ]);
  });

  test("preserves case-sensitive ordering when requested explicitly", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "A" });

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        [{ column: 0, direction: "ascending" }],
        { caseSensitive: true },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: "A" });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: "a" });
  });

  test("uses the next sort key after case-insensitive text ties", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [name, score]] of (
      [
        ["a", 2],
        ["A", 1],
        ["a", 1],
        ["B", 1],
      ] as const
    ).entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: name });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: score });
    }

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
        [
          { column: 0, direction: "ascending" },
          { column: 1, direction: "ascending" },
        ],
        { caseSensitive: false },
      ),
    );
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "A" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "a" },
      { kind: "literal", value: "B" },
    ]);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({ kind: "literal", value: 1 });
  });

  test("orders computed keys deterministically by type and keeps blanks last in descending order", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "a" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: false });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
    setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: 2 });

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 5, column: 0 } },
          0,
          "descending",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 2 });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "a" });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({ kind: "literal", value: false });
    expect(getCellContent(sheet, { row: 4, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=1/0" },
    });
    expect(getCellContent(sheet, { row: 5, column: 0 })).toBeNull();
  });

  test("moves raw styles and formulas by row delta without rewriting external formulas", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1" } });
    setCellStyle(sheet, { row: 0, column: 1 }, { bold: true });
    setCellContent(sheet, { row: 5, column: 2 }, { kind: "formula", formula: { source: "=A1" } });
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A2" },
    });
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({ bold: true });
    expect(getCellContent(sheet, { row: 5, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A1" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("sorts by cross-sheet formula results", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const inputs = createSheet("Inputs", "inputs");
    session.workbook.sheets.set(inputs.id, inputs);
    setCellContent(inputs, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(inputs, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );
    setCellContent(
      sheet,
      { row: 1, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A2" },
      },
    );
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "two" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "one" });

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "one",
    });
  });

  test("keeps the sort inverse compact when the sheet has unrelated sparse cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 10; row < 1_010; row += 1) {
      setCellContent(sheet, { row, column: 20 }, { kind: "literal", value: row });
    }
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          0,
        ),
      ),
    ).toBe(true);

    const inverse = session.history.undoStack.at(-1)?.command;
    expect(inverse?.type).toBe("setCellContents");
    if (inverse?.type !== "setCellContents") throw new Error("Expected a cell-range inverse.");
    expect(inverse.changes.length).toBeLessThan(10);
    expect(
      inverse.changes.every((change) => change.address.row <= 2 && change.address.column <= 1),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("allows only the complete data rectangle for an intersecting active filter", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 1 });
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
      },
      mergedCells: [],
    });
    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 1, column: 0 }, end: { row: 2, column: 1 } },
          0,
        ),
      ),
    ).toBe(true);
    const beforeRejected = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 1, column: 0 }, end: { row: 1, column: 1 } },
          0,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeRejected);
  });

  test("rejects merged intersections, malformed commands, and identity sorting without history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    expect(
      executeWorkbookCommand(
        session,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          0,
        ),
      ),
    ).toBe(false);
    sheet.mergedCells = [{ start: { row: 3, column: 0 }, end: { row: 4, column: 0 } }];
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSortSheetRangeCommand(
          sheet.id,
          { start: { row: 3, column: 0 }, end: { row: 4, column: 0 } },
          0,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        type: "sortSheetRange",
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        keyColumn: 2,
        direction: "sideways",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    const beforeInvalidCaseSensitive = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        type: "sortSheetRange",
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        keyColumn: 0,
        direction: "ascending",
        caseSensitive: "no",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(beforeInvalidCaseSensitive);
  });

  test("sorts a selected solid fill to the top or bottom and preserves row styles through undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [value, fill]] of [
      [0, ["first", "#00FF00"]],
      [1, ["selected", "#ff0000"]],
      [2, ["third", null]],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
      if (fill) setCellStyle(sheet, { row, column: 0 }, { fillColor: fill, bold: true });
    }
    const before = createSheetSparseState(sheet);
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } };

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(sheet.id, range, [
          { column: 0, direction: "ascending", sortOn: "cellColor", color: "#FF0000" },
        ]),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "selected",
    });
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      fillColor: "#ff0000",
      bold: true,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(sheet.id, range, [
          { column: 0, direction: "descending", sortOn: "cellColor", color: "#ff0000" },
        ]),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
      kind: "literal",
      value: "selected",
    });
    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(sheet.id, range, [
          { column: 0, direction: "ascending", sortOn: "cellColor", color: null },
        ]),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "third",
    });
  });

  test("uses selected color groups as a stable multi-key sort and exposes solid sort colors", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [label, score, fill]] of [
      [0, ["green-2", 2, "#00ff00"]],
      [1, ["red-2", 2, "#FF0000"]],
      [2, ["red-1", 1, "#ff0000"]],
      [3, ["none-1", 1, null]],
    ] as const) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: label });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: score });
      if (fill) setCellStyle(sheet, { row, column: 0 }, { fillColor: fill });
    }
    setCellStyle(
      sheet,
      { row: 3, column: 1 },
      {
        fillGradient: {
          type: "linear",
          angle: 0,
          stops: [
            { position: 0, color: "#ffffff" },
            { position: 1, color: "#000000" },
          ],
        },
      },
    );
    expect(getSortCellColor(sheet, { row: 0, column: 0 }, "cellColor")).toBe("#00ff00");
    expect(getSortCellColor(sheet, { row: 3, column: 0 }, "cellColor")).toBeNull();
    expect(getSortCellColor(sheet, { row: 3, column: 1 }, "cellColor")).toBeUndefined();
    expect(getSortCellColor(sheet, { row: 0, column: 0 }, "fontColor")).toBe("#20242c");
    setCellStyle(sheet, { row: 0, column: 1 }, { textColor: "#AbCdEf" });
    expect(getSortCellColor(sheet, { row: 0, column: 1 }, "fontColor")).toBe("#abcdef");

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
        [
          { column: 0, direction: "ascending", sortOn: "cellColor", color: "#FF0000" },
          { column: 0, direction: "ascending", sortOn: "cellColor", color: "#00FF00" },
          { column: 1, direction: "ascending" },
        ],
      ),
    );
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "red-1" },
      { kind: "literal", value: "red-2" },
      { kind: "literal", value: "green-2" },
      { kind: "literal", value: "none-1" },
    ]);
  });

  test("resolves table, direct, and conditional-format colors for discovery and sorting", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } };
    sheet.tables = [
      {
        id: "table",
        name: "Sales",
        range,
        columns: [
          { id: "value", name: "Value" },
          { id: "label", name: "Label" },
        ],
        style: {
          id: "green",
          name: "Green",
          category: "custom",
          elements: { wholeTable: { style: { fillColor: "#00aa00" } } },
        },
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: false,
        bandedColumns: false,
        filterButton: false,
        filter: null,
      },
    ];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Value" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "first" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "second" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#0000ff" });
    sheet.conditionalFormats = [
      {
        id: "high",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 1 },
        style: { fillColor: "#ff0000" },
      },
    ];
    const resolveColor = createSortCellColorResolver(
      sheet,
      createWorkbookEvaluator(session.workbook, sheet.id),
      { dateSystem: session.workbook.dateSystem },
    );
    expect(resolveColor({ row: 1, column: 0 }, "cellColor")).toBe("#0000ff");
    expect(resolveColor({ row: 1, column: 1 }, "cellColor")).toBe("#00aa00");
    expect(resolveColor({ row: 2, column: 0 }, "cellColor")).toBe("#ff0000");

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        range,
        [{ column: 0, direction: "ascending", sortOn: "cellColor", color: "#ff0000" }],
        { hasHeader: true },
      ),
    );
    expect(getCellContent(sheet, { row: 1, column: 1 })).toMatchObject({ value: "second" });
  });

  test("sorts automatic and explicit font colors by the selected normalized color", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, label] of ["automatic", "purple", "explicit-default"].entries()) {
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: label });
    }
    setCellStyle(sheet, { row: 1, column: 0 }, { textColor: "#A020F0" });
    setCellStyle(sheet, { row: 2, column: 0 }, { textColor: "#20242C" });

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        [{ column: 0, direction: "ascending", sortOn: "fontColor", color: "#20242c" }],
      ),
    );
    expect([0, 1, 2].map((row) => getCellContent(sheet, { row, column: 1 }))).toEqual([
      { kind: "literal", value: "automatic" },
      { kind: "literal", value: "explicit-default" },
      { kind: "literal", value: "purple" },
    ]);
  });

  test("rejects invalid color keys without changing the sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    const before = createSheetSparseState(sheet);
    const command = {
      type: "sortSheetRange" as const,
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      keyColumn: 0,
      direction: "ascending" as const,
      sortKeys: [
        { column: 0, direction: "ascending" as const, sortOn: "fontColor" as const, color: null },
      ],
    };
    expect(tryApplyWorkbookCommand(session.workbook, command)).toMatchObject({
      ok: false,
      error: { code: "invalid_command_payload" },
    });
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        ...command,
        sortKeys: [{ column: 0, direction: "ascending", sortOn: "cellColor", color: "#fff" }],
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("sorts listed values in custom order while keeping unlisted values after them", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["Zulu", "Medium", "Low", "Alpha", "High"].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    }
    const before = createSheetSparseState(sheet);
    const range = { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } };

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(sheet.id, range, [
          {
            column: 0,
            direction: "ascending",
            customOrder: ["High", "Medium", "Low"],
          },
        ]),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3, 4].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "High" },
      { kind: "literal", value: "Medium" },
      { kind: "literal", value: "Low" },
      { kind: "literal", value: "Alpha" },
      { kind: "literal", value: "Zulu" },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(sheet.id, range, [
          {
            column: 0,
            direction: "descending",
            customOrder: ["High", "Medium", "Low"],
          },
        ]),
      ),
    ).toBe(true);
    expect([0, 1, 2, 3, 4].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: "Low" },
      { kind: "literal", value: "Medium" },
      { kind: "literal", value: "High" },
      { kind: "literal", value: "Zulu" },
      { kind: "literal", value: "Alpha" },
    ]);
  });

  test("matches primitive custom values and applies the command case-sensitivity option", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["alpha", 2, true, "ALPHA"].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    }
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } };

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        range,
        [{ column: 0, direction: "ascending", customOrder: ["true", "2", "ALPHA", "alpha"] }],
        { caseSensitive: false },
      ),
    );
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: true },
      { kind: "literal", value: 2 },
      { kind: "literal", value: "alpha" },
      { kind: "literal", value: "ALPHA" },
    ]);

    expect(undoWorkbookCommand(session)).toBe(true);
    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(sheet.id, range, [
        { column: 0, direction: "ascending", customOrder: ["true", "2", "ALPHA", "alpha"] },
      ]),
    );
    expect([0, 1, 2, 3].map((row) => getCellContent(sheet, { row, column: 0 }))).toEqual([
      { kind: "literal", value: true },
      { kind: "literal", value: 2 },
      { kind: "literal", value: "ALPHA" },
      { kind: "literal", value: "alpha" },
    ]);
  });

  test("uses subsequent sort keys for equal custom ranks and remains stable for complete ties", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [priority, label, id]] of [
      ["Later", "later-2", "later"],
      ["Soon", "soon-2", "soon-2"],
      ["Soon", "soon-1", "soon-1"],
      ["Other", "other", "other-first"],
      ["Other", "other", "other-second"],
    ].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: priority! });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: label! });
      setCellContent(sheet, { row, column: 2 }, { kind: "literal", value: id! });
    }

    executeWorkbookCommand(
      session,
      createMultiKeySortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
        [
          { column: 0, direction: "ascending", customOrder: ["Soon", "Later"] },
          { column: 1, direction: "ascending" },
        ],
      ),
    );
    expect([0, 1, 2, 3, 4].map((row) => getCellContent(sheet, { row, column: 2 }))).toEqual([
      { kind: "literal", value: "soon-1" },
      { kind: "literal", value: "soon-2" },
      { kind: "literal", value: "later" },
      { kind: "literal", value: "other-first" },
      { kind: "literal", value: "other-second" },
    ]);
  });

  test("clones custom order arrays in the multi-key factory", () => {
    const customOrder = ["High", "Low"];
    const command = createMultiKeySortSheetRangeCommand(
      "sheet",
      { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      [{ column: 0, direction: "ascending", customOrder }],
    );
    customOrder[0] = "Changed";
    expect(command.sortKeys?.[0]?.customOrder).toEqual(["High", "Low"]);
  });

  test("rejects invalid custom orders and custom orders on color sorts without changing the sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    const before = createSheetSparseState(sheet);
    const command = {
      type: "sortSheetRange" as const,
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      keyColumn: 0,
      direction: "ascending" as const,
    };
    for (const customOrder of [[], ["  "], [1]] as unknown[]) {
      expect(
        tryApplyWorkbookCommand(session.workbook, {
          ...command,
          sortKeys: [{ column: 0, direction: "ascending", customOrder }],
        } as never),
      ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    }
    expect(
      tryApplyWorkbookCommand(session.workbook, {
        ...command,
        sortKeys: [
          {
            column: 0,
            direction: "ascending",
            sortOn: "cellColor",
            color: "#ff0000",
            customOrder: ["red"],
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(before);
  });
});
