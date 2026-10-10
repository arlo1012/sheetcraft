import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { buildPivotResult, getPivotDetails } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getCellValue } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { attr, child, nodes, parseXml } from "../../pivot-xml.js";

async function withoutCharts(name: string) {
  const bytes = await readFile(
    new URL(
      `../../../../../docs/acceptance/evidence/wps-pivotchart-producer-20261010/${name}.xlsx`,
      import.meta.url,
    ),
  );
  const entries = unzipSync(bytes);
  for (const part of Object.keys(entries)) {
    if (part.startsWith("xl/drawings/") || part.startsWith("xl/charts/")) delete entries[part];
    else if (/^xl\/worksheets\/[^/]+\.xml$/.test(part))
      entries[part] = strToU8(strFromU8(entries[part]!).replace(/<drawing\b[^>]*\/>/g, ""));
    else if (part.endsWith(".rels"))
      entries[part] = strToU8(
        strFromU8(entries[part]!).replace(/<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*\/>/g, ""),
      );
    else if (part === "[Content_Types].xml")
      entries[part] = strToU8(
        strFromU8(entries[part]!).replace(
          /<Override\b[^>]*PartName="\/xl\/(?:drawings|charts)\/[^"]*"[^>]*\/>/g,
          "",
        ),
      );
  }
  return entries;
}

describe("validated native cached leaf layout prerequisite", () => {
  test("keeps a valid native PivotTable/cache when its leaf rebuild exceeds the Core output bound", async () => {
    const entries = await withoutCharts("native-created");
    const count = 3331;
    const shared = Array.from({ length: count }, (_, index) => `<s v="R${index}"/>`).join("");
    const definitionPart = "xl/pivotCache/pivotCacheDefinition1.xml";
    entries[definitionPart] = strToU8(
      strFromU8(entries[definitionPart]!)
        .replace(/recordCount="\d+"/, `recordCount="${count * 2}"`)
        .replace(
          /<sharedItems\b[\s\S]*?<\/sharedItems>/,
          `<sharedItems count="${count}" containsString="1">${shared}</sharedItems>`,
        ),
    );
    entries["xl/pivotCache/pivotCacheRecords1.xml"] = strToU8(
      `<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${count * 2}">${Array.from({ length: count }, (_, index) => [0, 1].map((series) => `<r><x v="${index}"/><x v="${series}"/><x v="0"/><x v="0"/></r>`).join("")).join("")}</pivotCacheRecords>`,
    );
    const pivotPart = "xl/pivotTables/pivotTable1.xml";
    entries[pivotPart] = strToU8(
      strFromU8(entries[pivotPart]!)
        .replace('ref="A3:D8"', `ref="A3:D${count + 5}"`)
        .replace(
          /<items\b[\s\S]*?<\/items>/,
          `<items count="${count + 1}">${Array.from({ length: count }, (_, index) => `<item x="${index}"/>`).join("")}<item t="default"/></items>`,
        )
        .replace(
          /<rowItems\b[\s\S]*?<\/rowItems>/,
          `<rowItems count="${count + 1}">${Array.from({ length: count }, (_, index) => `<i><x v="${index}"/></i>`).join("")}<i t="grand"><x/></i></rowItems>`,
        ),
    );
    const { workbook } = await decodeXlsx(zipSync(entries));
    const report = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet2")!;
    expect(report.pivotTables).toHaveLength(1);
    expect(report.pivotTables![0]!.dataCache!.records).toHaveLength(count * 2);
    expect(report.pivotTables![0]!.resultLayout).toBeUndefined();
    expect(getCellValue(report, { row: 5, column: 1 })).toBe(100);
  });
  test.each([
    ["native-created", 100, 100, 520],
    ["native-source-edited-stale", 110, 100, 520],
    ["native-refreshed", 110, 110, 530],
  ] as const)(
    "restores %s manual item positions without refreshing cached cells",
    async (name, sourceValue, reportValue, total) => {
      const { workbook } = await decodeXlsx(zipSync(await withoutCharts(name)));
      const report = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet2")!;
      const source = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet1")!;
      const table = report.pivotTables![0]!;
      expect(table.resultLayout?.headerRows).toBe(2);
      expect(table.sortFields).toEqual([
        { axis: "rows", field: 0, order: "manual", members: ["east", "north", "south"] },
        { axis: "columns", field: 1, order: "manual", members: ["apple", "pear"] },
      ]);
      expect(getCellValue(source, { row: 1, column: 2 })).toBe(sourceValue);
      expect(getCellValue(report, { row: 5, column: 1 })).toBe(reportValue);
      expect(getCellValue(report, table.outputRange!.end)).toBe(total);
      const result = buildPivotResult(workbook, table, { useCache: true });
      expect(result.rowLabels).toEqual(["east", "north", "south"]);
      const details = getPivotDetails(workbook, table, { row: 5, column: 1 });
      expect(details.records).toHaveLength(1);
      expect(details.records[0]!.slice(0, 3)).toEqual(["north", "apple", reportValue]);
      const encoded = await encodeXlsx(workbook);
      const parts = unzipSync(encoded.bytes);
      const pivot = child(
        parseXml(parts["xl/pivotTables/pivotTable1.xml"]),
        "pivotTableDefinition",
      );
      const fields = nodes(child(pivot, "pivotFields").pivotField);
      expect(
        nodes(child(fields[0]!, "items").item)
          .slice(0, 3)
          .map((item) => attr(item, "x")),
      ).toEqual(["2", "0", "1"]);
      expect(
        nodes(child(pivot, "rowItems").i)
          .slice(0, 3)
          .map((item) => attr(child(item, "x"), "v", "0")),
      ).toEqual(["0", "1", "2"]);
      const roundtrip = await decodeXlsx(encoded.bytes);
      const restored = [...roundtrip.workbook.sheets.values()].find(
        (sheet) => sheet.name === "Sheet2",
      )!;
      expect(restored.pivotTables![0]!.sortFields).toEqual(table.sortFields);
      const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
      executeWorkbookCommand(session, createSetPivotTableCommand(report.id, table));
      expect(getCellValue(report, { row: 5, column: 1 })).toBe(sourceValue);
    },
  );

  test.each(["missing", "duplicate", "unknown-sort", "invalid-index"])(
    "does not claim a reproducible leaf layout for %s native order",
    async (kind) => {
      const entries = await withoutCharts("native-created");
      const path = "xl/pivotTables/pivotTable1.xml";
      const xml = strFromU8(entries[path]!);
      entries[path] = strToU8(
        kind === "missing"
          ? xml.replace(/<rowItems\b[\s\S]*?<\/rowItems>/, "")
          : kind === "duplicate"
            ? xml.replace('<x v="1"/>', '<x v="0"/>')
            : kind === "unknown-sort"
              ? xml.replace("<pivotField ", '<pivotField sortType="unknown" ')
              : xml.replace('<x v="1"/>', '<x v="99999"/>'),
      );
      const { workbook } = await decodeXlsx(zipSync(entries));
      const report = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet2")!;
      expect(report.pivotTables![0]!.sortFields?.some((rule) => rule.order === "manual")).not.toBe(
        true,
      );
    },
  );
});
