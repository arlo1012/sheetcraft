import { fromExcelNumberFormat, builtinNumberFormat } from "./number-format.js";
import type { CellNumberFormat } from "@idea10/core/style";
import { nativePivotGroupXml, nativePivotDateTime } from "./pivot-native-groups.js";
import { createPivotNumberFormatReader } from "./pivot-number-formats.js";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import type { Workbook } from "@idea10/core/workbook";
import { createPivotCache, cacheDefinitionXml, cacheRecordsXml } from "./pivot-cache.js";
import { pivotTableXml } from "./pivot-table-writer.js";
import { readPivotTable } from "./pivot-table-reader.js";
import {
  addContentType,
  addRelationship,
  attr,
  child,
  nodes,
  parseXml,
  relationships,
} from "./pivot-xml.js";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
import type { CompatibilityReportBuilder } from "./report.js";

export function writeXlsxPivotTables(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  report?: CompatibilityReportBuilder,
  styleNames?: ReadonlyMap<SheetPivotTable, string>,
): void {
  if (![...workbook.sheets.values()].some((sheet) => sheet.pivotTables?.length)) return;
  const readNumberFormats = createPivotNumberFormatReader(entries, workbook);
  const caches: string[] = [];
  const names = new Set<string>();
  let index = 0;
  for (const [sheetIndex, sheet] of [...workbook.sheets.values()].entries()) {
    const sheetPart = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    for (const table of sheet.pivotTables ?? []) {
      if (table.values.some((value) => value.aggregate === "distinctCount")) {
        // Standard worksheet PivotTables have no native distinct-count aggregator.
        report?.add("feature-omitted", "warning", `${table.name}.distinctCount`);
        continue;
      }
      if (!table.includeHidden)
        report?.add("filter-omitted", "warning", `${table.name}.includeHidden`);
      const cache = createPivotCache(workbook, table);
      try {
        for (const group of table.groups ?? []) {
          nativePivotGroupXml(group, workbook.dateSystem);
          if (group.kind === "date")
            for (const value of cache.shared[group.field]!)
              if (typeof value === "number") nativePivotDateTime(value, workbook.dateSystem);
        }
      } catch {
        report?.add("feature-omitted", "warning", `${table.name}.groups`);
        continue;
      }
      cache.numberFormats = readNumberFormats.source(table, cache.headers.length);
      cache.valueNumberFormats = readNumberFormats.values(sheet.id, table);
      index++;
      const cachePart = `xl/pivotCache/pivotCacheDefinition${index}.xml`;
      const recordsPart = `xl/pivotCache/pivotCacheRecords${index}.xml`;
      const tablePart = `xl/pivotTables/pivotTable${index}.xml`;
      let name = table.name;
      for (let suffix = 2; names.has(name.toLowerCase()); suffix++)
        name = `${table.name}_${suffix}`;
      names.add(name.toLowerCase());
      const recordId = addRelationship(
        entries,
        cachePart,
        "pivotCacheRecords",
        `pivotCacheRecords${index}.xml`,
      );
      entries[cachePart] = cacheDefinitionXml(workbook, table, cache, recordId);
      entries[recordsPart] = cacheRecordsXml(cache);
      entries[tablePart] = pivotTableXml(
        workbook,
        table,
        cache,
        index - 1,
        name,
        report,
        styleNames?.get(table),
      );
      addRelationship(
        entries,
        tablePart,
        "pivotCacheDefinition",
        `../pivotCache/pivotCacheDefinition${index}.xml`,
      );
      const workbookRel = addRelationship(
        entries,
        "xl/workbook.xml",
        "pivotCacheDefinition",
        `pivotCache/pivotCacheDefinition${index}.xml`,
      );
      caches.push(`<pivotCache cacheId="${index - 1}" r:id="${workbookRel}"/>`);
      addRelationship(entries, sheetPart, "pivotTable", `../pivotTables/pivotTable${index}.xml`);
      addContentType(entries, cachePart, "pivotCacheDefinition");
      addContentType(entries, recordsPart, "pivotCacheRecords");
      addContentType(entries, tablePart, "pivotTable");
    }
  }
  if (caches.length) {
    const source = strFromU8(entries["xl/workbook.xml"]!);
    entries["xl/workbook.xml"] = strToU8(
      source.replace(
        /<(?:smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/,
        (next) => `<pivotCaches>${caches.join("")}</pivotCaches>${next}`,
      ),
    );
  }
}
export function readXlsxPivotTables(
  bytes: Uint8Array,
  workbook: Workbook,
  report: CompatibilityReportBuilder,
): void {
  const entries = unzipSync(bytes);
  const styleRoot = entries["xl/styles.xml"]
    ? child(parseXml(entries["xl/styles.xml"]), "styleSheet")
    : {};
  const numberFormats = new Map<number, CellNumberFormat>();
  for (const item of nodes(child(styleRoot, "numFmts").numFmt)) {
    const format = fromExcelNumberFormat(attr(item, "formatCode"));
    if (format) numberFormats.set(Number(attr(item, "numFmtId")), format);
  }
  const readFormat = (id: number) =>
    numberFormats.get(id) ?? fromExcelNumberFormat(builtinNumberFormat(id)) ?? undefined;
  const workbookRoot = child(parseXml(entries["xl/workbook.xml"]), "workbook");
  const workbookRels = relationships(entries, "xl/workbook.xml");
  const caches = new Map<string, string>();
  for (const cache of nodes(child(workbookRoot, "pivotCaches").pivotCache)) {
    const relation = workbookRels.get(attr(cache, "id"));
    if (relation?.type.endsWith("/pivotCacheDefinition"))
      caches.set(attr(cache, "cacheId"), relation.target);
  }
  const sheets = [...workbook.sheets.values()];
  const seen = new Set<string>();
  for (const [index, sheetPart] of readXlsxWorksheetPartTargets(entries).entries()) {
    const sheet = sheets[index];
    if (!sheet) continue;
    const rels = relationships(entries, sheetPart);
    for (const relation of rels.values()) {
      if (!relation.type.endsWith("/pivotTable")) continue;
      let location = `${sheet.name}.pivotTable`;
      try {
        location = relation.target;
        const definition = entries[relation.target];
        const root = child(parseXml(definition), "pivotTableDefinition");
        const cachePart = caches.get(attr(root, "cacheId"));
        if (!definition || !cachePart || !entries[cachePart])
          throw new Error("Missing pivot cache.");
        const cacheRoot = child(parseXml(entries[cachePart]), "pivotCacheDefinition");
        const recordRelation = relationships(entries, cachePart).get(attr(cacheRoot, "id"));
        const table = readPivotTable(
          workbook,
          definition,
          entries[cachePart]!,
          `xlsx-pivot-${index}-${sheet.pivotTables?.length ?? 0}`,
          recordRelation?.type.endsWith("/pivotCacheRecords")
            ? entries[recordRelation.target]
            : undefined,
          sheet.id,
          readFormat,
        );
        if (seen.has(table.id)) table.id = `xlsx-pivot-${index}-${sheet.pivotTables?.length ?? 0}`;
        seen.add(table.id);
        (sheet.pivotTables ??= []).push(table);
      } catch {
        report.add("feature-omitted", "warning", location);
      }
    }
  }
}
