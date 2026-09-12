import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createRenameSheetCommand,
  createUpsertDefinedNameCommand,
} from "../../commands/index.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("workbook formula evaluation", () => {
  test("resolves cross-sheet ranges, exponent and percentage syntax", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data Set", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 3 });
    setCellContent(data, { row: 1, column: 0 }, { kind: "literal", value: 4 });
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SUM('Data Set'!A1:A2)^2+'Data Set'!A1%" },
      },
    );

    expect(
      createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      }),
    ).toBe(49.03);
  });

  test("detects cycles across sheet boundaries", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=Data!A1" } },
    );
    setCellContent(
      data,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=Sheet1!A1" } },
    );
    expect(
      createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      }),
    ).toMatchObject({ code: "CYCLE" });
  });

  test("shares one calculation memo across sheet evaluator views", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(
      data,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=Data!A2" } },
    );

    const evaluator = createWorkbookEvaluator(workbook, workbook.activeSheetId);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toBe(2);
    const dataEvaluator = evaluator.forSheet!(data.id);
    expect(dataEvaluator.getComputedValue({ row: 1, column: 0 })).toBe(2);
    expect([...dataEvaluator.getSpillProjections!()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: { row: 1, column: 0 },
          root: { row: 0, column: 0 },
          value: 2,
        }),
      ]),
    );
  });

  test("evaluates a deep cross-sheet direct-reference chain without recursion", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 0; row < 15_000; row += 1) {
      const source = row === 0 ? "=IF(TRUE,Data!A1,0)" : `=IF(TRUE,Sheet1!A${row},0)`;
      setCellContent(data, { row: row + 1, column: 0 }, { kind: "formula", formula: { source } });
      setCellContent(
        getActiveSheet(workbook),
        { row, column: 0 },
        {
          kind: "formula",
          formula: { source: `=IF(TRUE,Data!A${row + 2},0)` },
        },
      );
    }
    expect(
      createWorkbookEvaluator(workbook, data.id).getComputedValue({
        row: 15_000,
        column: 0,
      }),
    ).toBe(1);
  });

  test("schedules a deep cross-sheet lazy chain with expression and name dependencies", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Anchor",
        reference: "=Data!A1",
      }),
    );
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(data, { row: 0, column: 1 }, { kind: "literal", value: true });
    const main = getActiveSheet(workbook);
    for (let row = 0; row < 15_000; row += 1) {
      setCellContent(
        data,
        { row: row + 1, column: 0 },
        {
          kind: "formula",
          formula: {
            source: row === 0 ? "=SUM(Anchor)" : `=SUM(Sheet1!A${row})`,
          },
        },
      );
      setCellContent(
        main,
        { row, column: 0 },
        {
          kind: "formula",
          formula: { source: `=IF(Data!B1,Data!A${row + 2},0)` },
        },
      );
    }
    expect(
      createWorkbookEvaluator(workbook, data.id).getComputedValue({
        row: 15_000,
        column: 0,
      }),
    ).toBe(1);
  });

  test("persists names and gives a local name precedence over a workbook name", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 5 });
    setCellContent(data, { row: 1, column: 0 }, { kind: "literal", value: 7 });
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Sales",
        reference: "=Data!A1:A2",
      }),
    );
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Sales",
        scopeSheetId: workbook.activeSheetId,
        reference: "=Data!A1",
      }),
    );
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SUM(Sales)" } },
    );

    expect(
      createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      }),
    ).toBe(5);
    expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(workbook)))).toEqual(
      serializeWorkbook(workbook),
    );
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=Data!A1" } },
    );
    const inverse = applyWorkbookCommand(workbook, createInsertSheetAxisCommand(data.id, "row", 0));
    expect(
      createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      }),
    ).toBe(5);
    expect(getActiveSheet(workbook).cells.get("0:1")?.content).toMatchObject({
      formula: { source: "=Data!A2" },
    });
    if (!inverse || !("type" in inverse)) throw new Error("Expected axis inverse.");
    applyWorkbookCommand(workbook, inverse);
    expect(getActiveSheet(workbook).cells.get("0:1")?.content).toMatchObject({
      formula: { source: "=Data!A1" },
    });
  });

  test("renames workbook names in formulas without changing local shadows, strings, or function names", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    const global = createUpsertDefinedNameCommand(workbook, {
      name: "Sales",
      reference: "=A1",
    });
    applyWorkbookCommand(workbook, global);
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Sales",
        scopeSheetId: data.id,
        reference: "=A1",
      }),
    );
    const main = getActiveSheet(workbook);
    setCellContent(
      main,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: '=SUM(Sales,"Sales")+Sales(Sales)' },
      },
    );
    setCellContent(
      data,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Sales" },
      },
    );

    const rename = createUpsertDefinedNameCommand(workbook, {
      id: global.definition.id,
      name: "Revenue",
      reference: "=A1",
    });
    const inverse = applyWorkbookCommand(workbook, rename);

    expect(main.cells.get("0:0")?.content).toMatchObject({
      formula: { source: '=SUM(Revenue,"Sales")+Sales(Revenue)' },
    });
    expect(data.cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=Sales" },
    });
    if (!inverse || !("type" in inverse)) throw new Error("Expected name inverse.");
    setCellContent(
      main,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=Sales" },
      },
    );
    applyWorkbookCommand(workbook, inverse);
    expect(main.cells.get("0:0")?.content).toMatchObject({
      formula: { source: '=SUM(Sales,"Sales")+Sales(Sales)' },
    });
    expect(main.cells.get("0:1")?.content).toMatchObject({
      formula: { source: "=Sales" },
    });
  });

  test("renames a local name only in formulas on its scope sheet", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    const local = createUpsertDefinedNameCommand(workbook, {
      name: "Plan",
      scopeSheetId: data.id,
      reference: "=A1",
    });
    applyWorkbookCommand(workbook, local);
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Plan" },
      },
    );
    setCellContent(
      data,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SUM(Plan)" },
      },
    );

    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        id: local.definition.id,
        name: "Budget",
        scopeSheetId: data.id,
        reference: "=A1",
      }),
    );

    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=Plan" },
    });
    expect(data.cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=SUM(Budget)" },
    });
  });

  test("rejects a global rename that would be shadowed by a local name", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    const global = createUpsertDefinedNameCommand(workbook, {
      name: "Sales",
      reference: "=A1",
    });
    applyWorkbookCommand(workbook, global);
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Revenue",
        scopeSheetId: data.id,
        reference: "=A1",
      }),
    );

    expect(() =>
      applyWorkbookCommand(
        workbook,
        createUpsertDefinedNameCommand(workbook, {
          id: global.definition.id,
          name: "Revenue",
          reference: "=A1",
        }),
      ),
    ).toThrow();
  });

  test("does not allow changing the scope of an existing defined name", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    const global = createUpsertDefinedNameCommand(workbook, {
      name: "Sales",
      reference: "=A1",
    });
    applyWorkbookCommand(workbook, global);

    expect(() =>
      createUpsertDefinedNameCommand(workbook, {
        id: global.definition.id,
        name: "Sales",
        scopeSheetId: data.id,
        reference: "=A1",
      }),
    ).toThrow();
  });

  test("keeps named dependencies valid through rename, deletion inverse, and V8 snapshots", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 4 });
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        name: "Revenue",
        reference: "=Data!A1",
      }),
    );
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=SUM(Revenue)" },
      },
    );

    const valueAt = () =>
      createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      });
    expect(valueAt()).toBe(4);
    expect(valueAt()).toBe(4);
    applyWorkbookCommand(workbook, createRenameSheetCommand(data.id, "Actuals"));
    expect(valueAt()).toBe(4);
    const inverse = applyWorkbookCommand(workbook, createDeleteSheetCommand(workbook, data.id));
    expect(valueAt()).toMatchObject({ code: "NAME" });
    if (!inverse || !("type" in inverse)) throw new Error("Expected delete inverse.");
    applyWorkbookCommand(workbook, inverse);
    expect(valueAt()).toBe(4);
    const restored = deserializeWorkbook(serializeWorkbook(workbook));
    expect(
      createWorkbookEvaluator(restored, restored.activeSheetId).getComputedValue({
        row: 0,
        column: 0,
      }),
    ).toBe(4);
  });

  test("rewrites qualified references for rename and delete, while the delete inverse restores them", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=Data!A1" } },
    );
    applyWorkbookCommand(workbook, createRenameSheetCommand(data.id, "Revenue"));
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=Revenue!A1" },
    });
    const inverse = applyWorkbookCommand(workbook, createDeleteSheetCommand(workbook, data.id));
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=#REF!" },
    });
    if (!inverse || !("type" in inverse)) throw new Error("Expected delete inverse.");
    applyWorkbookCommand(workbook, inverse);
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({
      formula: { source: "=Revenue!A1" },
    });
  });
});
