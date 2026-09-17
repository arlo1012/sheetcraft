import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, setCellContent } from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

const ExcelJS = ExcelJSImport as unknown as { Workbook: new () => any };

async function workbookWith(xml: string): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  sheet.getCell("A1").value = "Name";
  sheet.getCell("B1").value = "Score";
  sheet.getCell("A2").value = "Ada";
  sheet.getCell("B2").value = 3;
  sheet.getCell("A3").value = "Grace";
  sheet.getCell("B3").value = 8;
  const entries = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()));
  const source = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
  entries["xl/worksheets/sheet1.xml"] = strToU8(
    source.replace("</worksheet>", `${xml}</worksheet>`),
  );
  return zipSync(entries);
}

function metadata(sheet: unknown): {
  filter: unknown;
  dataValidations: unknown[];
  outlineGroups: unknown[];
} {
  return sheet as { filter: unknown; dataValidations: unknown[]; outlineGroups: unknown[] };
}

describe("XLSX data-tool metadata", () => {
  test("imports supported filter, validation, and nested outline metadata", async () => {
    const result = await decodeXlsx(
      await workbookWith(
        '<autoFilter ref="A1:B3"><filterColumn colId="0"><filters blank="1"><filter val="Ada"/></filters></filterColumn><filterColumn colId="1"><customFilters><customFilter operator="greaterThanOrEqual" val="5"/></customFilters></filterColumn></autoFilter><dataValidations count="2"><dataValidation type="list" allowBlank="1" showDropDown="1" showInputMessage="0" showErrorMessage="0" promptTitle="Pick" prompt="A &amp; B" errorStyle="warning" errorTitle="Invalid" error="Try again" sqref="C2:C3"><formula1>&quot;yes,no&quot;</formula1></dataValidation><dataValidation type="custom" sqref="D2"><formula1>COUNTIF($A$2:$A$3,D2)=0</formula1></dataValidation></dataValidations><sheetData><row r="2" outlineLevel="1" hidden="1"/><row r="3" outlineLevel="2" hidden="1"/><row r="4" collapsed="1"/></sheetData>',
      ),
    );
    const sheet = metadata([...result.workbook.sheets.values()][0]!);
    expect(sheet.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [
        { column: 0, allowedValues: [{ kind: "blank" }, { kind: "string", value: "Ada" }] },
        {
          column: 1,
          allowedValues: [],
          condition: { kind: "number", operator: "greaterThanOrEqual", value: 5 },
        },
      ],
    });
    expect(sheet.dataValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "list",
          list: ["yes", "no"],
          allowBlank: true,
          showDropdown: false,
          showInput: false,
          showError: false,
          prompt: "A & B",
          errorStyle: "warning",
        }),
        expect.objectContaining({ type: "custom", formula1: "COUNTIF($A$2:$A$3,D2)=0" }),
      ]),
    );
    expect(sheet.outlineGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ axis: "row", start: 1, end: 2, collapsed: true }),
        expect.objectContaining({ axis: "row", start: 2, end: 2, collapsed: true }),
      ]),
    );
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "filter-omitted" }),
        expect.objectContaining({
          code: "feature-omitted",
          locations: ["xl/worksheets/sheet1.xml"],
        }),
      ]),
    );
  });

  test("reports unsupported filter criteria instead of silently reducing them", async () => {
    const result = await decodeXlsx(
      await workbookWith(
        '<autoFilter ref="A1:A3"><filterColumn colId="0"><dynamicFilter type="aboveAverage"/></filterColumn></autoFilter>',
      ),
    );
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "filter-omitted" })]),
    );
  });

  test("writes validation formulas, criteria, and collapsed outline state", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Name" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "Ada" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "Grace" });
    setCellContent(sheet, { row: 4, column: 0 }, { kind: "literal", value: "Manually hidden" });
    sheet.hiddenRows?.add(4);
    const rich = sheet as unknown as {
      filter: unknown;
      dataValidations: unknown[];
      outlineGroups: unknown[];
    };
    rich.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "text", operator: "contains", value: "da" },
        },
      ],
    };
    rich.dataValidations = [
      {
        id: "date",
        range: { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
        type: "date",
        operator: "between",
        formula1: "45292",
        formula2: "45657",
        allowBlank: true,
        showDropdown: false,
        promptTitle: "Date",
        prompt: "Choose a date",
        errorStyle: "stop",
        errorTitle: "No",
        error: "Out of range",
      },
    ];
    rich.outlineGroups = [{ id: "group", axis: "row", start: 1, end: 2, collapsed: true }];
    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain(
      '<autoFilter ref="A1:A3"><filterColumn colId="0"><customFilters><customFilter operator="equal" val="*da*"/></customFilters></filterColumn></autoFilter>',
    );
    expect(xml).toContain('type="date" operator="between" allowBlank="1"');
    expect(xml).toContain('showDropDown="1"');
    expect(xml).toContain("<formula1>45292</formula1><formula2>45657</formula2>");
    expect(xml).toMatch(/<row[^>]*r="2"[^>]*outlineLevel="1"[^>]*hidden="1"/);
    expect(xml).toMatch(/<row[^>]*r="4"[^>]*collapsed="1"/);
    const decoded = await decodeXlsx(encoded.bytes);
    const roundTrip = metadata([...decoded.workbook.sheets.values()][0]!);
    expect((roundTrip.filter as any).columns[0].condition).toEqual({
      kind: "text",
      operator: "contains",
      value: "da",
    });
    expect(roundTrip.dataValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "date",
          formula1: "45292",
          formula2: "45657",
          showDropdown: false,
        }),
      ]),
    );
    expect(([...decoded.workbook.sheets.values()][0]?.hiddenRows ?? new Set()).has(4)).toBe(true);
    expect(roundTrip.outlineGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ axis: "row", start: 1, end: 2, collapsed: true }),
      ]),
    );
  });

  test("writes validations when a sheet has no filter", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]! as unknown as { dataValidations: unknown[] };
    sheet.dataValidations = [
      {
        id: "list",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        type: "list",
        list: ["yes", "no"],
        allowBlank: false,
      },
    ];
    const xml = strFromU8(
      unzipSync((await encodeXlsx(workbook)).bytes)["xl/worksheets/sheet1.xml"]!,
    );
    expect(xml).toContain(
      '<dataValidations count="1"><dataValidation type="list" sqref="A1:A2"><formula1>&quot;yes,no&quot;</formula1></dataValidation></dataValidations>',
    );
  });

  test("preserves applied advanced-filter visibility without exporting it as an AutoFilter", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    for (const row of [0, 1, 4])
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: `row-${row}` });
    (sheet as unknown as { filter: unknown }).filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [],
      advanced: {
        criteria: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 2 }, end: { row: 1, column: 2 } },
        },
        uniqueOnly: true,
        hiddenRows: [{ start: 2, end: 3 }],
      },
    };

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).not.toContain("<autoFilter");
    expect(xml).toMatch(/<row[^>]*r="3"[^>]*hidden="1"/);
    expect(xml).toMatch(/<row[^>]*r="4"[^>]*hidden="1"/);
    expect([...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "advanced-filter-criteria-omitted",
          locations: ["Data.advancedFilter"],
        }),
      ]),
    );
  });

  test("reports product-owned duplicate rules omitted from XLSX", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    sheet.duplicateRules = [
      {
        id: "duplicate-highlight",
        kind: "highlight",
        range: { start: { row: 1, column: 0 }, end: { row: 4, column: 0 } },
        fillColor: "#fce4d6",
      },
    ];

    const encoded = await encodeXlsx(workbook);

    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "feature-omitted",
          count: 1,
          locations: ["Data.duplicateRules"],
        }),
      ]),
    );
  });
});
