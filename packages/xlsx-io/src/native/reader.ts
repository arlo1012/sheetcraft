import { attr, child, flag, relationships, type XmlNode } from "../pivot-xml.js";
import type {
  NativeCell,
  NativeRow,
  NativeSheetData,
  NativeStyle,
  NativeWorkbookData,
} from "./model.js";
import { cellPosition, columnName, translateSharedFormula } from "./reader-formulas.js";
import { readIsoDate } from "./reader-date.js";
import { colorPalette, readColor, readStyles } from "./reader-styles.js";
import {
  decodeSpreadsheetText,
  elements as nodes,
  readArchive,
  readXml,
  richText,
  textValue,
} from "./reader-xml.js";

const MAX_CELLS = 200_000;
const MAX_FORMULA_SOURCE_UNITS = 8_192;
const MAX_EXPANDED_FORMULA_UNITS = 32 * 1024 * 1024;
type ImportBudget = { cells: number; formulaUnits: number };
function reserveFormula(source: string, budget: ImportBudget): string {
  if (source.length > MAX_FORMULA_SOURCE_UNITS)
    throw new Error("The XLSX formula exceeds the supported source length.");
  budget.formulaUnits += source.length;
  if (budget.formulaUnits > MAX_EXPANDED_FORMULA_UNITS)
    throw new Error("The XLSX workbook exceeds the expanded formula limit.");
  return source;
}
function numberAttribute(node: XmlNode, name: string): number | undefined {
  const value = attr(node, name);
  const number = value === "" ? NaN : Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function integer(value: string, fallback?: number): number {
  if (!value && fallback !== undefined) return fallback;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number))
    throw new Error("Invalid XLSX integer.");
  return number;
}
function views(root: XmlNode, kind: "workbookView" | "sheetView"): Record<string, unknown>[] {
  const container = child(root, kind === "workbookView" ? "bookViews" : "sheetViews");
  return nodes(container[kind]).map((view) => {
    const result: Record<string, unknown> = {};
    for (const key of [
      "activeTab",
      "firstSheet",
      "xWindow",
      "yWindow",
      "windowWidth",
      "windowHeight",
      "zoomScale",
      "zoomScaleNormal",
      "workbookViewId",
    ])
      if (numberAttribute(view, key) !== undefined) result[key] = numberAttribute(view, key);
    for (const key of ["showGridLines", "showRowColHeaders", "rightToLeft", "tabSelected"])
      if (view[`@_${key}`] !== undefined) result[key] = flag(view, key);
    if (view.pane !== undefined) {
      const pane = child(view, "pane");
      const state = attr(pane, "state", "split");
      result.state = state === "frozenSplit" ? "frozen" : state;
      result.xSplit = numberAttribute(pane, "xSplit") ?? 0;
      result.ySplit = numberAttribute(pane, "ySplit") ?? 0;
      for (const key of ["topLeftCell", "activePane"])
        if (attr(pane, key)) result[key] = attr(pane, key);
    }
    return result;
  });
}
function styleAt(styles: NativeStyle[], id: string): NativeStyle {
  const index = integer(id, 0);
  if (!styles[index]) throw new Error("Invalid XLSX cell style index.");
  return styles[index]!;
}
function cellValue(cell: XmlNode, strings: string[]): unknown {
  const type = attr(cell, "t", "n");
  if (type === "inlineStr") return richText(child(cell, "is"));
  if (cell.v === undefined) return null;
  const value = textValue(cell.v);
  if (type === "s") {
    const index = integer(value);
    if (index >= strings.length) throw new Error("Invalid XLSX shared-string index.");
    return strings[index];
  }
  if (type === "str") return decodeSpreadsheetText(value);
  if (type === "b") {
    if (!["0", "1", "true", "false"].includes(value)) throw new Error("Invalid XLSX boolean.");
    return value === "1" || value === "true";
  }
  if (type === "e") return { error: value };
  if (type === "d") return readIsoDate(value);
  if (type !== "n") throw new Error(`Unsupported XLSX cell type: ${type}`);
  const decimal = value.trim();
  if (!decimal) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(decimal))
    throw new Error("Invalid XLSX number.");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid XLSX number.");
  return number;
}

type SharedFormula = { source: string; row: number; column: number };
function readWorksheet(
  root: XmlNode,
  name: string,
  styles: NativeStyle[],
  strings: string[],
  budget: ImportBudget,
  theme: Uint8Array | undefined,
): NativeSheetData {
  const format = child(root, "sheetFormatPr");
  const properties: NativeSheetData["properties"] = {};
  for (const key of ["defaultRowHeight", "defaultColWidth"] as const)
    if (numberAttribute(format, key) !== undefined) properties[key] = numberAttribute(format, key);
  const tabColor = readColor(child(child(root, "sheetPr"), "tabColor"), colorPalette(theme));
  if (typeof tabColor?.argb === "string") properties.tabColor = { argb: tabColor.argb };
  const sheet: NativeSheetData = {
    name,
    properties,
    views: views(root, "sheetView"),
    rows: new Map(),
    columns: new Map(),
    merges: [],
    images: [],
  };
  const columnStyles = new Map<number, NativeStyle>();
  let expandedColumns = 0;
  for (const node of nodes(child(root, "cols").col)) {
    const min = integer(attr(node, "min"));
    const max = integer(attr(node, "max"));
    if (min < 1 || max < min || max > 16_384 || (expandedColumns += max - min + 1) > MAX_CELLS)
      throw new Error("Invalid XLSX column range.");
    const width = numberAttribute(node, "width");
    const style = node["@_style"] === undefined ? undefined : styleAt(styles, attr(node, "style"));
    for (let index = min; index <= max; index++) {
      sheet.columns.set(index, {
        number: index,
        ...(width === undefined ? {} : { width }),
        ...(flag(node, "hidden") ? { hidden: true } : {}),
      });
      if (style) columnStyles.set(index, style);
    }
  }
  const shared = new Map<number, SharedFormula>();
  const pending: Array<{ cell: NativeCell; id: number; row: number; column: number }> = [];
  let nextRow = 1;
  for (const node of nodes(child(root, "sheetData").row)) {
    const index = integer(attr(node, "r"), nextRow);
    if (index < 1 || index > 1_048_576 || sheet.rows.has(index))
      throw new Error("Invalid XLSX row index.");
    nextRow = index + 1;
    const row: NativeRow = { number: index, cells: new Map() };
    const height = numberAttribute(node, "ht");
    if (height !== undefined) row.height = height;
    if (flag(node, "hidden")) row.hidden = true;
    const rowStyle = node["@_s"] === undefined ? undefined : styleAt(styles, attr(node, "s"));
    let nextColumn = 1;
    for (const source of nodes(node.c)) {
      if (++budget.cells > MAX_CELLS)
        throw new Error("The XLSX workbook exceeds the sparse cell limit.");
      const reference = attr(source, "r", `${columnName(nextColumn)}${index}`).toUpperCase();
      const position = cellPosition(reference);
      if (position.row !== index || row.cells.has(position.column))
        throw new Error("Invalid XLSX cell position.");
      nextColumn = position.column + 1;
      const style =
        source["@_s"] === undefined
          ? { ...columnStyles.get(position.column), ...rowStyle }
          : styleAt(styles, attr(source, "s"));
      // A present cell with no local or inherited style still uses cell XF zero.
      const resolvedStyle =
        source["@_s"] === undefined && !rowStyle && !columnStyles.has(position.column)
          ? styles[0]!
          : style;
      const value = cellValue(source, strings);
      const cell: NativeCell = { address: reference, value, style: resolvedStyle };
      if (typeof resolvedStyle.numFmt === "string") cell.numFmt = resolvedStyle.numFmt;
      if (source.f !== undefined) {
        const formula = typeof source.f === "object" ? (source.f as XmlNode) : {};
        const sourceText = textValue(source.f);
        const sharedFormula = attr(formula, "t") === "shared";
        if (sharedFormula) {
          const id = integer(attr(formula, "si"));
          if (sourceText) {
            if (shared.has(id)) throw new Error("Duplicate XLSX shared-formula definition.");
            shared.set(id, { source: sourceText, ...position });
            cell.formula = reserveFormula(sourceText, budget);
          } else pending.push({ cell, id, ...position });
        } else if (sourceText) cell.formula = reserveFormula(sourceText, budget);
        if (sharedFormula || sourceText) {
          if (value !== null) cell.result = value;
          cell.value = {
            ...(cell.formula === undefined ? {} : { formula: cell.formula }),
            ...(value === null ? {} : { result: value }),
          };
        }
      }
      row.cells.set(position.column, cell);
    }
    sheet.rows.set(index, row);
  }
  for (const entry of pending) {
    const master = shared.get(entry.id);
    if (!master) throw new Error("Missing XLSX shared-formula definition.");
    entry.cell.formula = reserveFormula(
      translateSharedFormula(master.source, entry.row - master.row, entry.column - master.column),
      budget,
    );
    entry.cell.value = {
      formula: entry.cell.formula,
      ...(entry.cell.result === undefined ? {} : { result: entry.cell.result }),
    };
  }
  for (const node of nodes(child(root, "mergeCells").mergeCell)) {
    const reference = attr(node, "ref").toUpperCase();
    if (reference.split(":").length > 2) throw new Error("Invalid XLSX merged range.");
    const [start, end = start] = reference.split(":");
    const first = cellPosition(start ?? ""),
      last = cellPosition(end ?? "");
    if (first.row > last.row || first.column > last.column)
      throw new Error("Invalid XLSX merged range.");
    sheet.merges.push(`${start}:${end}`);
  }
  if (root.autoFilter !== undefined) sheet.autoFilter = attr(child(root, "autoFilter"), "ref");
  return sheet;
}

/** First-party sparse OOXML reader. ZIP preflight remains the public import security boundary. */
export function readNativeWorkbook(bytes: Uint8Array): NativeWorkbookData {
  const entries = readArchive(bytes);
  const packageRelationships = relationships(entries, "");
  const workbookPart =
    [...packageRelationships.values()].find((rel) => rel.type.endsWith("/officeDocument"))
      ?.target ?? "xl/workbook.xml";
  const parsedXml = readXml(entries[workbookPart]);
  if (parsedXml.workbook === undefined) throw new Error("Missing XLSX workbook root.");
  const root = child(parsedXml, "workbook");
  const relations = relationships(entries, workbookPart);
  const partByType = (type: string) =>
    [...relations.values()].find((rel) => rel.type.endsWith(`/${type}`))?.target;
  const stylesPart = partByType("styles");
  const stringsPart = partByType("sharedStrings");
  const themePart = partByType("theme");
  for (const part of [stylesPart, stringsPart, themePart])
    if (part !== undefined && !entries[part]) throw new Error(`Missing linked XLSX part: ${part}`);
  const theme = themePart ? entries[themePart] : undefined;
  const styles = readStyles(stylesPart ? entries[stylesPart] : entries["xl/styles.xml"], theme);
  const strings = stringsPart
    ? nodes(child(readXml(entries[stringsPart]), "sst").si).map(richText)
    : [];
  const workbook: NativeWorkbookData = {
    properties: { date1904: flag(child(root, "workbookPr"), "date1904") },
    calcProperties: { fullCalcOnLoad: flag(child(root, "calcPr"), "fullCalcOnLoad") },
    views: views(root, "workbookView"),
    sheets: [],
    images: [],
  };
  const budget: ImportBudget = { cells: 0, formulaUnits: 0 };
  const names = new Set<string>();
  for (const sheet of nodes(child(root, "sheets").sheet)) {
    // Worksheet titles are XML attributes, not escaped spreadsheet cell strings.
    const name = attr(sheet, "name");
    if (
      !name.trim() ||
      name.length > 31 ||
      /[*?:\\/[\]]/.test(name) ||
      name.startsWith("'") ||
      name.endsWith("'") ||
      name === "History" ||
      names.has(name.toLowerCase())
    )
      throw new Error("Invalid or duplicate XLSX worksheet name.");
    names.add(name.toLowerCase());
    const relationship = relations.get(attr(sheet, "id"));
    if (!relationship || !relationship.type.endsWith("/worksheet"))
      throw new Error("Missing or unsupported XLSX worksheet relationship.");
    const parsedXml = readXml(entries[relationship.target]);
    if (parsedXml.worksheet === undefined) throw new Error("Missing XLSX worksheet root.");
    workbook.sheets.push(
      readWorksheet(child(parsedXml, "worksheet"), name, styles, strings, budget, theme),
    );
  }
  if (!workbook.sheets.length) throw new Error("The workbook contains no worksheets.");
  return workbook;
}
