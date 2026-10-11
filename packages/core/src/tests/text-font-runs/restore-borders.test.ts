import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { createRestoreCellStylesCommand } from "../../commands/formatting.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { serializeWorkbook } from "../../serialization.js";
import type { CellBorderSide } from "../../commands/borders.js";

const address = { row: 1, column: 1 },
  neighbor = { row: 1, column: 2 };
const red = { style: "thin" as const, color: "#ff0000" },
  blue = { style: "thick" as const, color: "#0000ff" };
const rich = {
  kind: "literal" as const,
  value: "Ω",
  fontRuns: [{ start: 0, end: 1, fontFamily: "Symbol" }],
};
function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  setCellContent(sheet, address, rich);
  setCellContent(sheet, neighbor, rich);
  setCellStyle(sheet, address, { borderRight: red });
  setCellStyle(sheet, neighbor, { borderLeft: blue, borderRight: red, fontSize: 20 });
  return { session, sheet };
}
describe("font-run style restore border reconciliation", () => {
  test.each([
    {
      name: "width",
      end: { row: 1, column: 2 },
      outside: { row: 1, column: 3 },
      side: "borderRight" as CellBorderSide,
      opposite: "borderLeft" as CellBorderSide,
    },
    {
      name: "height",
      end: { row: 2, column: 1 },
      outside: { row: 3, column: 1 },
      side: "borderBottom" as CellBorderSide,
      opposite: "borderTop" as CellBorderSide,
    },
  ])(
    "merged target $name clears the physical perimeter and restores exact history",
    ({ end, outside, side, opposite }) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.mergedCells = [{ start: address, end }];
      setCellContent(sheet, address, rich);
      setCellStyle(sheet, address, { [side]: red });
      setCellContent(sheet, outside, rich);
      setCellStyle(sheet, outside, { [opposite]: blue, fontSize: 20 });
      const before = serializeWorkbook(session.workbook);
      executeWorkbookCommand(
        session,
        createRestoreCellStylesCommand(
          sheet.id,
          [{ address, style: null, content: { kind: "literal", value: "Ω" } }],
          { reconcileBorders: true },
        ),
      );
      expect(getCellStyle(sheet, outside)).toEqual({ fontSize: 20 });
      expect(getCellContent(sheet, outside)).toEqual(rich);
      const after = serializeWorkbook(session.workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );
  test("clear-format requests clear a mirrored edge and preserve exact asymmetric history", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    executeWorkbookCommand(
      f.session,
      createRestoreCellStylesCommand(
        f.sheet.id,
        [{ address, style: null, content: { kind: "literal", value: "Ω" } }],
        { reconcileBorders: true },
      ),
    );
    expect(getCellStyle(f.sheet, address)).toBeUndefined();
    expect(getCellStyle(f.sheet, neighbor)).toEqual({ borderRight: red, fontSize: 20 });
    expect(getCellContent(f.sheet, neighbor)).toEqual(rich);
    expect(f.session.history.undoStack[0]?.command).not.toHaveProperty("reconcileBorders");
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("rectangular merged targets reconcile every neighbor along all four edges", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.mergedCells = [{ start: address, end: { row: 2, column: 2 } }];
    setCellContent(sheet, address, rich);
    setCellStyle(sheet, address, {
      borderTop: red,
      borderBottom: red,
      borderLeft: red,
      borderRight: red,
    });
    const neighbors = [
      { address: { row: 0, column: 1 }, side: "borderBottom" },
      { address: { row: 0, column: 2 }, side: "borderBottom" },
      { address: { row: 3, column: 1 }, side: "borderTop" },
      { address: { row: 3, column: 2 }, side: "borderTop" },
      { address: { row: 1, column: 0 }, side: "borderRight" },
      { address: { row: 2, column: 0 }, side: "borderRight" },
      { address: { row: 1, column: 3 }, side: "borderLeft" },
      { address: { row: 2, column: 3 }, side: "borderLeft" },
    ];
    for (const neighbor of neighbors) {
      setCellStyle(sheet, neighbor.address, { [neighbor.side]: blue, fontSize: 20 });
      setCellContent(sheet, neighbor.address, rich);
    }
    const before = serializeWorkbook(session.workbook);
    executeWorkbookCommand(
      session,
      createRestoreCellStylesCommand(
        sheet.id,
        [{ address, style: null, content: { kind: "literal", value: "Ω" } }],
        { reconcileBorders: true },
      ),
    );
    for (const neighbor of neighbors) {
      expect(getCellStyle(sheet, neighbor.address)).toEqual({ fontSize: 20 });
      expect(getCellContent(sheet, neighbor.address)).toEqual(rich);
    }
    const after = serializeWorkbook(session.workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
  test("ordinary exact style restoration does not reconcile neighboring borders", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createRestoreCellStylesCommand(f.sheet.id, [{ address, style: null }]),
    );
    expect(getCellStyle(f.sheet, neighbor)?.borderLeft).toEqual(blue);
  });
  test("invalid semantic payload rejects before either target or mirrored neighbor changes", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createRestoreCellStylesCommand(
          f.sheet.id,
          [
            { address, style: null, content: { kind: "literal", value: "Ω" } },
            {
              address: { row: 2, column: 1 },
              style: null,
              content: { kind: "literal", value: "Smuggled" },
            },
          ],
          { reconcileBorders: true },
        ),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("neighbor cleanup resolves a merged tail to its anchor", () => {
    const f = fixture(),
      mergedStart = { row: 1, column: 3 },
      mergedTail = { row: 1, column: 4 };
    f.sheet.mergedCells = [{ start: mergedStart, end: mergedTail }];
    setCellStyle(f.sheet, mergedStart, { borderRight: blue, fontSize: 18 });
    const target = { row: 1, column: 5 };
    setCellContent(f.sheet, target, rich);
    executeWorkbookCommand(
      f.session,
      createRestoreCellStylesCommand(
        f.sheet.id,
        [{ address: target, style: null, content: { kind: "literal", value: "Ω" } }],
        { reconcileBorders: true },
      ),
    );
    expect(getCellStyle(f.sheet, mergedStart)).toEqual({ fontSize: 18 });
    undoWorkbookCommand(f.session);
    expect(getCellStyle(f.sheet, mergedStart)).toEqual({ borderRight: blue, fontSize: 18 });
  });
});
