import { strFromU8, unzipSync } from "fflate/browser";
import { type CellContent, type FormulaValue } from "@sheetcraft/core/formula";
import { applyWorkbookCommand, createCreateTableCommand } from "@sheetcraft/core/commands";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { createIterativeFormulaCache } from "../formula-cache.js";
import { encodeXlsx } from "../index.js";

function fixture(iterative = true, maxIterations = 50) {
  const workbook = createWorkbook({ id: "iteration", sheetId: "sheet", sheetName: "Iteration" });
  workbook.calculation = { ...workbook.calculation, iterative, maxIterations, maxChange: 0.0001 };
  return { workbook, sheet: getActiveSheet(workbook) };
}
function formula(sheet: Sheet, row: number, column: number, source: string) {
  setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });
}
function rawCell(bytes: Uint8Array, address: string, sheetNumber = 1) {
  const xml = strFromU8(unzipSync(bytes)[`xl/worksheets/sheet${sheetNumber}.xml`]!);
  const match = new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*>([\\s\\S]*?)<\\/c>`).exec(xml);
  expect(match, address).not.toBeNull();
  return { xml: match![0], cache: /<v>([\s\S]*?)<\/v>/.exec(match![1]!)?.[1] };
}

// These are residual-qualified snapshots of Core's actual memo, not exact
// solutions or evidence that Core stopped before its iteration cap.
describe("residual-qualified iterative formula caches", () => {
  test.each([
    [1, 0.99993896484375],
    [2, 1.99993896484375],
  ])(
    "exports the genuine +%i Core result without changing source or calculation policy",
    async (increment, expected) => {
      const { workbook, sheet } = fixture();
      formula(sheet, 2, 1, `=(B3+${increment})/2`);
      const before = JSON.stringify([...sheet.cells]);
      const evaluator = createWorkbookEvaluator(workbook, sheet.id);
      const cache = createIterativeFormulaCache(workbook, evaluator);
      expect(cache(sheet.id, 2, 1)).toBe(expected);
      expect(evaluator.getComputedValue({ row: 2, column: 1 })).toBe(expected);
      const rechecked = evaluator.evaluateFormula!(`=(B3+${increment})/2`, { row: 2, column: 1 });
      expect(rechecked).not.toBe(expected);
      expect(evaluator.getComputedValue({ row: 2, column: 1 })).toBe(expected);
      const encoded = await encodeXlsx(workbook);
      const cell = rawCell(encoded.bytes, "B3");
      expect(cell.cache).toBe(String(expected));
      expect(cell.xml).toContain(`<f>(B3+${increment})/2</f>`);
      expect(cell.xml).not.toContain("ca=");
      expect(encoded.report.issues).toEqual([]);
      const workbookXml = strFromU8(unzipSync(encoded.bytes)["xl/workbook.xml"]!);
      for (const attribute of [
        'fullCalcOnLoad="1"',
        'iterate="1"',
        'iterateCount="50"',
        'iterateDelta="0.0001"',
      ])
        expect(workbookXml).toContain(attribute);
      expect(JSON.stringify([...sheet.cells])).toBe(before);
      expect(workbook.calculation).toEqual({
        mode: "automatic",
        iterative: true,
        maxIterations: 50,
        maxChange: 0.0001,
      });
    },
  );

  test("prepares all independent cycles before capturing their consumers, independent of cell insertion order", async () => {
    for (const order of [
      [0, 2, 1],
      [1, 2, 0],
      [2, 0, 1],
    ]) {
      const { workbook, sheet } = fixture();
      const sources = ["=(A1+1)/2", "=(B1+2)/2", "=2*A1"];
      for (const column of order) formula(sheet, 0, column, sources[column]!);
      const evaluator = createWorkbookEvaluator(workbook, sheet.id);
      const cache = createIterativeFormulaCache(workbook, evaluator);
      const original = evaluator.getComputedValue({ row: 0, column: 0 }) as number;
      expect(cache(sheet.id, 0, 0)).toBe(original);
      expect(cache(sheet.id, 0, 2)).toBe(2 * original);
      expect(cache(sheet.id, 0, 1)).toBeTypeOf("number");
      const encoded = await encodeXlsx(workbook);
      expect(Number(rawCell(encoded.bytes, "C1").cache)).toBe(
        2 * Number(rawCell(encoded.bytes, "A1").cache),
      );
      expect(encoded.report.issues).toEqual([]);
    }
  });

  test("freezes a coherent snapshot even if a later unrelated Core read advances its memo", () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=(A1+1)/2");
    formula(sheet, 0, 2, "=2*A1");
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "error", error: { kind: "formula-error", code: "CYCLE" } },
    );
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const cache = createIterativeFormulaCache(workbook, evaluator);
    const captured = cache(sheet.id, 0, 0)!;
    evaluator.getComputedValue({ row: 0, column: 1 });
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).not.toBe(captured);
    expect(cache(sheet.id, 0, 0)).toBe(captured);
    expect(cache(sheet.id, 0, 2)).toBe(2 * captured);
  });

  test("rejects stale acyclic bridges and every dependent while retaining an independent qualified cycle", () => {
    const { workbook, sheet } = fixture();
    for (const [column, source] of [
      [0, "=(A1+1)/2"],
      [2, "=100*A1"],
      [1, "=(B1+C1)/2"],
      [3, "=(D1+C1)/2"],
    ] as const)
      formula(sheet, 0, column, source);
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const cache = createIterativeFormulaCache(workbook, evaluator);
    expect(cache(sheet.id, 0, 0)).toBeTypeOf("number");
    expect(cache(sheet.id, 0, 2)).toBeUndefined();
    expect(cache(sheet.id, 0, 1)).toBeUndefined();
    expect(cache(sheet.id, 0, 3)).toBeUndefined();
  });

  test("supports mutual, cross-sheet, named/range cycles and safe scalar consumers", async () => {
    const { workbook, sheet } = fixture();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    workbook.definedNames.set("total", {
      id: "total",
      name: "Total",
      reference: { sheetId: sheet.id, start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
    });
    formula(sheet, 0, 0, "=Data!A1");
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: 1 });
    formula(data, 0, 0, "=SUM(Total)/2");
    formula(data, 0, 2, "=2*A1");
    const encoded = await encodeXlsx(workbook);
    const first = Number(rawCell(encoded.bytes, "A1").cache);
    const second = Number(rawCell(encoded.bytes, "A1", 2).cache);
    expect(first).toBeGreaterThan(0.999);
    expect(second).toBeGreaterThan(0.999);
    expect(Number(rawCell(encoded.bytes, "C1", 2).cache)).toBe(2 * second);
    expect(encoded.report.issues).toEqual([]);
  });

  test("supports scalar structured-reference cycles", async () => {
    const { workbook, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Amount" });
    applyWorkbookCommand(
      workbook,
      createCreateTableCommand(sheet.id, {
        id: "loop-table",
        name: "LoopTable",
        range: { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
        columns: [{ id: "amount", name: "Amount" }],
        style: createBuiltinTableStyles()[0]!,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: null,
      }),
    );
    formula(sheet, 1, 1, "=(SUM(LoopTable[Amount])+1)/2");
    formula(sheet, 1, 2, "=2*B2");
    const encoded = await encodeXlsx(workbook);
    expect(rawCell(encoded.bytes, "B2").cache).toBe("0.99993896484375");
    expect(rawCell(encoded.bytes, "C2").cache).toBe("1.9998779296875");
    expect(encoded.report.issues).toEqual([]);
  });

  test("retains coherent safe bridges between exactly stable and approximate cycles", async () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=IF(A1=0,1,A1)");
    formula(sheet, 0, 2, "=2*A1");
    formula(sheet, 0, 1, "=(B1+C1)/2");
    formula(sheet, 0, 3, "=3*B1");
    const encoded = await encodeXlsx(workbook);
    expect(rawCell(encoded.bytes, "A1").cache).toBe("1");
    expect(rawCell(encoded.bytes, "C1").cache).toBe("2");
    expect(Number(rawCell(encoded.bytes, "D1").cache)).toBe(
      3 * Number(rawCell(encoded.bytes, "B1").cache),
    );
    expect(encoded.report.issues).toEqual([]);
  });

  test("allows error-free scalar string and boolean inputs but only numeric cycle-dependent outputs", () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=(A1+LEN(B1)+IF(C1,1,0))/2");
    formula(sheet, 0, 1, '="x"');
    formula(sheet, 0, 2, "=TRUE");
    formula(sheet, 0, 3, '=IF(A1>0,"result","other")');
    const cache = createIterativeFormulaCache(
      workbook,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    expect(cache(sheet.id, 0, 0)).toBe(1.99993896484375);
    expect(cache(sheet.id, 0, 3)).toBeUndefined();
  });

  test.each([false, true])(
    "rejects a bad mutual-cycle member and its consumers regardless of traversal order (reverse=%s)",
    async (reverse) => {
      const { workbook, sheet } = fixture();
      const sources = ["=B1", "=(A1+IF(TRUE,1,UNKNOWN(1)))/2", "=2*A1", "=(D1+1)/2"];
      for (const column of reverse ? [3, 2, 1, 0] : [0, 1, 2, 3])
        formula(sheet, 0, column, sources[column]!);
      const encoded = await encodeXlsx(workbook);
      for (const address of ["A1", "B1", "C1"])
        expect(rawCell(encoded.bytes, address).cache).toBeUndefined();
      expect(rawCell(encoded.bytes, "D1").cache).toBe("0.99993896484375");
    },
  );

  test("retains disabled mutual-cycle rejection", () => {
    const { workbook, sheet } = fixture(false);
    formula(sheet, 0, 0, "=B1");
    formula(sheet, 0, 1, "=(A1+1)/2");
    formula(sheet, 0, 2, "=A1+B1");
    const cache = createIterativeFormulaCache(
      workbook,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    for (const column of [0, 1, 2]) expect(cache(sheet.id, 0, column)).toBeUndefined();
  });

  test("analyzes a 15,000-node reverse-inserted cycle-dependent graph without recursion", () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 14_999, 0, "=(A15000+1)/2");
    for (let row = 14_998; row >= 0; row -= 1) formula(sheet, row, 0, `=A${row + 2}+1`);
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const cache = createIterativeFormulaCache(workbook, evaluator);
    expect(cache(sheet.id, 0, 0)).toBe(evaluator.getComputedValue({ row: 0, column: 0 }));
    expect(cache(sheet.id, 14_999, 0)).toBe(0.99993896484375);
  });

  test.each([false, true])(
    "leaves disabled cycles and capped nonconvergence uncached (iteration=%s)",
    async (iterative) => {
      const { workbook, sheet } = fixture(iterative);
      formula(sheet, 2, 1, iterative ? "=B3+1" : "=(B3+1)/2");
      formula(sheet, 2, 2, "=2*B3");
      const evaluator = createWorkbookEvaluator(workbook, sheet.id);
      if (iterative) expect(evaluator.getComputedValue({ row: 2, column: 1 })).toBe(50);
      const encoded = await encodeXlsx(workbook);
      expect(rawCell(encoded.bytes, "B3").cache).toBeUndefined();
      expect(rawCell(encoded.bytes, "C3").cache).toBeUndefined();
      expect(encoded.report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "formula-not-calculated", count: 2 }),
        ]),
      );
    },
  );

  test("checks the residual even at a one-pass cap", () => {
    const { workbook, sheet } = fixture(true, 1);
    formula(sheet, 0, 0, "=(A1+1)/2");
    expect(
      createIterativeFormulaCache(workbook, createWorkbookEvaluator(workbook, sheet.id))(
        sheet.id,
        0,
        0,
      ),
    ).toBeUndefined();
    workbook.calculation.maxChange = 0.001;
    formula(sheet, 0, 0, "=(A1+1)/100");
    expect(
      createIterativeFormulaCache(workbook, createWorkbookEvaluator(workbook, sheet.id))(
        sheet.id,
        0,
        0,
      ),
    ).toBe(0.01);
  });

  test.each([
    "=(A1+IFERROR(UNKNOWN(1),1))/2",
    "=(A1+IF(TRUE,1,UNKNOWN(1)))/2",
    "=(A1+IFERROR('[foreign.xlsx]Sheet1'!A1,1))/2",
    "=(A1+IFERROR('Missing Sheet'!A1,1))/2",
    "=(A1+IFERROR(MissingName,1))/2",
    "=(A1+IFERROR(SUM(MissingTable[Amount]),1))/2",
    "=(A1+IFERROR(XFE1,1))/2",
    "=(A1+IFERROR(A1048577,1))/2",
    "=(A1+IFERROR(#REF!,1))/2",
    "=(A1+IFERROR(#DIV/0!,1))/2",
    "=(A1+IFERROR(#NUM!,1))/2",
    "=(A1+IF(TRUE,1,#NAME?))/2",
    "=(A1+IFERROR(SUM(A:A),1))/2",
    "=(SUM({A1,1}))/2",
    "=(A1+IFERROR(A1#,1))/2",
    '=IF(A1=0,"text",A1)',
    "=IF(A1=0,TRUE,A1)",
    "=A1+1e308",
  ])("fails closed for unsafe cyclic source %s", async (source) => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, source);
    formula(sheet, 0, 1, "=IFERROR(A1,0)");
    formula(sheet, 0, 2, "=7");
    const encoded = await encodeXlsx(workbook);
    expect(rawCell(encoded.bytes, "A1").cache).toBeUndefined();
    expect(rawCell(encoded.bytes, "B1").cache).toBeUndefined();
    expect(rawCell(encoded.bytes, "C1").cache).toBe("7");
  });

  test.each([
    "RAND()",
    "RANDBETWEEN(1,2)",
    "NOW()",
    "TODAY()",
    "_xlfn.RAND()",
    "SUMIF(B2:B2,1,C2:C2)",
  ])(
    "rejects volatile/conservative function %s in a direct, unused or transitive loop path",
    async (call) => {
      for (const path of ["direct", "unused", "transitive"]) {
        const { workbook, sheet } = fixture();
        formula(
          sheet,
          0,
          0,
          path === "direct"
            ? `=(A1+${call})/2`
            : path === "unused"
              ? `=(A1+IF(TRUE,1,${call}))/2`
              : "=(A1+IFERROR(B1,1))/2",
        );
        formula(sheet, 0, 1, `=${call}`);
        const encoded = await encodeXlsx(workbook);
        expect(rawCell(encoded.bytes, "A1").cache).toBeUndefined();
        // Independent ordinary acyclic eligibility remains unchanged.
        expect(rawCell(encoded.bytes, "B1").cache).toBeDefined();
      }
    },
  );

  test("allows supported inline error handling while rejecting erroneous dependency sources", () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=(A1+IFERROR(1/0,1))/2");
    formula(sheet, 0, 1, "=(B1+IFERROR(C1,1))/2");
    formula(sheet, 0, 2, "=1/0");
    const cache = createIterativeFormulaCache(
      workbook,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    expect(cache(sheet.id, 0, 0)).toBe(0.99993896484375);
    expect(cache(sheet.id, 0, 1)).toBeUndefined();
  });

  test.each<CellContent>([
    { kind: "formula", formula: { source: "=UNKNOWN(1)" } },
    { kind: "formula", formula: { source: "=SUM(" } },
    { kind: "formula", formula: { source: "=1/0" } },
    { kind: "formula", formula: { source: "=1e308*1e308" } },
    { kind: "error", error: { kind: "formula-error", code: "REF" } },
    { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
    { kind: "error", error: { kind: "formula-error", code: "NUM" } },
    { kind: "image", image: { assetId: "image", altText: "Image" } },
  ])(
    "does not launder unsafe materialized dependency %j through IFERROR or a sparse range",
    (dependency) => {
      for (const source of ["=(A1+IFERROR(B1,1))/2", "=(A1+IFERROR(SUM(B1:B1000000),1))/2"]) {
        const { workbook, sheet } = fixture();
        formula(sheet, 0, 0, source);
        setCellContent(sheet, { row: 0, column: 1 }, dependency);
        const cache = createIterativeFormulaCache(
          workbook,
          createWorkbookEvaluator(workbook, sheet.id),
        );
        expect(cache(sheet.id, 0, 0)).toBeUndefined();
      }
    },
  );

  test.each(["UNKNOWN(1)", "RAND()"])(
    "excludes implicit projected dependencies with unsafe unused %s",
    (unsafe) => {
      const { workbook, sheet } = fixture();
      formula(sheet, 0, 0, "=(A1+D1+1)/2");
      formula(sheet, 0, 2, `=IF(TRUE,{1,2},${unsafe})`);
      const cache = createIterativeFormulaCache(
        workbook,
        createWorkbookEvaluator(workbook, sheet.id),
      );
      expect(cache(sheet.id, 0, 0)).toBeUndefined();
    },
  );

  test.each(["=A1:B1", "=A1:B1+1", "=INDEX(A1:B1,0,0)", "=IF(TRUE,A1:B1,1)"])(
    "rejects uncertain array-shaped consumer %s without poisoning its safe cycle",
    (source) => {
      const { workbook, sheet } = fixture();
      formula(sheet, 0, 0, "=(A1+1)/2");
      setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: 2 });
      formula(sheet, 0, 2, source);
      const cache = createIterativeFormulaCache(
        workbook,
        createWorkbookEvaluator(workbook, sheet.id),
      );
      expect(cache(sheet.id, 0, 0)).toBe(0.99993896484375);
      expect(cache(sheet.id, 0, 2)).toBeUndefined();
    },
  );

  test("fails closed if same-cycle sheet views or source re-evaluation are unavailable", () => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=(A1+1)/2");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const { forSheet: _forSheet, ...withoutSheets } = evaluator;
    const { evaluateFormula: _evaluateFormula, ...withoutFormula } = evaluator;
    expect(createIterativeFormulaCache(workbook, withoutSheets)(sheet.id, 0, 0)).toBeUndefined();
    expect(createIterativeFormulaCache(workbook, withoutFormula)(sheet.id, 0, 0)).toBeUndefined();
    const withoutViewFormula: SheetEvaluator = { ...evaluator, forSheet: () => withoutFormula };
    expect(
      createIterativeFormulaCache(workbook, withoutViewFormula)(sheet.id, 0, 0),
    ).toBeUndefined();
  });

  test.each<FormulaValue>([
    null,
    "text",
    true,
    Infinity,
    NaN,
    { kind: "formula-error", code: "NUM" },
  ])("never admits nonnumeric/nonfinite cyclic result %j", (value) => {
    const { workbook, sheet } = fixture();
    formula(sheet, 0, 0, "=(A1+1)/2");
    const evaluator: SheetEvaluator = {
      getComputedValue: () => value,
      evaluateFormula: () => value,
      forSheet: () => evaluator,
    };
    expect(createIterativeFormulaCache(workbook, evaluator)(sheet.id, 0, 0)).toBeUndefined();
  });
});
