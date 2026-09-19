import { strFromU8, strToU8, unzipSync } from "fflate/browser";

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

export type XlsxFilterCondition =
  | {
      kind: "text";
      operator: "contains" | "doesNotContain" | "beginsWith" | "endsWith" | "equals" | "notEquals";
      value: string;
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
): XlsxFilterCondition | null {
  const text = /^(\*|\?)/.test(value) || /[~*?]/.test(value);
  if (text) {
    const starts = value.startsWith("*");
    const ends = value.endsWith("*") && !value.endsWith("~*");
    const raw = value
      .replace(/^\*/, "")
      .replace(/(?<!~)\*$/, "")
      .replace(/~([*?~])/g, "$1");
    if (operator === "notEqual" && starts && ends)
      return { kind: "text", operator: "doesNotContain", value: raw };
    if (operator === "equal" && starts && ends)
      return { kind: "text", operator: "contains", value: raw };
    if (operator === "equal" && starts) return { kind: "text", operator: "endsWith", value: raw };
    if (operator === "equal" && ends) return { kind: "text", operator: "beginsWith", value: raw };
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const map: Record<string, XlsxFilterCondition["operator"]> = {
      equal: "equals",
      notEqual: "notEquals",
      greaterThan: "greaterThan",
      greaterThanOrEqual: "greaterThanOrEqual",
      lessThan: "lessThan",
      lessThanOrEqual: "lessThanOrEqual",
    };
    return map[operator ?? "equal"]
      ? { kind: "number", operator: map[operator ?? "equal"] as any, value: numeric }
      : null;
  }
  if (operator === "equal") return { kind: "text", operator: "equals", value };
  if (operator === "notEqual") return { kind: "text", operator: "notEquals", value };
  return null;
}

function readFilter(xml: string): { value: XlsxFilter | null; unsupported: boolean } {
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
      if (/<dateGroupItem\b/i.test(filters[2] ?? "")) unsupported = true;
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
      } else if (
        criteria.length === 2 &&
        /^(0|false)?$/i.test(attribute(custom[1] ?? "", "and") ?? "")
      ) {
        unsupported = true;
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
        if (left?.kind === "number" && right?.kind === "number" && left.kind === right.kind) {
          const inverse = left.operator === "greaterThan" && right.operator === "lessThan";
          const inclusive =
            left.operator === "greaterThanOrEqual" && right.operator === "lessThanOrEqual";
          if (inverse || inclusive)
            condition = {
              kind: "number",
              operator: "between",
              value: left.value,
              value2: right.value,
            };
          else unsupported = true;
        } else unsupported = true;
      } else unsupported = true;
    }
    if (!filters && !custom) unsupported = true;
    columns.push({
      column: range.start.column + offset,
      allowedValues,
      ...(condition ? { condition } : {}),
    });
  }
  return { value: { range, columns }, unsupported };
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
  return worksheetParts(bytes).map(({ xml }) => {
    const filter = readFilter(xml);
    const validations = readDataValidations(xml);
    return {
      filter: filter.value,
      hiddenRows: [],
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

function customCriterion(condition: XlsxFilterCondition): string[] | null {
  if (condition.kind === "text") {
    const escaped = condition.value.replace(/~/g, "~~").replace(/\*/g, "~*").replace(/\?/g, "~?");
    const map: Record<typeof condition.operator, [string, string]> = {
      contains: ["equal", `*${escaped}*`],
      doesNotContain: ["notEqual", `*${escaped}*`],
      beginsWith: ["equal", `${escaped}*`],
      endsWith: ["equal", `*${escaped}`],
      equals: ["equal", escaped],
      notEquals: ["notEqual", escaped],
    };
    const [operator, value] = map[condition.operator];
    return [operator, value];
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

function filterXml(filter: XlsxFilter): string {
  const columns = filter.columns
    .map((column) => {
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
      const filters = values.length
        ? `<filters${blanks ? ' blank="1"' : ""}>${items}</filters>`
        : "";
      let custom = "";
      if (column.condition) {
        if (
          (column.condition.operator === "between" || column.condition.operator === "notBetween") &&
          column.condition.value2 !== undefined
        ) {
          const lower = column.condition.operator === "between" ? "greaterThanOrEqual" : "lessThan";
          const upper = column.condition.operator === "between" ? "lessThanOrEqual" : "greaterThan";
          custom = `<customFilters and="1"><customFilter operator="${lower}" val="${column.condition.value}"/><customFilter operator="${upper}" val="${column.condition.value2}"/></customFilters>`;
        } else {
          const criterion = customCriterion(column.condition);
          if (criterion)
            custom = `<customFilters><customFilter operator="${criterion[0]!}" val="${encodeXml(criterion[1]!)}"/></customFilters>`;
        }
      }
      return `<filterColumn colId="${offset}">${filters}${custom}</filterColumn>`;
    })
    .join("");
  return `<autoFilter ref="${rangeReference(filter.range)}">${columns}</autoFilter>`;
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
        filterXml(metadata.filter),
        /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/i,
      );
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
