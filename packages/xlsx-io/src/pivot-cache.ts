import { canRefreshNativePivotOnLoad } from "./pivot-native-filters.js";
import { XMLParser } from "fast-xml-parser";
import { strToU8, strFromU8 } from "fflate/browser";
import type { Workbook, CellValue } from "@idea10/core/workbook";
import { getPivotTableSource, type SheetPivotTable } from "@idea10/core/pivot-tables";
import {
  isFormulaError,
  FORMULA_ERROR_TOKENS,
  formulaErrorCodeFromToken,
  createFormulaError,
  datePartsToExcelSerial,
  type FormulaValue,
} from "@idea10/core/formula";
import {
  MAIN_NS,
  REL_NS,
  attr,
  child,
  nodes,
  parseXml,
  rangeRef,
  xml,
  type XmlNode,
} from "./pivot-xml.js";

export const pivotValueKey = (value: FormulaValue): string =>
  value === null || value === "" ? "blank" : JSON.stringify(value);
export type PivotCache = {
  headers: string[];
  shared: FormulaValue[][];
  records: number[][];
  numberFormats: number[];
};
export function createPivotCache(workbook: Workbook, table: SheetPivotTable): PivotCache {
  const source = getPivotTableSource(workbook, table);
  const shared = source.headers.map(() => [] as FormulaValue[]);
  const indices = source.headers.map(() => new Map<string, number>());
  const records = [...source.records()].map((record) =>
    source.headers.map((_, field) => {
      const value = record[field] ?? null;
      const key = pivotValueKey(value);
      const existing = indices[field]!.get(key);
      if (existing !== undefined) return existing;
      const index = shared[field]!.length;
      shared[field]!.push(value);
      indices[field]!.set(key, index);
      return index;
    }),
  );
  return { headers: source.headers, shared, records, numberFormats: source.headers.map(() => 0) };
}
function itemXml(value: FormulaValue): string {
  if (value === null || value === "") return "<m/>";
  if (isFormulaError(value)) return `<e v="${xml(FORMULA_ERROR_TOKENS[value.code])}"/>`;
  if (typeof value === "boolean") return `<b v="${value ? 1 : 0}"/>`;
  if (typeof value === "number") return `<n v="${value}"/>`;
  return `<s v="${xml(value)}"/>`;
}
function sourceXml(workbook: Workbook, table: SheetPivotTable): string {
  if (!table.consolidation) {
    if (!table.source) throw new Error("Missing pivot source.");
    return `<cacheSource type="worksheet"><worksheetSource ref="${rangeRef(table.source)}" sheet="${xml(workbook.sheets.get(table.sourceSheetId)!.name)}"/></cacheSource>`;
  }
  const consolidation = table.consolidation;
  const count = consolidation.pageFields?.count ?? consolidation.labels.length - 3;
  const pages = Array.from({ length: count }, (_, index) => [
    ...new Set(
      consolidation.ranges.map((area) => (area.pageItems ?? [area.label])[index] ?? area.label),
    ),
  ]);
  return `<cacheSource type="consolidation"><consolidation autoPage="0">${count ? `<pages count="${count}">${pages.map((items) => `<page count="${items.length}">${items.map((name) => `<pageItem name="${xml(name)}"/>`).join("")}</page>`).join("")}</pages>` : ""}<rangeSets count="${consolidation.ranges.length}">${consolidation.ranges
    .map((area) => {
      if (!area.range) throw new Error("Missing consolidation range.");
      const items = area.pageItems ?? [area.label];
      return `<rangeSet ref="${rangeRef(area.range)}" sheet="${xml(workbook.sheets.get(area.sheetId)!.name)}"${pages.map((values, index) => ` i${index + 1}="${values.indexOf(items[index] ?? area.label)}"`).join("")}/>`;
    })
    .join("")}</rangeSets></consolidation></cacheSource>`;
}
export function cacheDefinitionXml(
  workbook: Workbook,
  table: SheetPivotTable,
  cache: PivotCache,
  recordId: string,
): Uint8Array {
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheDefinition xmlns="${MAIN_NS}" xmlns:r="${REL_NS}" r:id="${recordId}" refreshOnLoad="${canRefreshNativePivotOnLoad(table) ? 1 : 0}" enableRefresh="1" saveData="1" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="${cache.records.length}">${sourceXml(workbook, table)}<cacheFields count="${cache.headers.length}">${cache.headers
      .map((name, field) => {
        const values = cache.shared[field]!;
        const numbers = values.filter((value): value is number => typeof value === "number");
        const strings = values.some((value) => typeof value === "string" && value !== "");
        const blank = values.some((value) => value === null || value === "");
        const nonDate = values.some((value) => value !== null && value !== "");
        const types = new Set(values.map((value) => (value === null ? "blank" : typeof value)));
        return `<cacheField name="${xml(name)}" numFmtId="${cache.numberFormats[field] ?? 0}"><sharedItems count="${values.length}" containsSemiMixedTypes="${types.size > 1 ? 1 : 0}" containsNonDate="${nonDate ? 1 : 0}" containsDate="0" containsString="${strings ? 1 : 0}" containsBlank="${blank ? 1 : 0}" containsNumber="${numbers.length ? 1 : 0}" containsInteger="${numbers.length && numbers.every(Number.isInteger) ? 1 : 0}" containsMixedTypes="${types.size > 1 ? 1 : 0}">${values.map(itemXml).join("")}</sharedItems></cacheField>`;
      })
      .join("")}</cacheFields></pivotCacheDefinition>`,
  );
}
export function cacheRecordsXml(cache: PivotCache): Uint8Array {
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheRecords xmlns="${MAIN_NS}" count="${cache.records.length}">${cache.records.map((record) => `<r>${record.map((index) => `<x v="${index}"/>`).join("")}</r>`).join("")}</pivotCacheRecords>`,
  );
}
/** Mixed s/n/b/m children must retain their original shared-item positions. */
export function readPivotSharedItems(
  bytes: Uint8Array,
  dateSystem: "1900" | "1904" = "1900",
): {
  headers: string[];
  shared: FormulaValue[][];
} {
  const root = child(parseXml(bytes), "pivotCacheDefinition");
  const fields = nodes(child(root, "cacheFields").cacheField);
  if (!fields.length || fields.length > 16384) throw new Error("Invalid pivot cache fields.");
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    preserveOrder: true,
    parseAttributeValue: false,
    parseTagValue: false,
  });
  const ordered = parser.parse(strFromU8(bytes)) as XmlNode[];
  const children = (list: XmlNode[], key: string): XmlNode[] =>
    list.flatMap((node) => (Array.isArray(node[key]) ? (node[key] as XmlNode[]) : []));
  const rawFields = children(children(ordered, "pivotCacheDefinition"), "cacheFields").filter(
    (node) => "cacheField" in node,
  );
  const shared = rawFields.map((field) =>
    children(children([field], "cacheField"), "sharedItems").map((item): FormulaValue => {
      const kind = Object.keys(item).find((key) => key !== ":@");
      const attributes = (item[":@"] ?? {}) as XmlNode;
      const value = attr(attributes, "v");
      if (kind === "m") return null;
      if (kind === "n") {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error("Invalid cache number.");
        return number;
      }
      if (kind === "b") return value === "1" || value === "true";
      if (kind === "s") return value;
      if (kind === "e") {
        const code = formulaErrorCodeFromToken(value);
        if (!code) throw new Error("Invalid cache error.");
        return createFormulaError(code);
      }
      if (kind === "d") {
        const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?$/.exec(
          value,
        );
        if (!parts) throw new Error("Invalid pivot cache date.");
        return datePartsToExcelSerial(
          {
            year: Number(parts[1]),
            month: Number(parts[2]),
            day: Number(parts[3]),
            hour: Number(parts[4]),
            minute: Number(parts[5]),
            second: Number(parts[6]),
            millisecond: Number((parts[7] ?? "").padEnd(3, "0")),
          },
          dateSystem,
        );
      }
      throw new Error("Unsupported pivot cache item.");
    }),
  );
  return { headers: fields.map((field) => attr(field, "name")), shared };
}
export function primitivePivotValue(value: FormulaValue): CellValue {
  if (isFormulaError(value))
    throw new Error("Error members cannot be selected by this pivot model.");
  return value;
}
