import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  type TableStyleDefinition,
} from "@sheetcraft/core/table-styles";
import type { PivotTableStyleDefinition } from "@sheetcraft/core/pivot-table-styles";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

describe("XLSX structured tables", () => {
  test("writes table parts, table relationships, and imports the table contract", async () => {
    const workbook = createWorkbook({ id: "table-roundtrip", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const style = createBuiltinTableStyles().find((entry) => entry.id === "table-medium-1")!;
    for (const [row, values] of [
      ["Name", "Amount"],
      ["Ada", 10],
      ["Lin", 20],
    ].entries())
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      );
    sheet.tables = [
      {
        id: "sales-table",
        name: "Sales",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
        columns: [
          { id: "column-name", name: "Name" },
          { id: "column-amount", name: "Amount" },
          { id: "column-date", name: "Date" },
        ],
        style,
        headerRow: true,
        totalRow: false,
        firstColumn: true,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: {
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
          columns: [
            { column: 0, allowedValues: [{ kind: "blank" }, { kind: "string", value: "Ada" }] },
            {
              column: 1,
              allowedValues: [],
              condition: { kind: "number", operator: "between", value: 10, value2: 20 },
            },
            {
              column: 2,
              allowedValues: [],
              condition: { kind: "date", operator: "equals", value: 45200 },
            },
          ],
        },
      },
    ];
    sheet.filter = sheet.tables[0]!.filter;

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain('<tableParts count="1"');
    expect(strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!)).toContain(
      "relationships/table",
    );
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('displayName="Sales"');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('showFirstColumn="1"');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('<customFilters and="1">');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('dateTimeGrouping="day"');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('name="Sheetcraft Medium 1"');
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain(
      '<tableColumn id="1" name="Name"/>',
    );
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).not.toContain("<autoFilter");
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('tableStyle name="Sheetcraft Medium 1"');

    const imported = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables;
    expect(imported).toEqual([
      expect.objectContaining({
        name: "Sales",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
        columns: [
          { id: "1", name: "Name" },
          { id: "2", name: "Amount" },
          { id: "3", name: "Date" },
        ],
        firstColumn: true,
        bandedRows: true,
        filterButton: true,
      }),
    ]);
    expect(imported?.[0]?.filter?.columns).toEqual([
      { column: 0, allowedValues: [{ kind: "blank" }, { kind: "string", value: "Ada" }] },
      {
        column: 1,
        allowedValues: [],
        condition: { kind: "number", operator: "between", value: 10, value2: 20 },
      },
      {
        column: 2,
        allowedValues: [],
        condition: { kind: "date", operator: "equals", value: 45200 },
      },
    ]);
  });

  test("retains a mapped default table style without a table instance", async () => {
    const workbook = createWorkbook({ id: "default-table-style", sheetId: "sheet" });
    workbook.tableStyles = [
      createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!,
    ];
    workbook.defaultTableStyleId = "table-medium-1";

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('defaultTableStyle="Sheetcraft Medium 1"');
    expect(styles).toContain('tableStyle name="Sheetcraft Medium 1"');

    const imported = await decodeXlsx(encoded.bytes);
    expect(imported.workbook.defaultTableStyleId).toBe("xlsx-table-style-Sheetcraft Medium 1");
    expect(imported.workbook.tableStyles?.[0]).toMatchObject({ name: "Sheetcraft Medium 1" });
  });

  test("roundtrips table color filters through shared differential formats", async () => {
    const workbook = createWorkbook({ id: "table-color-filter", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const style = createBuiltinTableStyles().find((entry) => entry.id === "table-medium-1")!;
    for (const [row, values] of [
      ["Status", "Owner"],
      ["Open", "Ada"],
      ["Closed", "Lin"],
    ].entries())
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      );
    sheet.tables = [
      {
        id: "status-table",
        name: "StatusTable",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        columns: [
          { id: "status", name: "Status" },
          { id: "owner", name: "Owner" },
        ],
        style,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: {
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "color", target: "fill", color: "#f4b183" },
            },
            {
              column: 1,
              allowedValues: [],
              condition: { kind: "color", target: "text", color: "#c00000" },
            },
          ],
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const tableXml = strFromU8(entries["xl/tables/table1.xml"]!);
    expect(tableXml).toMatch(/<colorFilter dxfId="\d+" cellColor="1"\/>/);
    expect(tableXml).toMatch(/<colorFilter dxfId="\d+" cellColor="0"\/>/);
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('rgb="FFF4B183"');

    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.filter?.columns,
    ).toEqual(sheet.tables[0]!.filter!.columns);
  });

  test("maps Excel's final light, medium, and dark preset names to their exact catalog tiles", async () => {
    for (const [category, index] of [
      ["Light", 21],
      ["Medium", 28],
      ["Dark", 11],
    ] as const) {
      const workbook = createWorkbook({ id: `excel-${category}-${index}`, sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      sheet.tables = [
        {
          id: "table",
          name: "Table",
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          columns: [{ id: "column-1", name: "Value" }],
          style: createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!,
          headerRow: true,
          totalRow: false,
          firstColumn: false,
          lastColumn: false,
          bandedRows: true,
          bandedColumns: false,
          filterButton: true,
          filter: null,
        },
      ];
      const encoded = await encodeXlsx(workbook);
      const entries = unzipSync(encoded.bytes);
      entries["xl/tables/table1.xml"] = strToU8(
        strFromU8(entries["xl/tables/table1.xml"]!).replace(
          /name="Sheetcraft Medium 1"/,
          `name="TableStyle${category}${index}"`,
        ),
      );
      const imported = getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).tables?.[0];
      const expected = createBuiltinTableStyles().find(
        (style) => style.id === `table-${category.toLowerCase()}-${index}`,
      );
      expect(imported?.style).toMatchObject({
        id: `xlsx-excel-style-TableStyle${category}${index}`,
        name: `Excel TableStyle${category}${index}`,
        elements: expected?.elements,
      });
    }
  });

  test("roundtrips a recolored WPS quick style as an explicit custom table style", async () => {
    const workbook = createWorkbook({ id: "wps-table-style", sheetId: "sheet" });
    const style = createThemedTableStyles("#b7446e").find(
      (entry) => entry.id === "table-wps-medium-1",
    )!;
    workbook.tableStyles = [style];
    workbook.defaultTableStyleId = style.id;

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('tableStyle name="WPS Medium 1"');
    expect(styles).toContain("FFB7446E");

    const imported = await decodeXlsx(encoded.bytes);
    expect(imported.workbook.defaultTableStyleId).toBe("xlsx-table-style-WPS Medium 1");
    expect(imported.workbook.tableStyles?.[0]).toMatchObject({
      name: "WPS Medium 1",
      elements: { headerRow: { style: { fillColor: "#B7446E" } } },
    });
  });

  test("roundtrips custom pivot table styles and their default through styles.xml", async () => {
    const workbook = createWorkbook({ id: "pivot-style", sheetId: "sheet" });
    const pivotStyle: PivotTableStyleDefinition = {
      id: "pivot-blue",
      name: "Pivot Blue",
      category: "custom",
      elements: {
        wholeTable: { style: { fillColor: "#eef4fb" } },
        firstRowSubheading: { style: { fillColor: "#41719c", textColor: "#ffffff", bold: true } },
        pageFieldLabels: {
          style: { bold: true, borderBottom: { style: "thin", color: "#41719c" } },
        },
      },
    };
    workbook.pivotTableStyles = [pivotStyle];
    workbook.defaultPivotTableStyleId = pivotStyle.id;

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('defaultPivotStyle="Pivot Blue"');
    expect(styles).toContain('tableStyle name="Pivot Blue" pivot="1" table="0"');
    expect(styles).toContain('type="firstRowSubheading"');
    expect(styles).toContain('type="pageFieldLabels"');

    const imported = await decodeXlsx(encoded.bytes);
    expect(imported.workbook.defaultPivotTableStyleId).toBe("xlsx-pivot-table-style-Pivot Blue");
    expect(imported.workbook.pivotTableStyles?.[0]).toMatchObject({
      name: "Pivot Blue",
      elements: {
        firstRowSubheading: { style: { fillColor: "#41719C", bold: true } },
        pageFieldLabels: { style: { bold: true } },
      },
    });
  });

  test("preserves an Excel built-in pivot default without creating a product definition", async () => {
    const workbook = createWorkbook({ id: "pivot-default", sheetId: "sheet" });
    workbook.defaultPivotTableStyleId = "xlsx-pivot-table-style-PivotStyleDark18";

    const encoded = await encodeXlsx(workbook);
    expect(strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!)).toContain(
      'defaultPivotStyle="PivotStyleDark18"',
    );
    expect((await decodeXlsx(encoded.bytes)).workbook.defaultPivotTableStyleId).toBe(
      "xlsx-pivot-table-style-PivotStyleDark18",
    );
  });

  test("coexists with a same-named table style and conditional-format DXF", async () => {
    const workbook = createWorkbook({ id: "combined-style", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const shared: TableStyleDefinition = {
      id: "shared-table",
      name: "Shared Blue",
      category: "custom",
      elements: { wholeTable: { style: { fillColor: "#eaf3f8" } } },
    };
    const pivot: PivotTableStyleDefinition = {
      id: "shared-pivot",
      name: "Shared Blue",
      category: "custom",
      elements: {
        wholeTable: { style: { fillColor: "#eaf3f8" } },
        pageFieldValues: { style: { bold: true } },
      },
    };
    workbook.tableStyles = [shared];
    workbook.pivotTableStyles = [pivot];
    sheet.conditionalFormats = [
      {
        id: "companion-dxf",
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
        anchor: { row: 0, column: 0 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: { textColor: "#112233" },
      },
    ];
    const originalStyles = JSON.stringify({
      tableStyles: workbook.tableStyles,
      pivotTableStyles: workbook.pivotTableStyles,
    });

    const encoded = await encodeXlsx(workbook);
    expect(
      JSON.stringify({
        tableStyles: workbook.tableStyles,
        pivotTableStyles: workbook.pivotTableStyles,
      }),
    ).toBe(originalStyles);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles.match(/tableStyle name="Shared Blue"/g)).toHaveLength(1);
    expect(styles).toContain('tableStyle name="Shared Blue" pivot="1" table="1"');
    const imported = await decodeXlsx(encoded.bytes);
    expect(imported.workbook.tableStyles?.[0]?.name).toBe("Shared Blue");
    expect(imported.workbook.pivotTableStyles?.[0]?.elements.pageFieldValues?.style.bold).toBe(
      true,
    );
    expect(getActiveSheet(imported.workbook).conditionalFormats).toHaveLength(1);
  });

  test("renames a conflicting pivot style without colliding with an existing style name", async () => {
    const workbook = createWorkbook({ id: "conflicting-style", sheetId: "sheet" });
    const tableStyle: TableStyleDefinition = {
      id: "table-shared",
      name: "Shared",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#4472c4" } } },
    };
    const occupied: TableStyleDefinition = {
      id: "table-occupied",
      name: "Sheetcraft Pivot Shared",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#70ad47" } } },
    };
    const pivotStyle: PivotTableStyleDefinition = {
      id: "pivot-shared",
      name: "shared",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#ed7d31" } } },
    };
    workbook.tableStyles = [tableStyle, occupied];
    workbook.pivotTableStyles = [pivotStyle];
    workbook.defaultPivotTableStyleId = pivotStyle.id;

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('tableStyle name="Sheetcraft Pivot shared 2" pivot="1" table="0"');
    expect(styles).toContain('defaultPivotStyle="Sheetcraft Pivot shared 2"');
  });

  test("keeps disjoint definitions separate when their shared element coverage differs", async () => {
    const workbook = createWorkbook({ id: "disjoint-shared-style", sheetId: "sheet" });
    workbook.tableStyles = [
      {
        id: "table-shared",
        name: "Shared",
        category: "custom",
        elements: { headerRow: { style: { fillColor: "#4472c4" } } },
      },
    ];
    workbook.pivotTableStyles = [
      {
        id: "pivot-shared",
        name: "Shared",
        category: "custom",
        elements: { wholeTable: { style: { fillColor: "#f2f2f2" } } },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('tableStyle name="Shared" pivot="0" table="1"');
    expect(styles).toContain('tableStyle name="Sheetcraft Pivot Shared" pivot="1" table="0"');

    const imported = await decodeXlsx(encoded.bytes);
    expect(imported.workbook.tableStyles?.[0]?.elements).toMatchObject({
      headerRow: { style: { fillColor: "#4472C4" } },
    });
    expect(imported.workbook.tableStyles?.[0]?.elements.wholeTable).toBeUndefined();
    expect(imported.workbook.pivotTableStyles?.[0]?.elements).toMatchObject({
      wholeTable: { style: { fillColor: "#F2F2F2" } },
    });
    expect(imported.workbook.pivotTableStyles?.[0]?.elements.headerRow).toBeUndefined();
  });

  test("rejects conflicting table and partially overlapping worksheet filters", async () => {
    const workbook = createWorkbook({ id: "overlapping-filters", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const tableFilter = {
      range: { start: { row: 0, column: 1 }, end: { row: 2, column: 2 } },
      columns: [],
    };
    sheet.tables = [
      {
        id: "table",
        name: "Table",
        range: tableFilter.range,
        columns: [
          { id: "column-1", name: "First" },
          { id: "column-2", name: "Second" },
        ],
        style: createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: tableFilter,
      },
    ];
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [],
    };

    await expect(encodeXlsx(workbook)).rejects.toThrow("overlapping worksheet/table filter");
  });

  test("keeps custom table differential formats in styles.xml", async () => {
    const workbook = createWorkbook({ id: "custom-table", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const style: TableStyleDefinition = {
      id: "table-brand",
      name: "Brand table",
      category: "custom" as const,
      elements: {
        wholeTable: {
          style: { fillPattern: "darkGrid", fillColor: "#eef0f2", fillPatternColor: "#345678" },
        },
        headerRow: {
          style: { fillColor: "#123456", textColor: "#ffffff", bold: true },
          innerHorizontal: { style: "thin", color: "#456789" },
          innerVertical: { style: "dotted", color: "#abcdef" },
        },
      },
    };
    sheet.tables = [
      {
        id: "brand-table",
        name: "Brand",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        columns: [{ id: "1", name: "Label" }],
        style,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: false,
        filter: {
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          columns: [],
        },
      },
    ];
    sheet.conditionalFormats = [
      {
        id: "table-companion-rule",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 1, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: { bold: true },
      },
    ];
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('tableStyle name="Brand table"');
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('rgb="FF123456"');
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain('<patternFill patternType="darkGrid">');
    expect(strFromU8(entries["xl/styles.xml"]!)).toContain(
      '<horizontal style="thin"><color rgb="FF456789"/></horizontal>',
    );
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain('hiddenButton="1"');
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.style.elements
        .headerRow?.style,
    ).toMatchObject({ fillColor: "#123456", textColor: "#ffffff", bold: true });
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).conditionalFormats,
    ).toHaveLength(1);
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.filterButton,
    ).toBe(false);
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.style.elements
        .headerRow,
    ).toMatchObject({
      innerHorizontal: { style: "thin", color: "#456789" },
      innerVertical: { style: "dotted", color: "#abcdef" },
    });
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.style.elements
        .wholeTable?.style,
    ).toMatchObject({ fillPattern: "darkGrid", fillColor: "#eef0f2", fillPatternColor: "#345678" });
  });
});
