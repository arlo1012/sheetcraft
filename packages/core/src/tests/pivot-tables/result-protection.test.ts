import { describe, expect, test } from "vitest";
import {
  createApplyCellStyleCommand,
  createAdvancedFilterCommand,
  createSplitColumnCommand,
  createSetCellHyperlinkCommand,
  createSetFloatingImageCommand,
  createConvertFloatingImageToCellCommand,
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  createPasteCellContentsCommand,
  createSetCellContentCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import {
  createRemovePivotTableCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { getCellStyle, getCellValue, setCellContent } from "../../workbook.js";
import type { CellContent } from "../../formula/types.js";
import { fixture } from "./fixture.js";
import { getPivotTableRange } from "../../pivot-tables.js";
import { createRestoreCellStylesCommand } from "../../commands/formatting.js";

const resultCell = { row: 3, column: 3 };
const ordinaryCell = { row: 3, column: 1 };
function installed() {
  const f = fixture();
  executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
  setCellContent(f.destination, ordinaryCell, { kind: "literal", value: "Keep" });
  return f;
}
function expectAtomicRejection(f: ReturnType<typeof installed>, command: WorkbookCommand) {
  const before = serializeWorkbook(f.workbook);
  const undoCount = f.session.history.undoStack.length;
  const redoCount = f.session.history.redoStack.length;
  expect(() => executeWorkbookCommand(f.session, command)).toThrow(
    expect.objectContaining({
      data: {
        code: "pivot_result_protected",
        details: { sheetId: f.destination.id, pivotTableId: f.table.id },
      },
    }),
  );
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(undoCount);
  expect(f.session.history.redoStack).toHaveLength(redoCount);
}

describe("pivot result protection", () => {
  test("style restore cannot overwrite pivot result data and remains atomic", () => {
    const f = installed(),
      before = serializeWorkbook(f.workbook);
    const undoCount = f.session.history.undoStack.length;
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createRestoreCellStylesCommand(f.destination.id, [
          {
            address: ordinaryCell,
            style: { fontSize: 20 },
            content: { kind: "literal", value: "Keep" },
          },
          { address: resultCell, style: null, content: { kind: "literal", value: 999 } },
        ]),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(undoCount);
  });

  const blockedContents: Array<CellContent | null> = [
    { kind: "literal", value: 999 },
    { kind: "formula", formula: { source: "=1+2" } },
    null,
  ];
  test.each(blockedContents)("blocks direct result-cell content changes %#", (content) => {
    const f = installed();
    expect(getCellValue(f.destination, resultCell)).toBe(30);
    expectAtomicRejection(f, createSetCellContentCommand(f.destination.id, resultCell, content));
  });

  test("blocks pasting across ordinary and result cells before changing any content", () => {
    const f = installed();
    expectAtomicRejection(
      f,
      createPasteCellContentsCommand(f.destination.id, ordinaryCell, [
        [
          { kind: "literal", value: "Replace" },
          { kind: "literal", value: "Overwrite label" },
          { kind: "literal", value: 999 },
        ],
      ]),
    );
  });

  test("blocks advanced-filter copy into result cells even with overwrite enabled", () => {
    const f = installed();
    expectAtomicRejection(
      f,
      createAdvancedFilterCommand(f.source.id, f.table.source!, {
        mode: "copy",
        destination: { sheetId: f.destination.id, address: { row: 2, column: 1 } },
        uniqueOnly: false,
        overwrite: true,
      }),
    );
  });

  test("blocks split-column results overlapping the report and preserves the ordinary source", () => {
    const f = installed();
    setCellContent(f.destination, ordinaryCell, { kind: "literal", value: "left,right" });
    expectAtomicRejection(
      f,
      createSplitColumnCommand(
        f.destination.id,
        ordinaryCell.column,
        {
          start: ordinaryCell,
          end: ordinaryCell,
        },
        {
          destinationColumn: ordinaryCell.column,
          mode: "delimiter",
          delimiter: ",",
          overwrite: true,
        },
      ),
    );
  });

  test("blocks hyperlink display-text replacement without changing result data or link metadata", () => {
    const f = installed();
    expectAtomicRejection(
      f,
      createSetCellHyperlinkCommand(
        f.destination.id,
        resultCell,
        {
          target: "https://example.com/report",
        },
        "Replacement label",
      ),
    );
  });

  test("blocks converting an overlaid floating image into a result cell without removing the image", () => {
    const f = installed();
    executeWorkbookCommand(
      f.session,
      createSetFloatingImageCommand(f.destination.id, {
        id: "pivot-overlay",
        assetId: "asset-overlay",
        altText: "Overlay",
        anchor: resultCell,
        offsetX: 0,
        offsetY: 0,
        width: 100,
        height: 60,
      }),
    );
    expectAtomicRejection(
      f,
      createConvertFloatingImageToCellCommand(f.destination.id, "pivot-overlay"),
    );
  });

  test("blocks batch fill across sheets atomically, including otherwise valid source edits", () => {
    const f = installed();
    expectAtomicRejection(
      f,
      createBatchSetCellContentsCommand([
        {
          sheetId: f.source.id,
          address: { row: 1, column: 2 },
          content: { kind: "literal", value: 100 },
        },
        {
          sheetId: f.destination.id,
          address: ordinaryCell,
          content: { kind: "literal", value: "Replace" },
        },
        {
          sheetId: f.destination.id,
          address: resultCell,
          content: { kind: "literal", value: 999 },
        },
        {
          sheetId: f.destination.id,
          address: { row: 4, column: 3 },
          content: { kind: "literal", value: 998 },
        },
      ]),
    );
  });

  test.each(["mixed", "whole report"] as const)(
    "blocks clearing a %s range without erasing cells or metadata",
    (kind) => {
      const f = installed();
      const range =
        kind === "mixed"
          ? { start: { row: 2, column: 1 }, end: resultCell }
          : f.destination.pivotTables![0]!.outputRange!;
      expectAtomicRejection(f, createClearCellRangeCommand(f.destination.id, range));
    },
  );

  test("protects reserved cells of a report before any fields are configured", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        rowFields: [],
        columnFields: [],
        values: [],
      }),
    );
    const output = getPivotTableRange(f.destination.pivotTables![0]!);
    expectAtomicRejection(
      f,
      createSetCellContentCommand(f.destination.id, output.start, { kind: "literal", value: 1 }),
    );
  });

  test("allows ordinary typing, paste, batch fill and clear outside the report", () => {
    const f = installed();
    const pivotBefore = structuredClone(f.destination.pivotTables);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetCellContentCommand(f.destination.id, ordinaryCell, { kind: "literal", value: 1 }),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createPasteCellContentsCommand(f.destination.id, { row: 0, column: 0 }, [
          [{ kind: "literal", value: 2 }],
        ]),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createBatchSetCellContentsCommand([
          {
            sheetId: f.destination.id,
            address: { row: 0, column: 1 },
            content: { kind: "literal", value: 3 },
          },
        ]),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createClearCellRangeCommand(f.destination.id, { start: ordinaryCell, end: ordinaryCell }),
      ),
    ).toBe(true);
    expect(getCellValue(f.destination, ordinaryCell)).toBeNull();
    expect(getCellValue(f.destination, { row: 0, column: 0 })).toBe(2);
    expect(getCellValue(f.destination, { row: 0, column: 1 })).toBe(3);
    expect(getCellValue(f.destination, resultCell)).toBe(30);
    expect(f.destination.pivotTables).toEqual(pivotBefore);
  });

  test("allows formatting result cells and restores styles and metadata through history", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    const pivots = structuredClone(f.destination.pivotTables);
    expect(
      executeWorkbookCommand(
        f.session,
        createApplyCellStyleCommand(
          f.destination.id,
          {
            start: resultCell,
            end: { row: 4, column: 4 },
          },
          { fillColor: "#e4f4ec", numberFormat: { kind: "number", fractionDigits: 2 } },
        ),
      ),
    ).toBe(true);
    expect(getCellStyle(f.destination, resultCell)).toMatchObject({
      fillColor: "#e4f4ec",
      numberFormat: { kind: "number", fractionDigits: 2 },
    });
    expect(getCellValue(f.destination, resultCell)).toBe(30);
    expect(f.destination.pivotTables).toEqual(pivots);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("allows source edits and explicit refresh, and restores both with undo and redo", () => {
    const f = installed();
    const before = serializeWorkbook(f.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetCellContentCommand(
          f.source.id,
          { row: 1, column: 2 },
          { kind: "literal", value: 100 },
        ),
      ),
    ).toBe(true);
    expect(getCellValue(f.destination, resultCell)).toBe(30);
    const sourceEdited = serializeWorkbook(f.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, f.destination.pivotTables![0]!),
      ),
    ).toBe(true);
    expect(getCellValue(f.destination, resultCell)).toBe(120);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(sourceEdited);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test.each([false, true])(
    "allows removing a report with clearOutput=%s and restores protection on undo",
    (clearOutput) => {
      const f = installed();
      const before = serializeWorkbook(f.workbook);
      expect(
        executeWorkbookCommand(
          f.session,
          createRemovePivotTableCommand(f.destination.id, f.table.id, clearOutput),
        ),
      ).toBe(true);
      expect(f.destination.pivotTables).toEqual([]);
      expect(getCellValue(f.destination, resultCell)).toBe(clearOutput ? null : 30);
      expect(
        executeWorkbookCommand(
          f.session,
          createSetCellContentCommand(f.destination.id, resultCell, {
            kind: "literal",
            value: 999,
          }),
        ),
      ).toBe(true);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expectAtomicRejection(
        f,
        createSetCellContentCommand(f.destination.id, resultCell, { kind: "literal", value: 999 }),
      );
    },
  );
});
