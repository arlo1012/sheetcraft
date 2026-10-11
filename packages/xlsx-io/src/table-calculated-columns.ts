import { XMLParser } from "fast-xml-parser";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  getFormulaAst,
  normalizeFormulaFunctionName,
  type FormulaExpression,
} from "@sheetcraft/core/formula";
import {
  getTableDataRows,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { attr, xml, MAIN_NS, type XmlNode } from "./pivot-xml.js";
import { qualifyXlsxStructuredReferences } from "./structured-reference-export.js";
import { xlsxFormula } from "./native/writer-formulas.js";
import type { CompatibilityReportBuilder } from "./report.js";

const SCALAR_FUNCTIONS = new Set([
  "ABS",
  "INT",
  "TRUNC",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "MOD",
  "POWER",
  "SQRT",
  "SIGN",
  "CONCAT",
]);
const AGGREGATE_FUNCTIONS = new Set([
  "SUM",
  "PRODUCT",
  "AVERAGE",
  "MIN",
  "MAX",
  "COUNT",
  "COUNTA",
  "COUNTBLANK",
]);
type Shape = "scalar" | "one-cell" | "range" | "unsupported";
const single = (shape: Shape) => shape === "scalar" || shape === "one-cell";
const MAX_SOURCE_LENGTH = 8192;

/** Stable across growth, without evaluating a workbook or guessing a currently selected IF branch. */
function supportedSource(
  source: string,
  workbook: Workbook,
  sheet: Sheet,
  table: SheetTable,
): boolean {
  const dataRows = getTableDataRows(table);
  if (!source.startsWith("=") || source.length > MAX_SOURCE_LENGTH || dataRows.start > dataRows.end)
    return false;
  let ast: ReturnType<typeof getFormulaAst>;
  try {
    ast = getFormulaAst(source);
  } catch {
    return false;
  }
  if (!ast) return false;
  const tables = [...workbook.sheets.values()].flatMap((candidate) => candidate.tables ?? []);
  if (
    tables.filter((candidate) => candidate.name.toLowerCase() === table.name.toLowerCase())
      .length !== 1
  )
    return false;
  const sameSheet = (name: string | undefined) =>
    name === undefined || name.toLowerCase() === sheet.name.toLowerCase();
  let remaining = 512;
  const shape = (expression: FormulaExpression, depth = 0): Shape => {
    if (--remaining < 0 || depth > 64) return "unsupported";
    switch (expression.kind) {
      case "number":
      case "string":
      case "boolean":
        return "scalar";
      case "error":
        return expression.code === "SPILL" ? "unsupported" : "scalar";
      case "reference":
        return sameSheet(expression.reference.sheetName) ? "scalar" : "unsupported";
      case "range":
        return sameSheet(expression.range.start.sheetName) &&
          sameSheet(expression.range.end.sheetName)
          ? "range"
          : "unsupported";
      case "structured-reference": {
        const reference = expression.reference;
        if (
          (reference.tableName !== undefined &&
            reference.tableName.toLowerCase() !== table.name.toLowerCase()) ||
          reference.columns.length !== 1
        )
          return "unsupported";
        const name = reference.columns[0]!.name.toLowerCase();
        if (table.columns.filter((column) => column.name.toLowerCase() === name).length !== 1)
          return "unsupported";
        return reference.scope === "this-row"
          ? "one-cell"
          : reference.scope === "data"
            ? "range"
            : "unsupported";
      }
      case "unary": {
        const operand = shape(expression.operand, depth + 1);
        return single(operand) ? operand : "unsupported";
      }
      case "binary": {
        const left = shape(expression.left, depth + 1),
          right = shape(expression.right, depth + 1);
        return !single(left) || !single(right)
          ? "unsupported"
          : left === "one-cell" || right === "one-cell"
            ? "one-cell"
            : "scalar";
      }
      case "function": {
        const name = normalizeFormulaFunctionName(expression.name);
        const metadata = DEFAULT_FORMULA_FUNCTION_REGISTRY.get(name)?.metadata;
        if (
          !metadata ||
          expression.args.length < metadata.minArgs ||
          (metadata.maxArgs !== null && expression.args.length > metadata.maxArgs)
        )
          return "unsupported";
        const args = expression.args.map((arg) => shape(arg, depth + 1));
        if (name === "IF")
          return args.every(single)
            ? args.includes("one-cell")
              ? "one-cell"
              : "scalar"
            : "unsupported";
        // A direct this-row argument is a range in Core, not a scalar-function argument.
        if (SCALAR_FUNCTIONS.has(name))
          return args.every((arg) => arg === "scalar") ? "scalar" : "unsupported";
        if (AGGREGATE_FUNCTIONS.has(name))
          return args.every((arg) => arg !== "unsupported") ? "scalar" : "unsupported";
        return "unsupported";
      }
      default:
        return "unsupported";
    }
  };
  try {
    return single(shape(ast.expression));
  } catch {
    return false;
  }
}

/** Track expanded XML names before the shared XML reader removes namespace prefixes. */
export function calculatedColumnNamespaces(source: string): Map<string, boolean> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
  });
  type ExpandedNode = { node: XmlNode; namespace: string; bindings: Map<string, string> };
  const children = (
    parent: XmlNode,
    localName: string,
    inherited: Map<string, string>,
  ): ExpandedNode[] =>
    Object.entries(parent).flatMap(([key, value]) => {
      if (key.startsWith("@_") || key.split(":").at(-1) !== localName) return [];
      return (Array.isArray(value) ? value : [value]).map((entry) => {
        const node = entry && typeof entry === "object" ? (entry as XmlNode) : { "#text": entry };
        const bindings = new Map(inherited);
        for (const [attribute, value] of Object.entries(node)) {
          if (attribute === "@_xmlns") bindings.set("", String(value));
          else if (attribute.startsWith("@_xmlns:"))
            bindings.set(attribute.slice(8), String(value));
        }
        const prefix = key.includes(":") ? key.slice(0, key.indexOf(":")) : "";
        return { node, namespace: bindings.get(prefix) ?? "", bindings };
      });
    });
  const roots = children(parser.parse(source) as XmlNode, "table", new Map());
  const result = new Map<string, boolean>();
  // SpreadsheetML layout/identity attributes are unqualified. A foreign prefixed
  // attribute must not acquire their meaning when the shared reader strips prefixes.
  const unqualifiedAttributes = (node: XmlNode) =>
    Object.keys(node).every(
      (key) => !key.startsWith("@_") || !key.includes(":") || key.startsWith("@_xmlns:"),
    );
  for (const root of roots)
    for (const columns of children(root.node, "tableColumns", root.bindings))
      for (const column of children(columns.node, "tableColumn", columns.bindings)) {
        const formulas = children(column.node, "calculatedColumnFormula", column.bindings);
        const key = JSON.stringify([attr(column.node, "id"), attr(column.node, "name")]);
        const valid =
          root.namespace === MAIN_NS &&
          columns.namespace === MAIN_NS &&
          column.namespace === MAIN_NS &&
          unqualifiedAttributes(root.node) &&
          unqualifiedAttributes(columns.node) &&
          unqualifiedAttributes(column.node) &&
          formulas.every(
            (formula) =>
              formula.namespace === MAIN_NS &&
              Object.keys(formula.node).every(
                (key) =>
                  key === "#text" ||
                  key === "@_array" ||
                  key === "@_xml:space" ||
                  key === "@_xmlns" ||
                  key.startsWith("@_xmlns:"),
              ),
          );
        result.set(key, !result.has(key) && valid);
      }
  return result;
}

/** Parse explicit producer metadata only. Missing metadata never implies a calculated column. */
export function readCalculatedColumnFormula(
  column: XmlNode,
  report: CompatibilityReportBuilder | undefined,
  location: string,
  namespaceValid = true,
): string | undefined {
  const value = column.calculatedColumnFormula;
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  let source: string | undefined;
  if (namespaceValid && values.length === 1) {
    const formula = values[0];
    if (typeof formula === "string") source = formula;
    else if (formula && typeof formula === "object") {
      const node = formula as XmlNode;
      const keys = Object.keys(node);
      const allowed = keys.every(
        (key) => key === "#text" || key === "@_array" || key === "@_space" || key === "@_xmlns",
      );
      const array = attr(node, "array");
      if (
        allowed &&
        ["", "0", "false"].includes(array) &&
        ["", "default", "preserve"].includes(attr(node, "space")) &&
        typeof node["#text"] === "string"
      )
        source = node["#text"];
    }
  }
  // Normalize only the envelope, keeping internal whitespace and string literal contents.
  source = source?.trim();
  const normalized = source ? (source.startsWith("=") ? source : `=${source}`) : undefined;
  try {
    if (normalized && normalized.length <= MAX_SOURCE_LENGTH && getFormulaAst(normalized))
      return normalized;
  } catch {
    /* Invalid/over-budget metadata does not invalidate actual worksheet members. */
  }
  report?.add("feature-omitted", "warning", `${location}.calculatedColumnFormula`);
  return undefined;
}

function location(sheet: Sheet, table: SheetTable, index: number): string {
  return `${sheet.name}!${formatCellAddress({ row: table.range.start.row + (table.headerRow ? 1 : 0), column: table.range.start.column + index })} (${table.name}[${table.columns[index]!.name}]).calculatedColumnFormula`;
}

/** Validate after table and workbook identities exist; leave all actual worksheet cells untouched. */
export function validateImportedCalculatedColumns(
  workbook: Workbook,
  report: CompatibilityReportBuilder,
): void {
  for (const sheet of workbook.sheets.values())
    for (const table of sheet.tables ?? [])
      for (const [index, column] of table.columns.entries()) {
        if (column.calculatedColumnFormula === undefined) continue;
        if (!supportedSource(column.calculatedColumnFormula, workbook, sheet, table)) {
          report.add("feature-omitted", "warning", location(sheet, table, index));
          delete column.calculatedColumnFormula;
        }
      }
}

export function calculatedColumnXml(
  workbook: Workbook | undefined,
  sheet: Sheet,
  table: SheetTable,
  index: number,
  report?: CompatibilityReportBuilder,
): string {
  const source = table.columns[index]!.calculatedColumnFormula;
  if (source === undefined) return "";
  if (!workbook || !supportedSource(source, workbook, sheet, table)) {
    report?.add("feature-omitted", "warning", location(sheet, table, index));
    return "";
  }
  const address = {
    row: table.range.start.row + (table.headerRow ? 1 : 0),
    column: table.range.start.column + index,
  };
  const formula = xlsxFormula(qualifyXlsxStructuredReferences(source, workbook, sheet.id, address));
  return `<calculatedColumnFormula>${xml(formula)}</calculatedColumnFormula>`;
}
