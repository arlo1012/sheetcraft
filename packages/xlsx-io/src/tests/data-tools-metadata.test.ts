import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSheetFilterHiddenRowIntervals } from "@sheetcraft/core/commands";
import { createWorkbook, setCellContent, setCellStyle } from "@sheetcraft/core/workbook";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
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
        '<autoFilter ref="A1:A3"><filterColumn colId="0"><dynamicFilter type="thisMonth"/></filterColumn></autoFilter>',
      ),
    );
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "filter-omitted" })]),
    );
  });

  test("roundtrips custom pairs, rank, average, and cell/font color filters", async () => {
    const workbook = createWorkbook({ id: "extended-filter", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    for (let column = 0; column < 7; column += 1) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value: `Column ${column}` });
      setCellContent(sheet, { row: 1, column }, { kind: "literal", value: column + 1 });
      setCellContent(sheet, { row: 2, column }, { kind: "literal", value: column + 6 });
    }
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 6 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: {
            kind: "compound",
            operator: "or",
            conditions: [
              { kind: "number", operator: "lessThan", value: 2 },
              { kind: "number", operator: "greaterThanOrEqual", value: 5 },
            ],
          },
        },
        {
          column: 1,
          allowedValues: [],
          condition: {
            kind: "compound",
            operator: "and",
            conditions: [
              { kind: "text", operator: "contains", value: "a" },
              { kind: "text", operator: "doesNotContain", value: "z" },
            ],
          },
        },
        {
          column: 2,
          allowedValues: [],
          condition: { kind: "rank", count: 12.5, bottom: true, percent: true },
        },
        { column: 3, allowedValues: [], condition: { kind: "average", above: false } },
        { column: 4, allowedValues: [], condition: { kind: "color", target: "fill", color: null } },
        {
          column: 5,
          allowedValues: [],
          condition: { kind: "color", target: "text", color: "#c00000" },
        },
        {
          column: 6,
          allowedValues: [],
          condition: { kind: "number", operator: "notBetween", value: 3, value2: 7 },
        },
      ],
    };

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    const styles = strFromU8(entries["xl/styles.xml"]!);
    expect(xml).toContain(
      '<customFilters><customFilter operator="lessThan" val="2"/><customFilter operator="greaterThanOrEqual" val="5"/></customFilters>',
    );
    expect(xml).toContain(
      '<customFilters and="1"><customFilter operator="equal" val="*a*"/><customFilter operator="notEqual" val="*z*"/></customFilters>',
    );
    expect(xml).toContain('<top10 val="12.5" percent="1" top="0"/>');
    expect(xml).toContain(
      '<customFilters><customFilter operator="lessThan" val="3"/><customFilter operator="greaterThan" val="7"/></customFilters>',
    );
    expect(xml).toContain('<dynamicFilter type="belowAverage"/>');
    expect(xml).toMatch(/<colorFilter dxfId="\d+" cellColor="1"\/>/);
    expect(xml).toMatch(/<colorFilter dxfId="\d+" cellColor="0"\/>/);
    expect(styles).toContain('<patternFill patternType="none"/>');
    expect(styles).toContain('<color rgb="FFC00000"/>');

    expect(
      [...(await decodeXlsx(encoded.bytes)).workbook.sheets.values()][0]!.filter?.columns,
    ).toEqual(sheet.filter.columns);
  });

  test("roundtrips multi-color filters without pretending OOXML supports more than one color", async () => {
    const workbook = createWorkbook({
      id: "multi-color-filter",
      sheetId: "data",
      sheetName: "Data",
    });
    const sheet = [...workbook.sheets.values()][0]!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Value" });
    for (const row of [1, 2, 3])
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: "same" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#00ff00" });
    setCellStyle(sheet, { row: 3, column: 0 }, { fillColor: "#0000ff" });
    (sheet.hiddenRows ??= new Set()).add(1);
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: {
            kind: "color-set",
            target: "fill",
            colors: ["#ff0000", "#0000ff"],
          },
        },
      ],
    };

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).not.toContain("<colorFilter");
    expect(xml).toContain('uri="{F05D2C50-AD53-4CE0-8F27-4BE69CF538D1}"');
    expect(xml).toContain('<idea10:color value="#FF0000"/>');
    expect(xml).toContain('<idea10:color value="#0000FF"/>');
    expect(xml).toContain('hiddenRows="2"');
    expect(xml).toMatch(/<row[^>]*r="2"[^>]*hidden="1"/);
    expect(xml).toMatch(/<row[^>]*r="3"[^>]*hidden="1"/);
    expect(xml).not.toMatch(/<row[^>]*r="4"[^>]*hidden="1"/);

    const decoded = [...(await decodeXlsx(encoded.bytes)).workbook.sheets.values()][0]!;
    expect(decoded.filter?.columns).toEqual(sheet.filter.columns);
    expect([...(decoded.hiddenRows ?? [])]).toEqual([1]);
    expect(createSheetFilterHiddenRowIntervals(decoded)).toEqual([{ start: 2, end: 2 }]);
    decoded.filter = null;
    expect(createSheetFilterHiddenRowIntervals(decoded)).toEqual([]);
    expect([...(decoded.hiddenRows ?? [])]).toEqual([1]);
  });

  test("restores manual rows after clearing a table-only multi-color filter", async () => {
    const workbook = createWorkbook({
      id: "table-multi-color-filter",
      sheetId: "data",
      sheetName: "Data",
    });
    const sheet = [...workbook.sheets.values()][0]!;
    for (const [row, value] of ["Value", "same", "same", "same"].entries())
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#00ff00" });
    setCellStyle(sheet, { row: 3, column: 0 }, { fillColor: "#0000ff" });
    (sheet.hiddenRows ??= new Set()).add(1);
    const filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: {
            kind: "color-set" as const,
            target: "fill" as const,
            colors: ["#ff0000", "#0000ff"],
          },
        },
      ],
    };
    sheet.tables = [
      {
        id: "colors",
        name: "Colors",
        range: filter.range,
        columns: [{ id: "value", name: "Value" }],
        style: createBuiltinTableStyles()[0]!,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter,
      },
    ];
    sheet.filter = filter;

    const entries = unzipSync((await encodeXlsx(workbook)).bytes);
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain('hiddenRows="2"');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain("idea10:colorFilterSet");

    const decoded = [...(await decodeXlsx(zipSync(entries))).workbook.sheets.values()][0]!;
    expect(decoded.filter).toBeNull();
    expect(decoded.tables?.[0]?.filter?.columns).toEqual(filter.columns);
    expect([...(decoded.hiddenRows ?? [])]).toEqual([1]);
    decoded.tables![0]!.filter = null;
    expect(createSheetFilterHiddenRowIntervals(decoded)).toEqual([]);
    expect([...(decoded.hiddenRows ?? [])]).toEqual([1]);
  });

  test("imports standard not-between and validates top-percent limits", async () => {
    const supported = await decodeXlsx(
      await workbookWith(
        '<autoFilter ref="A1:B3"><filterColumn colId="0"><customFilters><customFilter operator="lessThan" val="3"/><customFilter operator="greaterThan" val="7"/></customFilters></filterColumn><filterColumn colId="1"><top10 val="12.5" percent="1" top="0"/></filterColumn></autoFilter>',
      ),
    );
    expect(metadata([...supported.workbook.sheets.values()][0]!).filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "number", operator: "notBetween", value: 3, value2: 7 },
        },
        {
          column: 1,
          allowedValues: [],
          condition: { kind: "rank", count: 12.5, percent: true, bottom: true },
        },
      ],
    });

    const unsupported = await decodeXlsx(
      await workbookWith(
        '<autoFilter ref="A1:A3"><filterColumn colId="0"><top10 val="100.1" percent="1"/></filterColumn></autoFilter>',
      ),
    );
    expect(unsupported.report.issues).toEqual(
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

  test("roundtrips an ordinary merged-cell filter and its hidden merged block", async () => {
    const workbook = createWorkbook({ id: "merged-filter", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    for (const [row, value] of ["Group", "Keep", "Keep", "Skip", "Skip"].entries())
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    sheet.mergedCells.push(
      { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
      { start: { row: 3, column: 0 }, end: { row: 4, column: 0 } },
    );
    (sheet.hiddenRows ??= new Set()).add(3);
    sheet.hiddenRows.add(4);
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "Keep" }] }],
      allowMergedCells: true,
    };

    const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    const imported = [...decoded.workbook.sheets.values()][0]!;

    expect(imported.filter).toEqual({
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "Keep" }] }],
      allowMergedCells: true,
    });
    expect(imported.mergedCells).toEqual([
      { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
      { start: { row: 3, column: 0 }, end: { row: 4, column: 0 } },
    ]);
    expect([...(imported.hiddenRows ?? new Set())].sort((left, right) => left - right)).toEqual([
      3, 4,
    ]);
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

  test("writes subtotal page breaks and summary placement with OOXML row identifiers", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    sheet.subtotalMetadata = [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 8, column: 1 } },
        generatedRows: [3, 6, 8],
        summaryBelow: false,
        // These are zero-based first rows of the new printed page.
        pageBreakRows: [6, 3, 6],
      },
    ];

    const xml = strFromU8(
      unzipSync((await encodeXlsx(workbook)).bytes)["xl/worksheets/sheet1.xml"]!,
    );
    expect(xml).toMatch(/<outlinePr\b[^>]*summaryBelow="0"/);
    expect(xml).toContain(
      '<rowBreaks count="2" manualBreakCount="2"><brk id="3" max="16383" man="1"/><brk id="6" max="16383" man="1"/></rowBreaks>',
    );
  });

  test("writes the below-details outline setting when subtotal metadata requests it", async () => {
    const workbook = createWorkbook({ id: "book", sheetId: "data", sheetName: "Data" });
    const sheet = [...workbook.sheets.values()][0]!;
    sheet.subtotalMetadata = [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        generatedRows: [1],
        summaryBelow: true,
      },
    ];

    const xml = strFromU8(
      unzipSync((await encodeXlsx(workbook)).bytes)["xl/worksheets/sheet1.xml"]!,
    );
    expect(xml).toMatch(/<outlinePr\b[^>]*summaryBelow="1"/);
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
