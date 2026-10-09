import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import {
  createBuiltinTableStyles,
  TABLE_STYLE_ELEMENTS,
  type TableStyleDefinition,
  type TableStyleElementFormat,
} from "@sheetcraft/core/table-styles";
import {
  PIVOT_TABLE_STYLE_ELEMENTS,
  type PivotTableStyleDefinition,
} from "@sheetcraft/core/pivot-table-styles";
import type { CellRange, SheetFilter, SheetTable } from "@sheetcraft/core/workbook";
import type { CellBorder } from "@sheetcraft/core/style";
import { readXlsxDxfEntries, readXlsxDxfStyle, xlsxDxfXml } from "./conditional-formatting.js";
import { readXlsxAutoFilter, writeXlsxAutoFilter } from "./data-tools-metadata.js";

type WorksheetPart = { path: string; xml: string };
type ImportedTable = SheetTable;
const SHARED_TABLE_STYLE_ELEMENTS = TABLE_STYLE_ELEMENTS.filter((element) =>
  (PIVOT_TABLE_STYLE_ELEMENTS as readonly string[]).includes(element),
);

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
    const normalized = token.toLowerCase();
    if (normalized in named) return named[normalized] ?? entity;
    const code = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number(normalized.slice(1));
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
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
  const match = new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    "i",
  ).exec(attributes);
  return match ? decodeXml(match[2] ?? "") : undefined;
}

function truthy(value: string | undefined): boolean {
  return /^(1|true)$/i.test(value ?? "");
}

function columnIndex(label: string): number | null {
  let value = 0;
  for (const character of label.toUpperCase()) {
    if (character < "A" || character > "Z") return null;
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value ? value - 1 : null;
}

function columnLabel(column: number): string {
  let value = column + 1;
  let result = "";
  while (value) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function parseRange(reference: string): CellRange | null {
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

function rangeReference(range: CellRange): string {
  return `${columnLabel(range.start.column)}${range.start.row + 1}:${columnLabel(range.end.column)}${range.end.row + 1}`;
}

function normalizePath(base: string, target: string): string {
  const source = target.startsWith("/") ? target.slice(1) : `${base}/${target}`;
  return source
    .split("/")
    .reduce<string[]>((segments, part) => {
      if (!part || part === ".") return segments;
      if (part === "..") segments.pop();
      else segments.push(part);
      return segments;
    }, [])
    .join("/");
}

function worksheetParts(entries: Record<string, Uint8Array>): WorksheetPart[] {
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) return [];
  const targets = new Map<string, string>();
  for (const relation of strFromU8(relationships).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (id && target && /\/worksheet$/i.test(attribute(attrs, "Type") ?? ""))
      targets.set(id, normalizePath("xl", target));
  }
  return [...strFromU8(workbook).matchAll(/<sheet\b([^>]*)\/?\s*>/gi)].flatMap((sheet) => {
    const path = targets.get(attribute(sheet[1] ?? "", "r:id") ?? "");
    const bytes = path ? entries[path] : undefined;
    return path && bytes ? [{ path, xml: strFromU8(bytes) }] : [];
  });
}

function relationshipTargets(
  entries: Record<string, Uint8Array>,
  sheetPath: string,
): Map<string, string> {
  const file = sheetPath.slice(sheetPath.lastIndexOf("/") + 1);
  const relsPath = `${sheetPath.slice(0, sheetPath.lastIndexOf("/"))}/_rels/${file}.rels`;
  const rels = entries[relsPath];
  const targets = new Map<string, string>();
  if (!rels) return targets;
  const base = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
  for (const relation of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (id && target && /\/table$/i.test(attribute(attrs, "Type") ?? ""))
      targets.set(id, normalizePath(base, target));
  }
  return targets;
}

function builtinStyle(name: string): TableStyleDefinition | undefined {
  const match = /^TableStyle(Light|Medium|Dark)(\d+)$/i.exec(name);
  const source = match
    ? createBuiltinTableStyles().find((style) => style.name === `${match[1]} ${match[2]}`)
    : undefined;
  return source
    ? { ...source, id: `xlsx-excel-style-${name}`, name: `Excel ${name}`, category: "custom" }
    : undefined;
}

function fallbackExcelStyle(name: string): TableStyleDefinition {
  const source = createBuiltinTableStyles().find((style) => style.name === "Medium 1")!;
  return { ...source, id: `xlsx-excel-style-${name}`, name: `Excel ${name}`, category: "custom" };
}

function styleElements(
  body: string,
  dxfs: readonly string[],
  supported: ReadonlySet<string>,
): Partial<Record<string, TableStyleElementFormat>> {
  const elements: Partial<Record<string, TableStyleElementFormat>> = {};
  for (const element of body.matchAll(/<tableStyleElement\b([^>]*)\/?\s*>/gi)) {
    const elementAttrs = element[1] ?? "";
    const type = attribute(elementAttrs, "type");
    const dxfId = Number(attribute(elementAttrs, "dxfId"));
    if (!type || !supported.has(type) || !Number.isInteger(dxfId) || !dxfs[dxfId]) continue;
    const parsed = readXlsxDxfStyle(dxfs[dxfId]);
    const border = /<border\b[^>]*>([\s\S]*?)<\/border>/i.exec(dxfs[dxfId] ?? "")?.[1] ?? "";
    const innerBorder = (name: "horizontal" | "vertical"): CellBorder | null | undefined => {
      const entry = new RegExp(`<${name}\\b([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/${name}>)`, "i").exec(
        border,
      );
      if (!entry) return undefined;
      const style = attribute(entry[1] ?? "", "style") as CellBorder["style"] | undefined;
      const color = /<color\b[^>]*\brgb="(?:FF)?([0-9A-F]{6})"[^>]*\/?\s*>/i.exec(
        entry[2] ?? "",
      )?.[1];
      return style && color ? { style, color: `#${color.toLowerCase()}` } : null;
    };
    const innerHorizontal = innerBorder("horizontal");
    const innerVertical = innerBorder("vertical");
    elements[type] = {
      style: parsed.style,
      ...(Number.isInteger(Number(attribute(elementAttrs, "size")))
        ? { stripeSize: Number(attribute(elementAttrs, "size")) }
        : {}),
      ...(innerHorizontal !== undefined ? { innerHorizontal } : {}),
      ...(innerVertical !== undefined ? { innerVertical } : {}),
    };
  }
  return elements;
}

function customStyles(stylesXml: string | undefined): Map<string, TableStyleDefinition> {
  const result = new Map<string, TableStyleDefinition>();
  const dxfs = readXlsxDxfEntries(stylesXml);
  const body = /<tableStyles\b[^>]*>([\s\S]*?)<\/tableStyles>/i.exec(stylesXml ?? "")?.[1] ?? "";
  for (const tableStyle of body.matchAll(
    /<tableStyle\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tableStyle>)/gi,
  )) {
    const attrs = tableStyle[1] ?? "";
    const name = attribute(attrs, "name");
    if (!name || !truthy(attribute(attrs, "table"))) continue;
    const elements = styleElements(
      tableStyle[2] ?? "",
      dxfs,
      new Set<string>(TABLE_STYLE_ELEMENTS),
    ) as TableStyleDefinition["elements"];
    result.set(name, { id: `xlsx-table-style-${name}`, name, category: "custom", elements });
  }
  return result;
}

function customPivotStyles(stylesXml: string | undefined): Map<string, PivotTableStyleDefinition> {
  const result = new Map<string, PivotTableStyleDefinition>();
  const dxfs = readXlsxDxfEntries(stylesXml);
  const body = /<tableStyles\b[^>]*>([\s\S]*?)<\/tableStyles>/i.exec(stylesXml ?? "")?.[1] ?? "";
  for (const tableStyle of body.matchAll(
    /<tableStyle\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tableStyle>)/gi,
  )) {
    const attrs = tableStyle[1] ?? "";
    const name = attribute(attrs, "name");
    if (!name || !truthy(attribute(attrs, "pivot"))) continue;
    result.set(name, {
      id: `xlsx-pivot-table-style-${name}`,
      name,
      category: "custom",
      elements: styleElements(
        tableStyle[2] ?? "",
        dxfs,
        new Set<string>(PIVOT_TABLE_STYLE_ELEMENTS),
      ) as PivotTableStyleDefinition["elements"],
    });
  }
  return result;
}

function tableFilter(xml: string, dxfs: readonly string[]): SheetFilter | null {
  return readXlsxAutoFilter(xml, dxfs).value as SheetFilter | null;
}

function readTable(
  xml: string,
  styles: ReadonlyMap<string, TableStyleDefinition>,
  dxfs: readonly string[],
): ImportedTable | null {
  const root = /<table\b([^>]*)>/i.exec(xml);
  if (!root) return null;
  const attrs = root[1] ?? "";
  const range = parseRange(attribute(attrs, "ref") ?? "");
  const name = attribute(attrs, "displayName") ?? attribute(attrs, "name");
  if (!range || !name) return null;
  const info = /<tableStyleInfo\b([^>]*)\/?\s*>/i.exec(xml)?.[1] ?? "";
  const styleName = attribute(info, "name") ?? "TableStyleMedium2";
  const style = styles.get(styleName) ?? builtinStyle(styleName) ?? fallbackExcelStyle(styleName);
  const columns = [...xml.matchAll(/<tableColumn\b([^>]*)\/?\s*>/gi)].map((column, index) => ({
    id: attribute(column[1] ?? "", "id") ?? String(index + 1),
    name: attribute(column[1] ?? "", "name") ?? `Column${index + 1}`,
  }));
  return {
    id: attribute(attrs, "id") ?? `xlsx-table-${name}`,
    name,
    range,
    columns,
    style,
    headerRow: Number(attribute(attrs, "headerRowCount") ?? "1") !== 0,
    totalRow: Number(attribute(attrs, "totalsRowCount") ?? "0") > 0,
    firstColumn: truthy(attribute(info, "showFirstColumn")),
    lastColumn: truthy(attribute(info, "showLastColumn")),
    bandedRows:
      attribute(info, "showRowStripes") === undefined || truthy(attribute(info, "showRowStripes")),
    bandedColumns: truthy(attribute(info, "showColumnStripes")),
    filterButton: ![...xml.matchAll(/<tableColumn\b([^>]*)\/?\s*>/gi)].every((column) =>
      truthy(attribute(column[1] ?? "", "hiddenButton")),
    ),
    filter: tableFilter(xml, dxfs),
  };
}

export function readXlsxTableMetadata(bytes: Uint8Array): {
  sheets: ImportedTable[][];
  tableStyles: TableStyleDefinition[];
  defaultTableStyleName?: string;
  pivotTableStyles: PivotTableStyleDefinition[];
  defaultPivotTableStyleName?: string;
} {
  const entries = unzipSync(bytes);
  const stylesXml = strFromU8(entries["xl/styles.xml"] ?? new Uint8Array());
  const styles = customStyles(stylesXml);
  const dxfs = readXlsxDxfEntries(stylesXml);
  const pivotStyles = customPivotStyles(stylesXml);
  const sheets = worksheetParts(entries).map(({ path, xml }) => {
    const targets = relationshipTargets(entries, path);
    return [...xml.matchAll(/<tablePart\b([^>]*)\/?\s*>/gi)].flatMap((part) => {
      const table = entries[targets.get(attribute(part[1] ?? "", "r:id") ?? "") ?? ""];
      const parsed = table ? readTable(strFromU8(table), styles, dxfs) : null;
      return parsed ? [parsed] : [];
    });
  });
  const tableStylesAttrs = /<tableStyles\b([^>]*)/i.exec(stylesXml)?.[1] ?? "";
  const defaultTableStyleName = attribute(tableStylesAttrs, "defaultTableStyle");
  const defaultPivotTableStyleName = attribute(tableStylesAttrs, "defaultPivotStyle");
  const defaultStyle = defaultTableStyleName
    ? (styles.get(defaultTableStyleName) ??
      builtinStyle(defaultTableStyleName) ??
      fallbackExcelStyle(defaultTableStyleName))
    : undefined;
  if (defaultStyle) styles.set(defaultTableStyleName!, defaultStyle);
  return {
    sheets,
    tableStyles: [...styles.values()],
    pivotTableStyles: [...pivotStyles.values()],
    ...(defaultTableStyleName ? { defaultTableStyleName } : {}),
    ...(defaultPivotTableStyleName ? { defaultPivotTableStyleName } : {}),
  };
}

export function xlsxTableStyleId(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return /^TableStyle(Light|Medium|Dark)(\d+)$/i.test(name)
    ? `xlsx-excel-style-${name}`
    : `xlsx-table-style-${name}`;
}

export function xlsxPivotTableStyleId(name: string | undefined): string | undefined {
  return name ? `xlsx-pivot-table-style-${name}` : undefined;
}

function xlsxStyleName(style: TableStyleDefinition): string {
  return /^(?:Light|Medium|Dark) \d+$|^TableStyle(?:Light|Medium|Dark)\d+$/i.test(style.name)
    ? `Sheetcraft ${style.name}`
    : style.name;
}

function tableDxfXml(element: TableStyleElementFormat): string {
  const sides = (
    [
      ["horizontal", element.innerHorizontal],
      ["vertical", element.innerVertical],
    ] as const
  )
    .flatMap(([name, border]) =>
      border === undefined
        ? []
        : [
            border === null
              ? `<${name}/>`
              : `<${name} style="${border.style}"><color rgb="FF${border.color.slice(1).toUpperCase()}"/></${name}>`,
          ],
    )
    .join("");
  const dxf = xlsxDxfXml(element.style);
  if (!sides) return dxf;
  return /<border\b[^>]*>/i.test(dxf)
    ? dxf.replace(/<\/border>/i, `${sides}</border>`)
    : dxf.replace(/<\/dxf>/i, `<border>${sides}</border></dxf>`);
}

function tableXml(table: SheetTable, tableId: number): string {
  const name = encodeXml(table.name);
  const columns = table.columns
    .map(
      (column, index) =>
        `<tableColumn id="${index + 1}" name="${encodeXml(column.name)}"${table.filterButton ? "" : ' hiddenButton="1"'}/>`,
    )
    .join("");
  const filter = table.filter
    ? writeXlsxAutoFilter(table.filter as Parameters<typeof writeXlsxAutoFilter>[0])
    : "";
  const style = xlsxStyleName(table.style);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableId}" name="${name}" displayName="${name}" ref="${rangeReference(table.range)}"${table.headerRow ? "" : ' headerRowCount="0"'}${table.totalRow ? ' totalsRowCount="1"' : ""}>${filter}<tableColumns count="${table.columns.length}">${columns}</tableColumns><tableStyleInfo name="${encodeXml(style)}" showFirstColumn="${table.firstColumn ? 1 : 0}" showLastColumn="${table.lastColumn ? 1 : 0}" showRowStripes="${table.bandedRows ? 1 : 0}" showColumnStripes="${table.bandedColumns ? 1 : 0}"/></table>`;
}

function writeTableStyles(
  entries: Record<string, Uint8Array>,
  styles: readonly TableStyleDefinition[],
  defaultStyleId?: string,
  pivotStyles: readonly PivotTableStyleDefinition[] = [],
  defaultPivotStyleId?: string,
): Map<string, string> {
  const source = strFromU8(entries["xl/styles.xml"]!);
  const custom = styles.filter((style) => Object.keys(style.elements).length);
  const customPivots = pivotStyles.filter((style) => Object.keys(style.elements).length);
  const dxfXml = readXlsxDxfEntries(source).map((entry) => `<dxf>${entry}</dxf>`);
  const entriesByName = new Map<
    string,
    {
      name: string;
      table: boolean;
      pivot: boolean;
      elements: Partial<Record<string, TableStyleElementFormat>>;
    }
  >();
  const pivotStyleNames = new Map<string, string>();
  const hasConflictingSharedElements = (
    tableElements: Partial<Record<string, TableStyleElementFormat>>,
    pivotElements: Partial<Record<string, TableStyleElementFormat>>,
  ) =>
    SHARED_TABLE_STYLE_ELEMENTS.some(
      (element) =>
        JSON.stringify(tableElements[element]) !== JSON.stringify(pivotElements[element]),
    );
  const nextAvailableName = (base: string): string => {
    let name = base;
    let suffix = 2;
    while (entriesByName.has(name.toLowerCase())) name = `${base} ${suffix++}`;
    return name;
  };
  for (const style of custom)
    entriesByName.set(xlsxStyleName(style).toLowerCase(), {
      name: xlsxStyleName(style),
      table: true,
      pivot: false,
      elements: { ...style.elements },
    });
  for (const style of customPivots) {
    const existing = entriesByName.get(style.name.toLowerCase());
    const conflicts = existing && hasConflictingSharedElements(existing.elements, style.elements);
    const name = conflicts ? nextAvailableName(`Sheetcraft Pivot ${style.name}`) : style.name;
    pivotStyleNames.set(style.id, name);
    const entry = entriesByName.get(name.toLowerCase());
    if (entry) {
      entry.pivot = true;
      for (const [type, value] of Object.entries(style.elements))
        if (!(type in entry.elements)) entry.elements[type] = value;
    } else
      entriesByName.set(name.toLowerCase(), {
        name,
        table: false,
        pivot: true,
        elements: { ...style.elements },
      });
  }
  const tableStyles = [...entriesByName.values()]
    .map((entry) => {
      const elements = Object.entries(entry.elements)
        .flatMap(([type, value]) => {
          if (!value) return [];
          const xml = tableDxfXml(value);
          let dxfId = dxfXml.indexOf(xml);
          if (dxfId < 0) {
            dxfId = dxfXml.length;
            dxfXml.push(xml);
          }
          return [
            `<tableStyleElement type="${type}" dxfId="${dxfId}"${value.stripeSize ? ` size="${value.stripeSize}"` : ""}/>`,
          ];
        })
        .join("");
      return `<tableStyle name="${encodeXml(entry.name)}" pivot="${entry.pivot ? 1 : 0}" table="${entry.table ? 1 : 0}" count="${Object.keys(entry.elements).length}">${elements}</tableStyle>`;
    })
    .join("");
  const defaultStyle =
    styles.find((style) => style.id === defaultStyleId) ??
    styles.find((style) => style.category === "medium") ??
    styles[0];
  const defaultPivotStyle = pivotStyles.find((style) => style.id === defaultPivotStyleId);
  const defaultPivotName =
    (defaultPivotStyle ? pivotStyleNames.get(defaultPivotStyle.id) : undefined) ??
    (defaultPivotStyleId?.startsWith("xlsx-pivot-table-style-")
      ? defaultPivotStyleId.slice("xlsx-pivot-table-style-".length)
      : "PivotStyleLight16");
  const dxfsContainer = `<dxfs count="${dxfXml.length}">${dxfXml.join("")}</dxfs>`;
  const tableStylesContainer = `<tableStyles count="${entriesByName.size}" defaultTableStyle="${encodeXml(defaultStyle ? xlsxStyleName(defaultStyle) : "TableStyleMedium2")}" defaultPivotStyle="${encodeXml(defaultPivotName)}">${tableStyles}</tableStyles>`;
  const withDxfs = /<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i.test(source)
    ? source.replace(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i, dxfsContainer)
    : source.replace(/<tableStyles\b/i, `${dxfsContainer}<tableStyles`);
  entries["xl/styles.xml"] = strToU8(
    withDxfs.replace(/<tableStyles\b[^>]*(?:\/>|>[\s\S]*?<\/tableStyles>)/i, tableStylesContainer),
  );
  return pivotStyleNames;
}

function nextRelationshipId(xml: string): number {
  return Math.max(0, ...[...xml.matchAll(/\bId="rId(\d+)"/g)].map((entry) => Number(entry[1]))) + 1;
}

function addContentType(entries: Record<string, Uint8Array>, tableId: number): void {
  const path = "[Content_Types].xml";
  const xml = strFromU8(entries[path]!);
  const partName = `/xl/tables/table${tableId}.xml`;
  if (!xml.includes(`PartName="${partName}"`))
    entries[path] = strToU8(
      xml.replace(
        /<\/Types>/i,
        `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`,
      ),
    );
}

export function writeXlsxTableMetadata(
  entries: Record<string, Uint8Array>,
  sheets: readonly { tables?: readonly SheetTable[] }[],
  styles: readonly TableStyleDefinition[] = [],
  defaultStyleId?: string,
  pivotStyles: readonly PivotTableStyleDefinition[] = [],
  defaultPivotStyleId?: string,
): Map<string, string> {
  if (
    !sheets.some((sheet) => sheet.tables?.length) &&
    !styles.length &&
    !pivotStyles.length &&
    !defaultStyleId &&
    !defaultPivotStyleId
  )
    return new Map();
  const stylesById = new Map(styles.map((style) => [style.id, style]));
  for (const table of sheets.flatMap((sheet) => sheet.tables ?? []))
    if (!stylesById.has(table.style.id)) stylesById.set(table.style.id, table.style);
  const pivotStyleNames = writeTableStyles(
    entries,
    [...stylesById.values()],
    defaultStyleId,
    pivotStyles,
    defaultPivotStyleId,
  );
  let tableId = 1;
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const tables = sheet.tables ?? [];
    if (!tables.length) continue;
    const path = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const worksheet = entries[path];
    if (!worksheet) continue;
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`;
    let rels = strFromU8(
      entries[relsPath] ??
        strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
        ),
    );
    let relationshipId = nextRelationshipId(rels);
    const parts: string[] = [];
    for (const table of tables) {
      const currentId = tableId++;
      const relation = `rId${relationshipId++}`;
      entries[`xl/tables/table${currentId}.xml`] = strToU8(tableXml(table, currentId));
      addContentType(entries, currentId);
      rels = rels.replace(
        /<\/Relationships>/i,
        `<Relationship Id="${relation}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${currentId}.xml"/></Relationships>`,
      );
      parts.push(`<tablePart r:id="${relation}"/>`);
    }
    entries[relsPath] = strToU8(rels);
    const xml = strFromU8(worksheet).replace(
      /<tableParts\b[^>]*(?:\/>|>[\s\S]*?<\/tableParts>)/i,
      "",
    );
    entries[path] = strToU8(
      xml.replace(
        /<\/worksheet>/i,
        (match) => `<tableParts count="${parts.length}">${parts.join("")}</tableParts>${match}`,
      ),
    );
  }
  return pivotStyleNames;
}
