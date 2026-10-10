import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { createFormulaError, type FormulaValue } from "@sheetcraft/core/formula";
import { createAddSheetCommand, createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { cacheDefinitionXml, readPivotSharedItems } from "../../pivot-cache.js";
import { child, parseXml, nodes } from "../../pivot-xml.js";
import { encodeXlsx } from "../../index.js";

// Office type-flag constraints, beyond XML Schema validation:
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/e6bf5edd-aa4c-40b5-8f43-b3da6b664823
const samples: Array<{
  name: string;
  values: FormulaValue[];
  date?: boolean;
  semiMixed: boolean;
  strings: boolean;
  mixed?: boolean;
  blank?: boolean;
  integer?: boolean;
}> = [
  { name: "text", values: ["East", "West"], semiMixed: true, strings: true },
  { name: "boolean", values: [true, false], semiMixed: true, strings: true },
  {
    name: "error",
    values: [createFormulaError("NA"), createFormulaError("DIV0")],
    semiMixed: true,
    strings: true,
  },
  {
    name: "text, boolean and error share the Office string type",
    values: ["East", true, createFormulaError("NA")],
    semiMixed: true,
    strings: true,
  },
  { name: "blank", values: [null], semiMixed: true, strings: false, blank: true },
  {
    name: "empty text is serialized as blank",
    values: [""],
    semiMixed: true,
    strings: false,
    blank: true,
  },
  { name: "empty field", values: [], semiMixed: false, strings: false },
  { name: "integers", values: [10, 20], semiMixed: false, strings: false, integer: true },
  { name: "decimal numbers", values: [10, 20.5], semiMixed: false, strings: false, integer: false },
  {
    name: "number with blank",
    values: [10, null],
    semiMixed: true,
    strings: false,
    blank: true,
    integer: true,
  },
  { name: "text with blank", values: ["East", null], semiMixed: true, strings: true, blank: true },
  {
    name: "number with text",
    values: [10, "East"],
    semiMixed: true,
    strings: true,
    mixed: true,
    integer: true,
  },
  { name: "grouped dates", values: [1, 2], date: true, semiMixed: false, strings: false },
];

function table(sourceSheetId: string): SheetPivotTable {
  return {
    id: "type-flags",
    name: "TypeFlags",
    sourceSheetId,
    source: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 0, aggregate: "count", caption: "Count" }],
    filters: [],
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    sort: "source",
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
  };
}

describe("Office-compatible pivot-cache shared-item type flags", () => {
  test.each(samples)("exports $name consistently with its serialized items", (sample) => {
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory(), dateSystem: "1904" });
    const pivot = table(getActiveSheet(workbook).id);
    if (sample.date)
      pivot.groups = [{ kind: "date", field: 0, unit: "days", start: 1, end: 2, interval: 1 }];
    const bytes = cacheDefinitionXml(
      workbook,
      pivot,
      {
        headers: ["Field"],
        shared: [sample.values],
        records: sample.values.map((_, index) => [index]),
        numberFormats: [0],
      },
      "rId1",
    );
    const root = child(parseXml(bytes), "pivotCacheDefinition");
    const items = child(nodes(child(root, "cacheFields").cacheField)[0]!, "sharedItems");
    expect(items["@_containsSemiMixedTypes"]).toBe(sample.semiMixed ? "1" : "0");
    expect(items["@_containsString"]).toBe(sample.strings ? "1" : "0");
    expect(items["@_containsMixedTypes"]).toBe(sample.mixed ? "1" : "0");
    expect(items["@_containsBlank"]).toBe(sample.blank ? "1" : "0");
    expect(items["@_containsDate"]).toBe(sample.date ? "1" : "0");
    expect(items["@_containsNumber"]).toBe(sample.integer === undefined ? "0" : "1");
    expect(items["@_containsInteger"]).toBe(
      sample.integer === undefined ? undefined : sample.integer ? "1" : "0",
    );
    expect(readPivotSharedItems(bytes, "1904").shared[0]).toEqual(
      sample.values.map((value) => (value === "" ? null : value)),
    );
  });

  test("public Core-command export satisfies Office constraints for every cached source field", async () => {
    const workbook = createWorkbook({ id: "flags", sheetId: "source", sheetName: "Source" });
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const rows = [
      ["Region", "Amount"],
      ["East", 10],
      ["West", 20],
    ];
    executeWorkbookCommand(session, {
      type: "setCellContents",
      changes: rows.flatMap((row, rowIndex) =>
        row.map((value, column) => ({
          sheetId: "source",
          address: { row: rowIndex, column },
          content: { kind: "literal", value },
        })),
      ),
    });
    executeWorkbookCommand(
      session,
      createAddSheetCommand(workbook, { id: "report", name: "Report" }),
    );
    const pivot = table("source");
    pivot.source!.end.column = 1;
    pivot.values = [{ field: 1, aggregate: "sum", caption: "Total amount" }];
    executeWorkbookCommand(session, createSetPivotTableCommand("report", pivot));
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const cache = strFromU8(entries["xl/pivotCache/pivotCacheDefinition1.xml"]!);
    const items = [...cache.matchAll(/<sharedItems\b([^>]*)>/g)].map((match) => match[1]!);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('containsSemiMixedTypes="1"');
    expect(items[0]).toContain('containsString="1"');
    expect(items[0]).not.toContain("containsInteger");
    expect(items[1]).toContain('containsNumber="1"');
    expect(items[1]).toContain('containsInteger="1"');
    expect(items[1]).toContain('containsSemiMixedTypes="0"');
  });
});
