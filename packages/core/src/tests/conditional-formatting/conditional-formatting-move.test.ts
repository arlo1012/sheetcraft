import { describe, expect, test } from "vitest";
import type { CellAddress, CellRange } from "../../workbook.js";
import {
  assertConditionalFormatCrossSheetMoveSupported,
  createConditionalFormatMoveReferenceTransform,
  moveConditionalFormatRules,
} from "../../conditional-formatting-move.js";
import { type SheetConditionalFormatRule } from "../../conditional-formatting.js";
import { createSheet, getActiveSheet } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

const cell = (row: number, column: number): CellAddress => ({ row, column });
const range = (
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number,
): CellRange => ({
  start: cell(startRow, startColumn),
  end: cell(endRow, endColumn),
});
function rule(
  id: string,
  ranges: CellRange[],
  condition: SheetConditionalFormatRule["condition"] = { kind: "blank", blank: true },
): SheetConditionalFormatRule {
  return {
    id,
    ranges,
    anchor: { ...ranges[0]!.start },
    condition,
    style: { fillColor: "#abcdef" },
  };
}
function covers(rule: SheetConditionalFormatRule, address: CellAddress): boolean {
  return rule.ranges.some(
    (range) =>
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.column >= range.start.column &&
      address.column <= range.end.column,
  );
}

describe("moveConditionalFormatRules", () => {
  test("exports the reference transform used to update qualified formulas on other sheets", () => {
    const transform = createConditionalFormatMoveReferenceTransform(range(1, 2, 2, 3), cell(5, 7));
    expect(transform(cell(2, 3))).toEqual(cell(6, 8));
    expect(transform(cell(0, 0))).toEqual(cell(0, 0));
  });

  test("guards cross-sheet multi-cell formula conditions before a raw qualified rewrite", () => {
    const workbook = createTestWorkbook();
    const target = getActiveSheet(workbook);
    const other = createSheet("Other", "other");
    workbook.sheets.set(other.id, other);
    other.conditionalFormats = [
      rule("cross", [range(0, 0, 1, 0)], { kind: "formula", formula: `=${target.name}!A1>0` }),
    ];
    expect(() => assertConditionalFormatCrossSheetMoveSupported(workbook, target.id)).toThrow(
      "cannot safely rewrite",
    );
    other.conditionalFormats = [
      rule("single", [range(0, 0, 0, 0)], { kind: "formula", formula: `='${target.name}'!A1>0` }),
    ];
    expect(() => assertConditionalFormatCrossSheetMoveSupported(workbook, target.id)).not.toThrow();
  });

  test("cuts a partial non-formula scope and overwrites formats at the destination", () => {
    const moved = moveConditionalFormatRules(
      [rule("source", [range(0, 0, 2, 2)]), rule("destination", [range(4, 4, 5, 5)])],
      range(1, 1, 1, 1),
      cell(4, 4),
    );
    const source = moved.find((item) => item.id === "source")!;
    const movedSource = moved.find((item) => item.id.startsWith("source-move"))!;
    expect(covers(source, cell(1, 1))).toBe(false);
    expect(covers(source, cell(4, 4))).toBe(false);
    expect(movedSource.ranges).toEqual([range(4, 4, 4, 4)]);
    expect(moved.find((item) => item.id === "destination")?.ranges).toEqual([
      range(5, 4, 5, 5),
      range(4, 5, 4, 5),
    ]);
  });

  test("handles overlapping source and destination as one cut before adding moved scopes", () => {
    const moved = moveConditionalFormatRules(
      [rule("rule", [range(0, 0, 2, 1)])],
      range(0, 0, 1, 1),
      cell(1, 0),
    );
    expect(moved).toEqual([
      expect.objectContaining({ id: "rule", ranges: [range(1, 0, 2, 1)], anchor: cell(1, 0) }),
    ]);
  });

  test("reanchors formula scopes and transforms references during a full move and inverse move", () => {
    const original = [rule("formula", [range(0, 0, 1, 0)], { kind: "formula", formula: "=A1>0" })];
    const moved = moveConditionalFormatRules(original, range(0, 0, 1, 0), cell(0, 1));
    expect(moved).toEqual([
      expect.objectContaining({
        id: "formula",
        ranges: [range(0, 1, 1, 1)],
        anchor: cell(0, 1),
        condition: { kind: "formula", formula: "=B1>0" },
      }),
    ]);
    const restored = moveConditionalFormatRules(moved, range(0, 1, 1, 1), cell(0, 0));
    expect(restored).toEqual(original);
  });

  test("splits partial formula scopes and adjusts external formula references to moved cells", () => {
    const partial = moveConditionalFormatRules(
      [rule("partial", [range(0, 0, 1, 0)], { kind: "formula", formula: "=A1>0" })],
      range(0, 0, 0, 0),
      cell(0, 1),
    );
    expect(partial).toEqual([
      expect.objectContaining({
        id: "partial",
        ranges: [range(1, 0, 1, 0)],
        anchor: cell(1, 0),
        condition: { kind: "formula", formula: "=A2>0" },
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^partial-move-/),
        ranges: [range(0, 1, 0, 1)],
        anchor: cell(0, 1),
        condition: { kind: "formula", formula: "=B1>0" },
      }),
    ]);
    const external = moveConditionalFormatRules(
      [rule("outside", [range(0, 2, 0, 2)], { kind: "formula", formula: "=A1>0" })],
      range(0, 0, 0, 0),
      cell(0, 1),
    );
    expect(external).toEqual([
      expect.objectContaining({
        anchor: cell(0, 2),
        condition: { kind: "formula", formula: "=B1>0" },
      }),
    ]);
  });

  test("splits moved formula cells when only some relative references are inside the source", () => {
    const moved = moveConditionalFormatRules(
      [rule("edge", [range(0, 1, 1, 2)], { kind: "formula", formula: "=C1>0" })],
      range(0, 1, 1, 2),
      cell(0, 4),
    );
    expect(moved).toHaveLength(4);
    expect(
      moved.map((item) => ({
        anchor: item.anchor,
        formula: item.condition.kind === "formula" ? item.condition.formula : "",
      })),
    ).toEqual([
      { anchor: cell(0, 4), formula: "=F1>0" },
      { anchor: cell(0, 5), formula: "=D1>0" },
      { anchor: cell(1, 4), formula: "=F2>0" },
      { anchor: cell(1, 5), formula: "=D2>0" },
    ]);
  });
});
