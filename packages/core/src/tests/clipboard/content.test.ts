import { describe, expect, test } from "vitest";
import {
  getCellRangeContents,
  getCellRangeValues,
  tileCellMatrix,
  translateCellContentMatrixForCopy,
} from "../../clipboard.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("content clipboard", () => {
  test("copies raw formulas with per-cell relative translation and preserves mixed references", () => {
    const source = [[{ kind: "formula" as const, formula: { source: "=A1+$B1+C$1+$D$1" } }]];
    expect(
      translateCellContentMatrixForCopy(source, { row: 0, column: 0 }, { row: 2, column: 3 }),
    ).toEqual([[{ kind: "formula", formula: { source: "=D3+$B3+F$1+$D$1" } }]]);
  });

  test("tiles raw copy contents while cut callers retain the unmodified matrix", () => {
    const raw = [
      [
        { kind: "formula" as const, formula: { source: "=A1" } },
        { kind: "literal" as const, value: "keep" },
      ],
    ];
    const tiled = tileCellMatrix(raw, { rowCount: 2, columnCount: 4 });
    expect(tiled[1]?.[2]).toEqual({ kind: "formula", formula: { source: "=A1" } });
    expect(raw[0]?.[0]).toEqual({ kind: "formula", formula: { source: "=A1" } });
  });

  test("projects formula errors as values-only display tokens", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
    expect(
      getCellRangeContents(sheet, { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }),
    ).toEqual([[{ kind: "formula", formula: { source: "=1/0" } }]]);
    expect(
      getCellRangeValues(sheet, { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }),
    ).toEqual([["#DIV/0!"]]);
  });

  test("projects cross-sheet formula results with a workbook evaluator", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const inputs = createSheet("Inputs", "inputs");
    workbook.sheets.set(inputs.id, inputs);
    setCellContent(inputs, { row: 0, column: 0 }, { kind: "literal", value: 42 });
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );

    expect(
      getCellRangeValues(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        createWorkbookEvaluator(workbook, sheet.id),
      ),
    ).toEqual([[42]]);
  });
});
