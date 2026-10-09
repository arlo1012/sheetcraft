import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import { readXlsxDxfEntries, readXlsxDxfStyle, xlsxDxfXml } from "./conditional-formatting.js";

export type XlsxDataValidation = {
  range: XlsxRange;
  type: "whole" | "decimal" | "list" | "date" | "time" | "textLength" | "custom";
  operator?:
    | "between"
    | "notBetween"
    | "equal"
    | "notEqual"
    | "greaterThan"
    | "lessThan"
    | "greaterThanOrEqual"
    | "lessThanOrEqual";
  formula1?: string;
  formula2?: string;
  list?: string[];
  allowBlank: boolean;
  /** Product semantics: true shows the list; OOXML's showDropDown is inverted. */
  showDropdown?: boolean;
  showInput?: boolean;
  promptTitle?: string;
  prompt?: string;
  showError?: boolean;
  errorStyle?: "stop" | "warning" | "information";
  errorTitle?: string;
  error?: string;
};

export type XlsxRange = {
  start: { row: number; column: number };
  end: { row: number; column: number };
};

export type XlsxFilterValue =
  | { kind: "blank" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "error"; code: string };

export type XlsxSimpleFilterCondition =
  | {
      kind: "text";
      operator:
        | "contains"
        | "doesNotContain"
        | "beginsWith"
        | "doesNotBeginWith"
        | "endsWith"
        | "doesNotEndWith"
        | "equals"
        | "notEquals"
        | "greaterThan"
        | "greaterThanOrEqual"
        | "lessThan"
        | "lessThanOrEqual"
        | "between"
        | "notBetween";
      value: string;
      value2?: string;
    }
  | {
      kind: "number" | "date";
      operator:
        | "equals"
        | "notEquals"
        | "greaterThan"
        | "greaterThanOrEqual"
        | "lessThan"
        | "lessThanOrEqual"
        | "between"
        | "notBetween";
      value: number;
      value2?: number;
    };

export type XlsxFilterCondition =
  | XlsxSimpleFilterCondition
  | {
      kind: "compound";
      operator: "and" | "or";
      conditions: [XlsxSimpleFilterCondition, XlsxSimpleFilterCondition];
    }
  | { kind: "color"; target: "fill" | "text"; color: string | null }
  | { kind: "color-set"; target: "fill" | "text"; colors: Array<string | null> }
  | { kind: "rank"; bottom: boolean; percent: boolean; count: number }
  | { kind: "average"; above: boolean };

export type XlsxFilter = {
  range: XlsxRange;
  columns: Array<{
    column: number;
    allowedValues: XlsxFilterValue[];
    condition?: XlsxFilterCondition;
  }>;
};

export type XlsxOutlineGroup = {
  axis: "row" | "column";
  start: number;
  end: number;
  collapsed: boolean;
};

export type XlsxDataMetadata = {
  filter: XlsxFilter | null;
  /** Rows hidden to preserve an already-applied advanced filter result. */
  hiddenRows: number[];
  /** Rows hidden only to preserve a product multi-color filter's open state. */
  colorSetHiddenRows?: number[];
  dataValidations: XlsxDataValidation[];
  outlineGroups: XlsxOutlineGroup[];
  /** Zero-based first rows of subsequent printed pages. */
  pageBreakRows?: number[];
  /** Worksheet-wide outline summary placement. */
  summaryBelow?: boolean;
  unsupportedFilters: boolean;
  unsupportedValidations: boolean;
};

type WorksheetXml = { path: string; xml: string };

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
    if (normalized in named) return named[normalized] ?? entity;
    const point = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}

function encodeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match ? decodeXml(match[2] ?? "") : undefined;
}

function truthy(value: string | undefined): boolean {
  return /^(1|true)$/i.test(value?.trim() ?? "");
}

function columnIndex(label: string): number | null {
  let value = 0;
  for (const character of label.toUpperCase()) {
    if (character < "A" || character > "Z") return null;
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value > 0 ? value - 1 : null;
}

function columnLabel(column: number): string {
  let value = column + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function parseRange(reference: string): XlsxRange | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(reference.trim());
  if (!match) return null;
  const startColumn = columnIndex(match[1] ?? "");
  const endColumn = columnIndex(match[3] ?? match[1] ?? "");
  const startRow = Number(match[2]) - 1;
  const endRow = Number(match[4] ?? match[2]) - 1;
  if (startColumn === null || endColumn === null || startRow < 0 || endRow < 0) return null;
  return {
    start: { row: Math.min(startRow, endRow), column: Math.min(startColumn, endColumn) },
    end: { row: Math.max(startRow, endRow), column: Math.max(startColumn, endColumn) },
  };
}

function rangeReference(range: XlsxRange): string {
  return `${columnLabel(range.start.column)}${range.start.row + 1}:${columnLabel(range.end.column)}${range.end.row + 1}`;
}

function worksheetParts(bytes: Uint8Array): WorksheetXml[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) return [];
  const targets = new Map<string, string>();
  for (const relation of strFromU8(relationships).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attributes = relation[1] ?? "";
    const id = attribute(attributes, "Id");
    const target = attribute(attributes, "Target");
    const type = attribute(attributes, "Type");
    if (!id || !target || !/\/worksheet$/i.test(type ?? "")) continue;
    const pathSegments = target.replace(/^\/+/, "").split("/");
    const segments = target.startsWith("/") ? pathSegments : ["xl", ...pathSegments];
    const normalized = segments
      .reduce<string[]>((path, segment) => {
        if (!segment || segment === ".") return path;
        if (segment === "..") {
          path.pop();
          return path;
        }
        path.push(segment);
        return path;
      }, [])
      .join("/");
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(normalized)) targets.set(id, normalized);
  }
  const parts: WorksheetXml[] = [];
  for (const sheet of strFromU8(workbook).matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
    const path = targets.get(attribute(sheet[1] ?? "", "r:id") ?? "");
    const bytesForSheet = path ? entries[path] : undefined;
    if (path && bytesForSheet) parts.push({ path, xml: strFromU8(bytesForSheet) });
  }
  return parts;
}

function readInlineList(formula: string): string[] | undefined {
  if (!formula.startsWith('"') || !formula.endsWith('"')) return undefined;
  const values: string[] = [];
  let value = "";
  for (let index = 1; index < formula.length - 1; index += 1) {
    const character = formula[index] ?? "";
    if (character === '"' && formula[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

function readDataValidations(xml: string): { values: XlsxDataValidation[]; unsupported: boolean } {
  const container = /<dataValidations\b[^>]*>([\s\S]*?)<\/dataValidations>/i.exec(xml)?.[1];
  if (!container) return { values: [], unsupported: false };
  const values: XlsxDataValidation[] = [];
  let unsupported = false;
  for (const match of container.matchAll(
    /<dataValidation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/gi,
  )) {
    const attributes = match[1] ?? "";
    const type = attribute(attributes, "type") ?? "";
    if (!/^(whole|decimal|list|date|time|textLength|custom)$/.test(type)) {
      unsupported = true;
      continue;
    }
    const formulae = [
      ...(match[2] ?? "").matchAll(/<formula([12])\b[^>]*>([\s\S]*?)<\/formula\1>/gi),
    ]
      .sort((left, right) => Number(left[1]) - Number(right[1]))
      .map((formula) => decodeXml(formula[2] ?? ""));
    const operator = attribute(attributes, "operator") as
      | XlsxDataValidation["operator"]
      | undefined;
    if (
      operator &&
      !/^(between|notBetween|equal|notEqual|greaterThan|lessThan|greaterThanOrEqual|lessThanOrEqual)$/.test(
        operator,
      )
    ) {
      unsupported = true;
      continue;
    }
    const ranges = (attribute(attributes, "sqref") ?? "").split(/\s+/).filter(Boolean);
    for (const reference of ranges) {
      const range = parseRange(reference);
      if (!range) {
        unsupported = true;
        continue;
      }
      const formula1 = formulae[0];
      const list = type === "list" && formula1 ? readInlineList(formula1) : undefined;
      const errorStyle = attribute(attributes, "errorStyle");
      if (errorStyle && !/^(stop|warning|information)$/.test(errorStyle)) unsupported = true;
      values.push({
        range,
        type: type as XlsxDataValidation["type"],
        ...(operator ? { operator } : {}),
        ...(list ? { list } : formula1 !== undefined ? { formula1 } : {}),
        ...(formulae[1] !== undefined ? { formula2: formulae[1] } : {}),
        allowBlank: truthy(attribute(attributes, "allowBlank")),
        ...(attribute(attributes, "showDropDown") !== undefined
          ? { showDropdown: !truthy(attribute(attributes, "showDropDown")) }
          : {}),
        ...(attribute(attributes, "showInputMessage") === "0" ? { showInput: false } : {}),
        ...(attribute(attributes, "promptTitle")
          ? { promptTitle: attribute(attributes, "promptTitle") }
          : {}),
        ...(attribute(attributes, "prompt") ? { prompt: attribute(attributes, "prompt") } : {}),
        ...(attribute(attributes, "showErrorMessage") === "0" ? { showError: false } : {}),
        ...(errorStyle && /^(stop|warning|information)$/.test(errorStyle)
          ? { errorStyle: errorStyle as XlsxDataValidation["errorStyle"] }
          : {}),
        ...(attribute(attributes, "errorTitle")
          ? { errorTitle: attribute(attributes, "errorTitle") }
          : {}),
        ...(attribute(attributes, "error") ? { error: attribute(attributes, "error") } : {}),
      });
    }
  }
  return { values, unsupported };
}

function filterValue(value: string): XlsxFilterValue {
  const errors: Record<string, string> = {
    "#NULL!": "NULL",
    "#DIV/0!": "DIV0",
    "#VALUE!": "VALUE",
    "#REF!": "REF",
    "#NAME?": "NAME",
    "#NUM!": "NUM",
    "#N/A": "NA",
    "#SPILL!": "SPILL",
    "#CALC!": "CALC",
    "#GETTING_DATA": "GETTING_DATA",
    "#PARSE!": "PARSE",
    "#CYCLE!": "CYCLE",
  };
  if (errors[value]) return { kind: "error", code: errors[value]! };
  if (/^(true|false)$/i.test(value)) return { kind: "boolean", value: /^true$/i.test(value) };
  const numeric = Number(value);
  return value !== "" && Number.isFinite(numeric)
    ? { kind: "number", value: numeric }
    : { kind: "string", value };
}

function decodeCustomFilter(
  operator: string | undefined,
  value: string,
): XlsxSimpleFilterCondition | null {
  const comparison = operator ?? "equal";
  if ((comparison === "equal" || comparison === "notEqual") && /[~*?]/.test(value)) {
    const starts = value.startsWith("*");
    const trailingEscapes = /(~*)\*$/.exec(value)?.[1]?.length ?? 0;
    const ends = value.endsWith("*") && trailingEscapes % 2 === 0;
    const raw = value.slice(starts ? 1 : 0, ends ? -1 : undefined);
    if (comparison === "notEqual" && starts && ends)
      return { kind: "text", operator: "doesNotContain", value: raw };
    if (comparison === "equal" && starts && ends)
      return { kind: "text", operator: "contains", value: raw };
    if (comparison === "notEqual" && starts)
      return { kind: "text", operator: "doesNotEndWith", value: raw };
    if (comparison === "notEqual" && ends)
      return { kind: "text", operator: "doesNotBeginWith", value: raw };
    if (comparison === "equal" && starts) return { kind: "text", operator: "endsWith", value: raw };
    if (comparison === "equal" && ends) return { kind: "text", operator: "beginsWith", value: raw };
    if (comparison === "equal") return { kind: "text", operator: "equals", value };
    if (comparison === "notEqual") return { kind: "text", operator: "notEquals", value };
    return null;
  }
  const numeric = Number(value);
  if (value.trim() !== "" && Number.isFinite(numeric)) {
    const map: Record<
      string,
      Extract<XlsxSimpleFilterCondition, { kind: "number" | "date" }>["operator"]
    > = {
      equal: "equals",
      notEqual: "notEquals",
      greaterThan: "greaterThan",
      greaterThanOrEqual: "greaterThanOrEqual",
      lessThan: "lessThan",
      lessThanOrEqual: "lessThanOrEqual",
    };
    const conditionOperator = map[comparison];
    return conditionOperator
      ? { kind: "number", operator: conditionOperator, value: numeric }
      : null;
  }
  if (comparison === "equal") return { kind: "text", operator: "equals", value };
  if (comparison === "notEqual") return { kind: "text", operator: "notEquals", value };
  if (["greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual"].includes(comparison))
    return {
      kind: "text",
      operator: comparison as Extract<XlsxSimpleFilterCondition, { kind: "text" }>["operator"],
      value,
    };
  return null;
}

function excelSerial(year: number, month: number, day: number): number {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function dateGroupCondition(body: string): XlsxSimpleFilterCondition | null {
  const groups = [...body.matchAll(/<dateGroupItem\b([^>]*)\/?\s*>/gi)];
  if (groups.length !== 1) return null;
  const attrs = groups[0]?.[1] ?? "";
  const year = Number(attribute(attrs, "year"));
  const month = Number(attribute(attrs, "month"));
  const day = Number(attribute(attrs, "day"));
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return null;
  const hasMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const hasDay = hasMonth && Number.isInteger(day) && day >= 1 && day <= 31;
  const start = excelSerial(year, hasMonth ? month : 1, hasDay ? day : 1);
  if (hasDay) return { kind: "date", operator: "equals", value: start };
  const end = hasMonth ? excelSerial(year, month + 1, 1) - 1 : excelSerial(year + 1, 1, 1) - 1;
  return { kind: "date", operator: "between", value: start, value2: end };
}

function readColorFilter(body: string, dxfs: readonly string[]): XlsxFilterCondition | null {
  const match = /<colorFilter\b([^>]*)\/?\s*>/i.exec(body);
  if (!match) return null;
  const attrs = match[1] ?? "";
  const dxfId = Number(attribute(attrs, "dxfId"));
  if (!Number.isInteger(dxfId) || dxfId < 0 || !dxfs[dxfId]) return null;
  const target = truthy(attribute(attrs, "cellColor") ?? "1") ? "fill" : "text";
  const dxf = readXlsxDxfStyle(dxfs[dxfId]);
  if (dxf.unsupported) return null;
  if (target === "fill") {
    if (typeof dxf.style.fillColor === "string")
      return { kind: "color", target, color: dxf.style.fillColor };
    if (dxf.style.fillColor === false) return { kind: "color", target, color: null };
  } else if (typeof dxf.style.textColor === "string")
    return { kind: "color", target, color: dxf.style.textColor };
  return null;
}

const PRODUCT_COLOR_FILTER_SETS_URI = "{F05D2C50-AD53-4CE0-8F27-4BE69CF538D1}";
const PRODUCT_COLOR_FILTER_SETS_NAMESPACE = "https://idea10.dev/xlsx/filter/v1";

function productColorFilterSetExtension(xml: string): string | null {
  const extension = new RegExp(
    `<ext\\b(?=[^>]*\\buri=["']${PRODUCT_COLOR_FILTER_SETS_URI.replace(/[{}]/g, "\\$&")}["'])[^>]*>([\\s\\S]*?)<\\/ext>`,
    "i",
  ).exec(xml);
  return extension?.[1] ?? null;
}

function readProductColorFilterSets(xml: string, filter: XlsxFilter | null): XlsxFilter | null {
  if (!filter) return filter;
  const extension = productColorFilterSetExtension(xml);
  if (!extension) return filter;
  const columns = filter.columns.map((column) => ({ ...column }));
  for (const entry of extension.matchAll(
    /<idea10:colorFilterSet\b([^>]*)>([\s\S]*?)<\/idea10:colorFilterSet>/gi,
  )) {
    const attributes = entry[1] ?? "";
    const column = Number(attribute(attributes, "column"));
    const target = attribute(attributes, "target");
    if (
      !Number.isInteger(column) ||
      column < filter.range.start.column ||
      column > filter.range.end.column ||
      (target !== "fill" && target !== "text")
    )
      continue;
    const colors = [...(entry[2] ?? "").matchAll(/<idea10:color\b([^>]*)\/?\s*>/gi)]
      .map((color) => attribute(color[1] ?? "", "value"))
      .filter(
        (color): color is string => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
      )
      .map((color) => color.toLowerCase());
    const hasNoFill = /<idea10:noFill\s*\/?\s*>/i.test(entry[2] ?? "");
    const normalized = [...new Set([...colors, ...(hasNoFill ? [null] : [])])];
    if (!normalized.length || (target === "text" && hasNoFill)) continue;
    const index = columns.findIndex((candidate) => candidate.column === column);
    const condition: XlsxFilterCondition = {
      kind: "color-set",
      target,
      colors: normalized,
    };
    if (index === -1) columns.push({ column, allowedValues: [], condition });
    else columns[index] = { ...columns[index]!, condition };
  }
  return { ...filter, columns };
}

function readProductColorFilterSetHiddenRows(xml: string): number[] {
  const extension = productColorFilterSetExtension(xml);
  const container = extension
    ? /<idea10:colorFilterSets\b([^>]*)>/i.exec(extension)?.[1]
    : undefined;
  const rows = attribute(container ?? "", "hiddenRows");
  if (!rows) return [];
  return [
    ...new Set(
      rows
        .split(",")
        .map(Number)
        .filter((row) => Number.isInteger(row) && row >= 0),
    ),
  ];
}

export function readXlsxAutoFilter(
  xml: string,
  dxfs: readonly string[] = [],
): {
  value: XlsxFilter | null;
  unsupported: boolean;
} {
  const match = /<autoFilter\b([^>]*)(?:\/>|>([\s\S]*?)<\/autoFilter>)/i.exec(xml);
  if (!match) return { value: null, unsupported: false };
  const range = parseRange(attribute(match[1] ?? "", "ref") ?? "");
  if (!range) return { value: null, unsupported: true };
  const columns: XlsxFilter["columns"] = [];
  let unsupported = false;
  for (const column of (match[2] ?? "").matchAll(
    /<filterColumn\b([^>]*)>([\s\S]*?)<\/filterColumn>/gi,
  )) {
    const offset = Number(attribute(column[1] ?? "", "colId"));
    if (!Number.isInteger(offset) || offset < 0 || range.start.column + offset > range.end.column) {
      unsupported = true;
      continue;
    }
    const body = column[2] ?? "";
    const allowedValues: XlsxFilterValue[] = [];
    let condition: XlsxFilterCondition | undefined;
    const filters = /<filters\b([^>]*)>([\s\S]*?)<\/filters>/i.exec(body);
    if (filters) {
      if (truthy(attribute(filters[1] ?? "", "blank"))) allowedValues.push({ kind: "blank" });
      for (const item of (filters[2] ?? "").matchAll(/<filter\b([^>]*)\/?\s*>/gi)) {
        const value = attribute(item[1] ?? "", "val");
        if (value === undefined) unsupported = true;
        else allowedValues.push(filterValue(value));
      }
      const dateCondition = dateGroupCondition(filters[2] ?? "");
      if (/<dateGroupItem\b/i.test(filters[2] ?? "") && !dateCondition) unsupported = true;
      if (dateCondition && allowedValues.length === 0) condition = dateCondition;
    }
    const custom = /<customFilters\b([^>]*)>([\s\S]*?)<\/customFilters>/i.exec(body);
    if (custom) {
      const criteria = [...(custom[2] ?? "").matchAll(/<customFilter\b([^>]*)\/?\s*>/gi)];
      if (criteria.length === 1) {
        const value = attribute(criteria[0]?.[1] ?? "", "val");
        condition =
          value === undefined
            ? undefined
            : (decodeCustomFilter(attribute(criteria[0]?.[1] ?? "", "operator"), value) ??
              undefined);
        if (!condition) unsupported = true;
      } else if (criteria.length === 2) {
        const first = attribute(criteria[0]?.[1] ?? "", "val");
        const second = attribute(criteria[1]?.[1] ?? "", "val");
        const left =
          first === undefined
            ? null
            : decodeCustomFilter(attribute(criteria[0]?.[1] ?? "", "operator"), first);
        const right =
          second === undefined
            ? null
            : decodeCustomFilter(attribute(criteria[1]?.[1] ?? "", "operator"), second);
        const operator = truthy(attribute(custom[1] ?? "", "and")) ? "and" : "or";
        if (left?.kind === "number" && right?.kind === "number" && left.kind === right.kind) {
          const between =
            operator === "and" &&
            (left.operator === "greaterThan" || left.operator === "greaterThanOrEqual") &&
            (right.operator === "lessThan" || right.operator === "lessThanOrEqual");
          const notBetween =
            operator === "or" && left.operator === "lessThan" && right.operator === "greaterThan";
          if (between || notBetween)
            condition = {
              kind: "number",
              operator: between ? "between" : "notBetween",
              value: left.value,
              value2: right.value,
            };
          else
            condition = {
              kind: "compound",
              operator,
              conditions: [left, right],
            };
        } else if (left && right) {
          condition = {
            kind: "compound",
            operator,
            conditions: [left, right],
          };
        } else unsupported = true;
      } else unsupported = true;
    }
    const top10 = /<top10\b([^>]*)\/?\s*>/i.exec(body);
    if (top10) {
      const attrs = top10[1] ?? "";
      const count = Number(attribute(attrs, "val") ?? "10");
      const percent = truthy(attribute(attrs, "percent"));
      if (
        Number.isFinite(count) &&
        count > 0 &&
        (percent ? count <= 100 : Number.isInteger(count) && count <= 500)
      )
        condition = {
          kind: "rank",
          count,
          bottom: !truthy(attribute(attrs, "top") ?? "1"),
          percent,
        };
      else unsupported = true;
    }
    const dynamic = /<dynamicFilter\b([^>]*)\/?\s*>/i.exec(body);
    if (dynamic) {
      const type = attribute(dynamic[1] ?? "", "type");
      if (type === "aboveAverage" || type === "belowAverage")
        condition = { kind: "average", above: type === "aboveAverage" };
      else unsupported = true;
    }
    const color = /<colorFilter\b/i.test(body) ? readColorFilter(body, dxfs) : undefined;
    if (color) condition = color;
    else if (/<colorFilter\b/i.test(body)) unsupported = true;
    if (!filters && !custom && !top10 && !dynamic && !/<colorFilter\b/i.test(body))
      unsupported = true;
    columns.push({
      column: range.start.column + offset,
      allowedValues,
      ...(condition ? { condition } : {}),
    });
  }
  return { value: readProductColorFilterSets(xml, { range, columns }), unsupported };
}

function groupsFromLevels(
  axis: XlsxOutlineGroup["axis"],
  levels: ReadonlyMap<number, number>,
  collapsedMarkers: ReadonlySet<number>,
): XlsxOutlineGroup[] {
  const groups: XlsxOutlineGroup[] = [];
  const maximum = Math.max(0, ...levels.values());
  for (let level = 1; level <= maximum; level += 1) {
    const indices = [...levels.entries()]
      .filter(([, candidate]) => candidate >= level)
      .map(([index]) => index)
      .sort((left, right) => left - right);
    let start: number | undefined;
    let end: number | undefined;
    const finish = () => {
      if (start === undefined || end === undefined) return;
      // Excel stores the collapsed flag on the summary axis immediately after a
      // group (or on its final axis when summary-before is used). Either marker
      // maps to the same product-level collapsed group state.
      groups.push({
        axis,
        start,
        end,
        collapsed: collapsedMarkers.has(end) || collapsedMarkers.has(end + 1),
      });
      start = undefined;
      end = undefined;
    };
    for (const index of indices) {
      if (start === undefined || index !== end! + 1) {
        finish();
        start = index;
      }
      end = index;
    }
    finish();
  }
  return groups;
}

function readOutlineGroups(xml: string): XlsxOutlineGroup[] {
  const rowLevels = new Map<number, number>();
  const rowCollapsed = new Set<number>();
  for (const row of xml.matchAll(/<row\b([^>]*)\/?\s*>/gi)) {
    const attributes = row[1] ?? "";
    const level = Number(attribute(attributes, "outlineLevel"));
    const number = Number(attribute(attributes, "r"));
    if (!Number.isInteger(number) || number < 1) continue;
    if (Number.isInteger(level) && level > 0) rowLevels.set(number - 1, level);
    if (truthy(attribute(attributes, "collapsed"))) rowCollapsed.add(number - 1);
  }
  const columnLevels = new Map<number, number>();
  const columnCollapsed = new Set<number>();
  for (const column of xml.matchAll(/<col\b([^>]*)\/?\s*>/gi)) {
    const attributes = column[1] ?? "";
    const level = Number(attribute(attributes, "outlineLevel"));
    const start = Number(attribute(attributes, "min"));
    const end = Number(attribute(attributes, "max"));
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;
    for (let index = start - 1; index < end; index += 1) {
      if (Number.isInteger(level) && level > 0) columnLevels.set(index, level);
      if (truthy(attribute(attributes, "collapsed"))) columnCollapsed.add(index);
    }
  }
  return [
    ...groupsFromLevels("row", rowLevels, rowCollapsed),
    ...groupsFromLevels("column", columnLevels, columnCollapsed),
  ];
}

export function readXlsxDataMetadata(bytes: Uint8Array): XlsxDataMetadata[] {
  const entries = unzipSync(bytes);
  const dxfs = readXlsxDxfEntries(strFromU8(entries["xl/styles.xml"] ?? new Uint8Array()));
  return worksheetParts(bytes).map(({ xml }) => {
    const filter = readXlsxAutoFilter(xml, dxfs);
    const validations = readDataValidations(xml);
    return {
      filter: filter.value,
      hiddenRows: [],
      colorSetHiddenRows: readProductColorFilterSetHiddenRows(xml),
      dataValidations: validations.values,
      outlineGroups: readOutlineGroups(xml),
      unsupportedFilters: filter.unsupported,
      unsupportedValidations: validations.unsupported,
    };
  });
}

function inlineList(values: readonly string[]): string {
  return `"${values.map((value) => value.replace(/"/g, '""')).join(",")}"`;
}

function validationXml(validation: XlsxDataValidation): string {
  const attributes = [
    `type="${validation.type}"`,
    validation.operator && validation.type !== "list" && validation.type !== "custom"
      ? `operator="${validation.operator}"`
      : "",
    validation.allowBlank ? 'allowBlank="1"' : "",
    validation.showDropdown === false
      ? 'showDropDown="1"'
      : validation.showDropdown === true
        ? 'showDropDown="0"'
        : "",
    validation.showInput === false ? 'showInputMessage="0"' : "",
    validation.promptTitle ? `promptTitle="${encodeXml(validation.promptTitle)}"` : "",
    validation.prompt ? `prompt="${encodeXml(validation.prompt)}"` : "",
    validation.showError === false ? 'showErrorMessage="0"' : "",
    validation.errorStyle ? `errorStyle="${validation.errorStyle}"` : "",
    validation.errorTitle ? `errorTitle="${encodeXml(validation.errorTitle)}"` : "",
    validation.error ? `error="${encodeXml(validation.error)}"` : "",
    `sqref="${rangeReference(validation.range)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  const formula1 =
    validation.type === "list" && validation.list
      ? inlineList(validation.list)
      : validation.formula1;
  return `<dataValidation ${attributes}>${formula1 !== undefined ? `<formula1>${encodeXml(formula1)}</formula1>` : ""}${validation.formula2 !== undefined ? `<formula2>${encodeXml(validation.formula2)}</formula2>` : ""}</dataValidation>`;
}

function customCriterion(condition: XlsxSimpleFilterCondition): string[] | null {
  if (condition.kind === "text") {
    const pattern = condition.value;
    const map: Partial<Record<typeof condition.operator, [string, string]>> = {
      contains: ["equal", `*${pattern}*`],
      doesNotContain: ["notEqual", `*${pattern}*`],
      beginsWith: ["equal", `${pattern}*`],
      doesNotBeginWith: ["notEqual", `${pattern}*`],
      endsWith: ["equal", `*${pattern}`],
      doesNotEndWith: ["notEqual", `*${pattern}`],
      greaterThan: ["greaterThan", pattern],
      greaterThanOrEqual: ["greaterThanOrEqual", pattern],
      lessThan: ["lessThan", pattern],
      lessThanOrEqual: ["lessThanOrEqual", pattern],
      equals: ["equal", pattern],
      notEquals: ["notEqual", pattern],
    };
    return map[condition.operator] ?? null;
  }
  const map: Record<string, string> = {
    equals: "equal",
    notEquals: "notEqual",
    greaterThan: "greaterThan",
    greaterThanOrEqual: "greaterThanOrEqual",
    lessThan: "lessThan",
    lessThanOrEqual: "lessThanOrEqual",
  };
  const operator = map[condition.operator];
  return operator ? [operator, String(condition.value)] : null;
}

function dateGroupXml(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86_400_000);
  if (Number.isNaN(date.getTime())) return null;
  return `<filters><dateGroupItem year="${date.getUTCFullYear()}" month="${date.getUTCMonth() + 1}" day="${date.getUTCDate()}" dateTimeGrouping="day"/></filters>`;
}

export function writeXlsxAutoFilter(
  filter: XlsxFilter,
  options?: { colorDxfId?: (condition: Extract<XlsxFilterCondition, { kind: "color" }>) => number },
): string {
  const columns = filter.columns
    .map((column) => {
      // OOXML can express exactly one color criterion. A color-set is stored
      // in the product extension below, so do not reinterpret it as matching
      // its cell values (equal values may have different colors).
      if (column.condition?.kind === "color-set" && column.allowedValues.length === 0) return "";
      const offset = column.column - filter.range.start.column;
      const values = column.allowedValues;
      const blanks = values.some((value) => value.kind === "blank");
      const items = values
        .filter((value) => value.kind !== "blank")
        .map((value) => {
          const errorTokens: Record<string, string> = {
            NULL: "#NULL!",
            DIV0: "#DIV/0!",
            VALUE: "#VALUE!",
            REF: "#REF!",
            NAME: "#NAME?",
            NUM: "#NUM!",
            NA: "#N/A",
            SPILL: "#SPILL!",
            CALC: "#CALC!",
            GETTING_DATA: "#GETTING_DATA",
            PARSE: "#PARSE!",
            CYCLE: "#CYCLE!",
          };
          const text =
            value.kind === "error"
              ? (errorTokens[value.code] ?? `#${value.code}`)
              : String(value.value);
          return `\n<filter val="${encodeXml(text)}"/>`;
        })
        .join("");
      let filters = values.length ? `<filters${blanks ? ' blank="1"' : ""}>${items}</filters>` : "";
      let custom = "";
      if (column.condition) {
        if (column.condition.kind === "compound") {
          const criteria = column.condition.conditions.map(customCriterion);
          if (criteria.every((criterion): criterion is string[] => criterion !== null))
            custom = `<customFilters${column.condition.operator === "and" ? ' and="1"' : ""}>${criteria.map((criterion) => `<customFilter operator="${criterion[0]!}" val="${encodeXml(criterion[1]!)}"/>`).join("")}</customFilters>`;
        } else if (column.condition.kind === "date" && column.condition.operator === "equals") {
          filters = dateGroupXml(column.condition.value) ?? filters;
        } else if (
          (column.condition.kind === "number" ||
            column.condition.kind === "date" ||
            column.condition.kind === "text") &&
          (column.condition.operator === "between" || column.condition.operator === "notBetween") &&
          column.condition.value2 !== undefined
        ) {
          const lower = column.condition.operator === "between" ? "greaterThanOrEqual" : "lessThan";
          const upper = column.condition.operator === "between" ? "lessThanOrEqual" : "greaterThan";
          custom = `<customFilters${column.condition.operator === "between" ? ' and="1"' : ""}><customFilter operator="${lower}" val="${encodeXml(String(column.condition.value))}"/><customFilter operator="${upper}" val="${encodeXml(String(column.condition.value2))}"/></customFilters>`;
        } else if (
          column.condition.kind === "text" ||
          column.condition.kind === "number" ||
          column.condition.kind === "date"
        ) {
          const criterion = customCriterion(column.condition);
          if (criterion)
            custom = `<customFilters><customFilter operator="${criterion[0]!}" val="${encodeXml(criterion[1]!)}"/></customFilters>`;
        }
      }
      const special =
        column.condition?.kind === "rank"
          ? `<top10 val="${column.condition.count}"${column.condition.percent ? ' percent="1"' : ""}${column.condition.bottom ? ' top="0"' : ""}/>`
          : column.condition?.kind === "average"
            ? `<dynamicFilter type="${column.condition.above ? "aboveAverage" : "belowAverage"}"/>`
            : column.condition?.kind === "color"
              ? `<colorFilter dxfId="${options?.colorDxfId?.(column.condition) ?? 0}"${column.condition.target === "fill" ? ' cellColor="1"' : ' cellColor="0"'}/>`
              : "";
      return `<filterColumn colId="${offset}">${filters}${custom}${special}</filterColumn>`;
    })
    .join("");
  return `<autoFilter ref="${rangeReference(filter.range)}">${columns}</autoFilter>`;
}

/**
 * OOXML's colorFilter is singular.  A multi-color filter is retained in this
 * product extension. Only an explicitly supplied value criterion is emitted;
 * deriving values from colors would falsely narrow the file.
 */
function writeProductColorFilterSets(
  filter: XlsxFilter | null,
  hiddenRows: readonly number[] = [],
): string {
  const entries = (filter?.columns ?? [])
    .filter((column) => column.condition?.kind === "color-set")
    .map((column) => {
      const condition = column.condition as Extract<XlsxFilterCondition, { kind: "color-set" }>;
      const colors = condition.colors
        .map((color) =>
          color === null
            ? "<idea10:noFill/>"
            : `<idea10:color value="${encodeXml(color.toUpperCase())}"/>`,
        )
        .join("");
      return `<idea10:colorFilterSet column="${column.column}" target="${condition.target}">${colors}</idea10:colorFilterSet>`;
    })
    .join("");
  return entries || hiddenRows.length
    ? `<ext uri="${PRODUCT_COLOR_FILTER_SETS_URI}"><idea10:colorFilterSets xmlns:idea10="${PRODUCT_COLOR_FILTER_SETS_NAMESPACE}"${hiddenRows.length ? ` hiddenRows="${hiddenRows.join(",")}"` : ""}>${entries}</idea10:colorFilterSets></ext>`
    : "";
}

function writeProductColorFilterSetExtension(
  xml: string,
  filter: XlsxFilter | null,
  hiddenRows: readonly number[] = [],
): string {
  const extension = writeProductColorFilterSets(filter, hiddenRows);
  if (!extension) return xml;
  const existing = new RegExp(
    `<ext\\b(?=[^>]*\\buri=["']${PRODUCT_COLOR_FILTER_SETS_URI.replace(/[{}]/g, "\\$&")}["'])[^>]*(?:\\/>|>[\\s\\S]*?<\\/ext>)`,
    "i",
  );
  const withoutExisting = xml.replace(existing, "");
  if (/<extLst\b[^>]*\/>/i.test(withoutExisting))
    return withoutExisting.replace(/<extLst\b[^>]*\/>/i, `<extLst>${extension}</extLst>`);
  if (/<extLst\b[^>]*>/i.test(withoutExisting))
    return withoutExisting.replace(/<\/extLst>/i, `${extension}</extLst>`);
  if (/<\/worksheet>/i.test(withoutExisting))
    return withoutExisting.replace(/<\/worksheet>/i, `<extLst>${extension}</extLst></worksheet>`);
  return withoutExisting.replace(/<\/table>/i, `<extLst>${extension}</extLst></table>`);
}

/**
 * Color filters address differential styles by global styles.xml index. This runs
 * after conditional-format and table-style writers have allocated their DXFs, then
 * rewrites only the autoFilters owned by the export workbook.
 */
export function writeXlsxFilterColorFormats(
  entries: Record<string, Uint8Array>,
  sheets: readonly {
    filter: XlsxFilter | null;
    tables?: readonly { name: string; filter: XlsxFilter | null }[];
  }[],
): void {
  const styles = entries["xl/styles.xml"];
  if (!styles) throw new Error("Missing generated XLSX styles.");
  if (
    !sheets.some(
      (sheet) =>
        sheet.filter?.columns.some(
          (column) => column.condition?.kind === "color" || column.condition?.kind === "color-set",
        ) ||
        sheet.tables?.some((table) =>
          table.filter?.columns.some(
            (column) =>
              column.condition?.kind === "color" || column.condition?.kind === "color-set",
          ),
        ),
    )
  )
    return;
  const source = strFromU8(styles);
  const dxfs = readXlsxDxfEntries(source).map((entry) => `<dxf>${entry}</dxf>`);
  const ids = new Map<string, number>();
  dxfs.forEach((xml, index) => ids.set(xml, index));
  const dxfId = (condition: Extract<XlsxFilterCondition, { kind: "color" }>) => {
    const xml =
      condition.target === "fill"
        ? xlsxDxfXml(
            condition.color === null
              ? { fillColor: null, fillPattern: null }
              : { fillColor: condition.color },
          )
        : xlsxDxfXml({ textColor: condition.color ?? "#000000" });
    let id = ids.get(xml);
    if (id === undefined) {
      id = dxfs.length;
      dxfs.push(xml);
      ids.set(xml, id);
    }
    return id;
  };
  const options = { colorDxfId: dxfId };
  for (const [index, sheet] of sheets.entries()) {
    if (!sheet.filter) continue;
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    const xml = strFromU8(entry);
    entries[path] = strToU8(
      xml.replace(
        /<autoFilter\b[^>]*(?:\/>|>[\s\S]*?<\/autoFilter>)/i,
        writeXlsxAutoFilter(sheet.filter, options),
      ),
    );
  }
  const tables = new Map(
    sheets.flatMap((sheet) =>
      (sheet.tables ?? []).flatMap((table) =>
        table.filter ? [[table.name, table.filter] as const] : [],
      ),
    ),
  );
  for (const [path, entry] of Object.entries(entries)) {
    if (!/^xl\/tables\/table\d+\.xml$/i.test(path)) continue;
    const xml = strFromU8(entry);
    const name = /<table\b([^>]*)>/i.exec(xml)?.[1];
    const filter = name
      ? tables.get(attribute(name, "displayName") ?? attribute(name, "name") ?? "")
      : undefined;
    if (!filter) continue;
    entries[path] = strToU8(
      xml.replace(
        /<autoFilter\b[^>]*(?:\/>|>[\s\S]*?<\/autoFilter>)/i,
        writeXlsxAutoFilter(filter, options),
      ),
    );
    entries[path] = strToU8(writeProductColorFilterSetExtension(strFromU8(entries[path]!), filter));
  }
  const dxfContainer = `<dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs>`;
  entries["xl/styles.xml"] = strToU8(
    /<dxfs\b[^>]*>[\s\S]*?<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i.test(source)
      ? source.replace(/<dxfs\b[^>]*>[\s\S]*?<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i, dxfContainer)
      : source.replace(/<tableStyles\b/i, `${dxfContainer}<tableStyles`),
  );
}

function replaceElement(xml: string, tag: string, replacement: string, after: RegExp): string {
  const expression = new RegExp(`<${tag}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`, "i");
  if (expression.test(xml)) return xml.replace(expression, replacement);
  return xml.replace(after, (match) => `${match}${replacement}`);
}

function outlineLevel(
  groups: readonly XlsxOutlineGroup[],
  axis: XlsxOutlineGroup["axis"],
  index: number,
): number {
  return groups.filter((group) => group.axis === axis && group.start <= index && group.end >= index)
    .length;
}

function writeOutlineGroups(xml: string, groups: readonly XlsxOutlineGroup[]): string {
  let output = xml;
  const rows = groups.filter((group) => group.axis === "row");
  const columns = groups.filter((group) => group.axis === "column");
  const rowIndices = new Set(
    rows.flatMap((group) => [
      ...Array.from({ length: group.end - group.start + 1 }, (_, index) => group.start + index),
      ...(group.collapsed && group.end < 1_048_575 ? [group.end + 1] : []),
    ]),
  );
  for (const row of [...rowIndices].sort((left, right) => left - right)) {
    const level = outlineLevel(groups, "row", row);
    const collapsed = rows.some((group) => group.collapsed && group.end + 1 === row);
    const hidden = rows.some((group) => group.collapsed && group.start <= row && group.end >= row);
    const expression = new RegExp(`(<row\\b(?=[^>]*\\br=["']${row + 1}["'])[^>]*)(/?>)`, "i");
    if (expression.test(output)) {
      output = output.replace(expression, (_match, start: string, close: string) => {
        const normalized = start.replace(/\s(?:outlineLevel|collapsed)=["'][^"']*["']/gi, "");
        const hasHidden = /\bhidden=["'](?:1|true)["']/i.test(normalized);
        return `${normalized}${level ? ` outlineLevel="${level}"` : ""}${hidden && !hasHidden ? ' hidden="1"' : ""}${collapsed ? ' collapsed="1"' : ""}${close}`;
      });
    } else {
      output = output.replace(
        /<\/sheetData>/i,
        `<row r="${row + 1}"${level ? ` outlineLevel="${level}"` : ""}${hidden ? ' hidden="1"' : ""}${collapsed ? ' collapsed="1"' : ""}/></sheetData>`,
      );
    }
  }
  if (columns.length) {
    const min = Math.min(...columns.map((group) => group.start)) + 1;
    const max =
      Math.max(
        ...columns.map((group) => group.end + (group.collapsed && group.end < 16_383 ? 1 : 0)),
      ) + 1;
    const additions: string[] = [];
    for (let column = min - 1; column < max; column += 1) {
      const level = outlineLevel(groups, "column", column);
      const collapsed = columns.some((group) => group.collapsed && group.end + 1 === column);
      const hidden = columns.some(
        (group) => group.collapsed && group.start <= column && group.end >= column,
      );
      const expression = new RegExp(
        `(<col\\b(?=[^>]*\\bmin=["']${column + 1}["'])(?=[^>]*\\bmax=["']${column + 1}["'])[^>]*)(/?>)`,
        "i",
      );
      if (expression.test(output)) {
        output = output.replace(expression, (_match, start: string, close: string) => {
          const normalized = start.replace(/\s(?:outlineLevel|collapsed)=["'][^"']*["']/gi, "");
          const hasHidden = /\bhidden=["'](?:1|true)["']/i.test(normalized);
          return `${normalized}${level ? ` outlineLevel="${level}"` : ""}${hidden && !hasHidden ? ' hidden="1"' : ""}${collapsed ? ' collapsed="1"' : ""}${close}`;
        });
      } else {
        additions.push(
          `<col min="${column + 1}" max="${column + 1}" outlineLevel="${level}"${hidden ? ' hidden="1"' : ""}${collapsed ? ' collapsed="1"' : ""} customWidth="1"/>`,
        );
      }
    }
    if (additions.length) {
      if (/<cols\b[^>]*>/i.test(output))
        output = output.replace(/<\/cols>/i, `${additions.join("")}</cols>`);
      else
        output = output.replace(
          /<sheetFormatPr\b[^>]*\/?\s*>/i,
          (match) => `${match}<cols>${additions.join("")}</cols>`,
        );
    }
  }
  return output;
}

/**
 * `outlinePr` is worksheet-wide.  We only write it when subtotal metadata
 * explicitly selected a placement, preserving the existing ExcelJS default for
 * workbooks that have no subtotal layout option.
 */
function writeOutlineSummaryBelow(xml: string, summaryBelow: boolean | undefined): string {
  if (summaryBelow === undefined) return xml;
  const outline = (attributes = "") =>
    `<outlinePr${attributes.replace(/\ssummaryBelow\s*=\s*(["'])[^"']*\1/gi, "")} summaryBelow="${summaryBelow ? "1" : "0"}"/>`;
  const existing = /<outlinePr\b([^>]*?)(?:\/>|>[\s\S]*?<\/outlinePr>)/i;
  if (existing.test(xml))
    return xml.replace(existing, (_match, attributes: string) => outline(attributes));
  const sheetPr = /<sheetPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/sheetPr>)/i;
  if (sheetPr.test(xml))
    return xml.replace(
      sheetPr,
      (_match, attributes: string, content?: string) =>
        `<sheetPr${attributes}>${content ?? ""}${outline()}</sheetPr>`,
    );
  return xml.replace(/<worksheet\b[^>]*>/i, (match) => `${match}<sheetPr>${outline()}</sheetPr>`);
}

/**
 * OOXML `brk@id` is the one-based final row of the preceding page.  Product
 * metadata instead names the zero-based first row on the following page, so
 * both values are numerically identical (for example, row 3 starts Excel row
 * 4 and writes id=3).  Apache POI uses the same conversion in XSSFSheet.
 */
function writeRowBreaks(xml: string, rows: readonly number[] | undefined): string {
  if (rows === undefined) return xml;
  const output = xml.replace(/<rowBreaks\b[^>]*(?:\/>|>[\s\S]*?<\/rowBreaks>)/i, "");
  const breaks = [...new Set(rows)]
    .filter(Number.isInteger)
    .filter((row) => row >= 1 && row < 1_048_576)
    .sort((left, right) => left - right);
  if (!breaks.length) return output;
  const rowBreaks = `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((row) => `<brk id="${row}" max="16383" man="1"/>`).join("")}</rowBreaks>`;
  const after = /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/i.test(output)
    ? /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/i
    : /<pageSetup\b[^>]*\/>/i.test(output)
      ? /<pageSetup\b[^>]*\/>/i
      : /<pageMargins\b[^>]*\/>/i.test(output)
        ? /<pageMargins\b[^>]*\/>/i
        : /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/i;
  return output.replace(after, (match) => `${match}${rowBreaks}`);
}

/**
 * Excel AutoFilter cannot represent Advanced Filter criteria. The generated
 * workbook still needs to open with the same rows visible, including blank
 * rows which ExcelJS does not materialize when only `row.hidden` is assigned.
 */
function writeHiddenRows(xml: string, rows: readonly number[]): string {
  const hiddenRows = [...new Set(rows)]
    .filter(Number.isInteger)
    .filter((value) => value >= 0 && value < 1_048_576)
    .sort((left, right) => left - right);
  if (hiddenRows.length === 0) return xml;
  const sheetData = /<sheetData\b([^>]*?)(?:\/>|>([\s\S]*?)<\/sheetData>)/i.exec(xml);
  if (!sheetData) return xml;
  const attributes = sheetData[1] ?? "";
  const content = sheetData[2] ?? "";
  const rowElements = /<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/gi;
  let nextHidden = 0;
  const patched = content.replace(rowElements, (element) => {
    const opening = /<row\b([^>]*?)(\/?)>/i.exec(element);
    const rowNumber = opening ? Number(attribute(opening[1] ?? "", "r")) : Number.NaN;
    const rowIndex = rowNumber - 1;
    let additions = "";
    while (nextHidden < hiddenRows.length && hiddenRows[nextHidden]! < rowIndex) {
      additions += `<row r="${hiddenRows[nextHidden]! + 1}" hidden="1"/>`;
      nextHidden += 1;
    }
    if (hiddenRows[nextHidden] !== rowIndex || !opening) return `${additions}${element}`;
    nextHidden += 1;
    const original = opening[1] ?? "";
    const normalized = original.replace(/\shidden\s*=\s*(["'])[^"']*\1/gi, "");
    const replacement = `<row${normalized} hidden="1"${opening[2] ?? ""}>`;
    return `${additions}${element.replace(opening[0], replacement)}`;
  });
  const trailing = hiddenRows
    .slice(nextHidden)
    .map((row) => `<row r="${row + 1}" hidden="1"/>`)
    .join("");
  const replacement = `<sheetData${attributes}>${patched}${trailing}</sheetData>`;
  return xml.replace(sheetData[0], replacement);
}

export function writeXlsxDataMetadata(
  entries: Record<string, Uint8Array>,
  sheets: readonly Omit<XlsxDataMetadata, "unsupportedFilters" | "unsupportedValidations">[],
): void {
  for (const [index, metadata] of sheets.entries()) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    let xml = strFromU8(entry);
    if (metadata.filter)
      xml = replaceElement(
        xml,
        "autoFilter",
        writeXlsxAutoFilter(metadata.filter),
        /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/i,
      );
    if (metadata.filter || metadata.colorSetHiddenRows?.length)
      xml = writeProductColorFilterSetExtension(xml, metadata.filter, metadata.colorSetHiddenRows);
    if (metadata.dataValidations.length) {
      const after = /<autoFilter\b/i.test(xml)
        ? /<autoFilter\b[^>]*(?:\/>|>[\s\S]*?<\/autoFilter>)/i
        : /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/i;
      xml = replaceElement(
        xml,
        "dataValidations",
        `<dataValidations count="${metadata.dataValidations.length}">${metadata.dataValidations.map(validationXml).join("")}</dataValidations>`,
        after,
      );
    }
    xml = writeHiddenRows(xml, metadata.hiddenRows);
    xml = writeOutlineGroups(xml, metadata.outlineGroups);
    xml = writeOutlineSummaryBelow(xml, metadata.summaryBelow);
    xml = writeRowBreaks(xml, metadata.pageBreakRows);
    entries[path] = strToU8(xml);
  }
}
