import { strFromU8, strToU8, unzipSync, type Unzipped } from "fflate/browser";
import {
  DEFAULT_SHEET_PAGE_SETUP,
  getSheetHeaderFooterOptions,
  normalizeSheetPageSetup,
  type SheetHeaderFooterOptions,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import type { CellRange, Sheet, Workbook } from "@idea10/core/workbook";
import type { CompatibilityReportBuilder } from "./report.js";

const MILLIMETRES_PER_INCH = 25.4;
const PAPER_SIZES = new Map<number, SheetPageSetup["paperSize"]>([
  [9, "a4"],
  [8, "a3"],
  [1, "letter"],
  [5, "legal"],
]);
const OOXML_PAPER_SIZES = new Map<SheetPageSetup["paperSize"], number>(
  [...PAPER_SIZES.entries()].map(([id, size]) => [size, id]),
);

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

function worksheetParts(bytes: Uint8Array): WorksheetXml[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) return [];
  const targets = new Map<string, string>();
  for (const relation of strFromU8(relationships).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (!id || !target || !/\/worksheet$/i.test(attribute(attrs, "Type") ?? "")) continue;
    const segments = (
      target.startsWith("/") ? target.slice(1).split("/") : ["xl", ...target.split("/")]
    )
      .reduce<string[]>((path, part) => {
        if (!part || part === ".") return path;
        if (part === "..") path.pop();
        else path.push(part);
        return path;
      }, [])
      .join("/");
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(segments)) targets.set(id, segments);
  }
  const result: WorksheetXml[] = [];
  for (const match of strFromU8(workbook).matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
    const path = targets.get(attribute(match[1] ?? "", "r:id") ?? "");
    const xml = path ? entries[path] : undefined;
    if (path && xml) result.push({ path, xml: strFromU8(xml) });
  }
  return result;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseHeaderFooter(value: string | undefined): SheetPageSetup["header"] {
  const parts: { left: string; center: string; right: string } = {
    left: "",
    center: "",
    right: "",
  };
  if (!value) return parts;
  let position: keyof typeof parts = "center";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (character !== "&") {
      parts[position] += character;
      continue;
    }
    const code = value[index + 1] ?? "";
    if (code === "&") {
      // Retain the raw literal-ampersand token so header/footer text roundtrips.
      parts[position] += "&&";
      index += 1;
    } else if (code === "L" || code === "C" || code === "R") {
      position = code === "L" ? "left" : code === "C" ? "center" : "right";
      index += 1;
    } else {
      // Formatting, dates, fields, and unknown raw controls belong to the
      // section text. Core stores them losslessly for the Web formatter.
      parts[position] += "&";
    }
  }
  return parts;
}

function headerFooterXml(
  header: SheetPageSetup["header"],
  footer: SheetPageSetup["footer"],
  options: SheetHeaderFooterOptions,
): string {
  const section = (value: SheetPageSetup["header"]) =>
    `&L${value.left}&C${value.center}&R${value.right}`;
  const attributes = [
    options.differentFirst ? ' differentFirst="1"' : "",
    options.differentOddEven ? ' differentOddEven="1"' : "",
    options.scaleWithDocument ? "" : ' scaleWithDoc="0"',
    options.alignWithMargins ? "" : ' alignWithMargins="0"',
  ].join("");
  const hasContent = (value: SheetPageSetup["header"]) =>
    value.left !== "" || value.center !== "" || value.right !== "";
  const variants = [
    `<oddHeader>${encodeXml(section(header))}</oddHeader>`,
    `<oddFooter>${encodeXml(section(footer))}</oddFooter>`,
    ...(options.differentOddEven || hasContent(options.evenHeader)
      ? [`<evenHeader>${encodeXml(section(options.evenHeader))}</evenHeader>`]
      : []),
    ...(options.differentOddEven || hasContent(options.evenFooter)
      ? [`<evenFooter>${encodeXml(section(options.evenFooter))}</evenFooter>`]
      : []),
    ...(options.differentFirst || hasContent(options.firstHeader)
      ? [`<firstHeader>${encodeXml(section(options.firstHeader))}</firstHeader>`]
      : []),
    ...(options.differentFirst || hasContent(options.firstFooter)
      ? [`<firstFooter>${encodeXml(section(options.firstFooter))}</firstFooter>`]
      : []),
  ];
  return `<headerFooter${attributes}>${variants.join("")}</headerFooter>`;
}

function truthy(value: string | undefined): boolean {
  return /^(1|true)$/i.test(value?.trim() ?? "");
}

function hasHeaderImageToken(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "&") continue;
    const token = value[index + 1] ?? "";
    if (token === "&") {
      index += 1;
      continue;
    }
    if (token === "G") return true;
  }
  return false;
}

function readBreaks(xml: string, tag: "rowBreaks" | "colBreaks"): number[] {
  const container = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml)?.[1] ?? "";
  return [...container.matchAll(/<brk\b([^>]*)\/?\s*>/gi)]
    .flatMap((match) => {
      const id = Number(attribute(match[1] ?? "", "id"));
      const manual = /^(1|true)$/i.test(attribute(match[1] ?? "", "man") ?? "");
      return manual && Number.isInteger(id) && id > 0 ? [id] : [];
    })
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function parseRange(value: string): CellRange | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(value);
  if (!match) return null;
  const column = (label: string) =>
    [...label.toUpperCase()].reduce(
      (total, character) => total * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1;
  const start = { column: column(match[1] ?? ""), row: Number(match[2]) - 1 };
  const end = {
    column: column(match[3] ?? match[1] ?? ""),
    row: Number(match[4] ?? match[2]) - 1,
  };
  return start.row >= 0 && end.row >= start.row && start.column >= 0 && end.column >= start.column
    ? { start, end }
    : null;
}

function readPrintAreas(
  bytes: Uint8Array,
  sheets: readonly Pick<Sheet, "name">[],
  report: CompatibilityReportBuilder,
): Array<CellRange | null> {
  const workbook = unzipSync(bytes)["xl/workbook.xml"];
  const result: Array<CellRange | null> = sheets.map(() => null);
  if (!workbook) return result;
  for (const match of strFromU8(workbook).matchAll(
    /<(?:\w+:)?definedName\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?definedName\s*>/gi,
  )) {
    const attrs = match[1] ?? "";
    if ((attribute(attrs, "name") ?? "").toLowerCase() !== "_xlnm.print_area") continue;
    const sheetIndex = Number(attribute(attrs, "localSheetId"));
    const raw = decodeXml(match[2] ?? "").trim();
    const reference =
      /^(?:'((?:[^']|'')+)'|([^'!]+))!(\$?[A-Z]+\$?[1-9]\d*(?::\$?[A-Z]+\$?[1-9]\d*)?)$/i.exec(raw);
    const expectedSheet = sheets[sheetIndex];
    const range = reference ? parseRange(reference[3] ?? "") : null;
    const sheetName = (reference?.[1] ?? reference?.[2] ?? "").replace(/''/g, "'");
    if (
      !expectedSheet ||
      !range ||
      sheetName.toLocaleLowerCase() !== expectedSheet.name.toLocaleLowerCase()
    ) {
      report.add("feature-omitted", "warning", `definedName:_xlnm.Print_Area`);
      continue;
    }
    result[sheetIndex] = range;
  }
  return result;
}

/** Read the supported worksheet print settings directly from OOXML. */
export function readXlsxPageSetups(
  bytes: Uint8Array,
  sheets: readonly Pick<Sheet, "name">[],
  report: CompatibilityReportBuilder,
): Array<SheetPageSetup | undefined> {
  const printAreas = readPrintAreas(bytes, sheets, report);
  return worksheetParts(bytes).map(({ xml }, index) => {
    const margins = /<pageMargins\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
    const setup = /<pageSetup\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
    const headerFooterElement = /<headerFooter\b([^>]*)(?:\/>|>([\s\S]*?)<\/headerFooter>)/i.exec(
      xml,
    );
    const headerFooterAttributes = headerFooterElement?.[1] ?? "";
    const headerFooter = headerFooterElement?.[2];
    const headerFooterText = (tag: string) =>
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(headerFooter ?? "")?.[1];
    const oddHeader = headerFooterText("oddHeader");
    const oddFooter = headerFooterText("oddFooter");
    const evenHeader = headerFooterText("evenHeader");
    const evenFooter = headerFooterText("evenFooter");
    const firstHeader = headerFooterText("firstHeader");
    const firstFooter = headerFooterText("firstFooter");
    const rowBreaks = readBreaks(xml, "rowBreaks");
    const columnBreaks = readBreaks(xml, "colBreaks");
    const hasSetup =
      !!margins ||
      !!setup ||
      !!headerFooter ||
      rowBreaks.length > 0 ||
      columnBreaks.length > 0 ||
      printAreas[index] !== null;
    if (!hasSetup) return undefined;

    const rawHeaderFooterText = [
      oddHeader,
      oddFooter,
      evenHeader,
      evenFooter,
      firstHeader,
      firstFooter,
    ]
      .filter((value): value is string => value !== undefined)
      .map(decodeXml);
    if (rawHeaderFooterText.some(hasHeaderImageToken) || /<legacyDrawingHF\b/i.test(xml))
      report.add(
        "feature-omitted",
        "warning",
        `${sheets[index]?.name ?? index + 1}.headerFooter.image`,
      );

    const paperId = parseNumber(attribute(setup ?? "", "paperSize"));
    const paperSize = paperId === undefined ? undefined : PAPER_SIZES.get(paperId);
    if (paperId !== undefined && !paperSize)
      report.add(
        "feature-omitted",
        "warning",
        `${sheets[index]?.name ?? index + 1}.pageSetup.paperSize`,
      );
    const orientation = attribute(setup ?? "", "orientation");
    const scale = parseNumber(attribute(setup ?? "", "scale"));
    const pageOrder = attribute(setup ?? "", "pageOrder");
    const fitToPage = /<pageSetUpPr\b[^>]*\bfitToPage\s*=\s*(["'])(?:1|true)\1/i.test(xml);
    if (fitToPage)
      report.add(
        "feature-omitted",
        "warning",
        `${sheets[index]?.name ?? index + 1}.pageSetup.fitToPages`,
      );
    const millimetres = (name: string) => {
      const inches = parseNumber(attribute(margins ?? "", name));
      return inches !== undefined && inches >= 0
        ? Number((inches * MILLIMETRES_PER_INCH).toFixed(12))
        : undefined;
    };
    return normalizeSheetPageSetup({
      ...DEFAULT_SHEET_PAGE_SETUP,
      ...(paperSize ? { paperSize } : {}),
      ...(orientation === "portrait" || orientation === "landscape" ? { orientation } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(pageOrder === "downThenOver" || pageOrder === "overThenDown" ? { pageOrder } : {}),
      margins: {
        ...DEFAULT_SHEET_PAGE_SETUP.margins,
        ...(millimetres("top") !== undefined ? { top: millimetres("top") } : {}),
        ...(millimetres("bottom") !== undefined ? { bottom: millimetres("bottom") } : {}),
        ...(millimetres("left") !== undefined ? { left: millimetres("left") } : {}),
        ...(millimetres("right") !== undefined ? { right: millimetres("right") } : {}),
        ...(millimetres("header") !== undefined ? { header: millimetres("header") } : {}),
        ...(millimetres("footer") !== undefined ? { footer: millimetres("footer") } : {}),
      },
      header: parseHeaderFooter(oddHeader ? decodeXml(oddHeader) : undefined),
      footer: parseHeaderFooter(oddFooter ? decodeXml(oddFooter) : undefined),
      ...(headerFooterElement
        ? {
            headerFooter: {
              differentFirst: truthy(attribute(headerFooterAttributes, "differentFirst")),
              differentOddEven: truthy(attribute(headerFooterAttributes, "differentOddEven")),
              scaleWithDocument:
                attribute(headerFooterAttributes, "scaleWithDoc") === undefined ||
                truthy(attribute(headerFooterAttributes, "scaleWithDoc")),
              alignWithMargins:
                attribute(headerFooterAttributes, "alignWithMargins") === undefined ||
                truthy(attribute(headerFooterAttributes, "alignWithMargins")),
              firstHeader: parseHeaderFooter(firstHeader ? decodeXml(firstHeader) : undefined),
              firstFooter: parseHeaderFooter(firstFooter ? decodeXml(firstFooter) : undefined),
              evenHeader: parseHeaderFooter(evenHeader ? decodeXml(evenHeader) : undefined),
              evenFooter: parseHeaderFooter(evenFooter ? decodeXml(evenFooter) : undefined),
            },
          }
        : {}),
      printArea: printAreas[index],
      rowBreaks,
      columnBreaks,
    });
  });
}

function columnLabel(column: number): string {
  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function printAreaReference(sheet: Sheet, range: CellRange): string {
  const cell = (address: { row: number; column: number }) =>
    `$${columnLabel(address.column)}$${address.row + 1}`;
  return `'${sheet.name.replaceAll("'", "''")}'!${cell(range.start)}:${cell(range.end)}`;
}

export function collectPrintAreaDefinedNames(workbook: Workbook): Array<{
  name: string;
  localSheetId: number;
  reference: string;
}> {
  return [...workbook.sheets.values()].flatMap((sheet, index) =>
    sheet.pageSetup?.printArea
      ? [
          {
            name: "_xlnm.Print_Area",
            localSheetId: index,
            reference: printAreaReference(sheet, sheet.pageSetup.printArea),
          },
        ]
      : [],
  );
}

function removeElement(xml: string, tag: string): string {
  return xml.replace(new RegExp(`<${tag}\\b[^>]*(?:/>|>[\\s\\S]*?<\\/${tag}>)`, "i"), "");
}

function replaceElement(xml: string, tag: string, replacement: string, after: RegExp): string {
  const expression = new RegExp(`<${tag}\\b[^>]*(?:/>|>[\\s\\S]*?<\\/${tag}>)`, "i");
  if (expression.test(xml)) return xml.replace(expression, replacement);
  if (after.test(xml)) return xml.replace(after, (match) => `${match}${replacement}`);
  return xml.replace(/<\/worksheet\s*>/i, `${replacement}</worksheet>`);
}

function breaksXml(tag: "rowBreaks" | "colBreaks", values: readonly number[]): string {
  const breaks = [...new Set(values)]
    .filter(Number.isInteger)
    .filter((value) => value > 0 && value < (tag === "rowBreaks" ? 1_048_576 : 16_384))
    .sort((left, right) => left - right);
  if (!breaks.length) return "";
  const bounds = tag === "rowBreaks" ? 'max="16383"' : 'min="0" max="1048575"';
  return `<${tag} count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((id) => `<brk id="${id}" ${bounds} man="1"/>`).join("")}</${tag}>`;
}

/** Writes only the supported Core page-setup contract to freshly generated XLSX parts. */
export function writeXlsxPageSetups(
  entries: Unzipped,
  setups: readonly (SheetPageSetup | undefined)[],
): void {
  for (const [index, setup] of setups.entries()) {
    if (!setup) continue;
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    let xml = strFromU8(entry);
    const margins = setup.margins;
    const inch = (value: number) => String(Number((value / MILLIMETRES_PER_INCH).toFixed(12)));
    xml = replaceElement(
      xml,
      "headerFooter",
      headerFooterXml(setup.header, setup.footer, getSheetHeaderFooterOptions(setup)),
      /<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/i,
    );
    xml = replaceElement(
      xml,
      "pageMargins",
      `<pageMargins left="${inch(margins.left)}" right="${inch(margins.right)}" top="${inch(margins.top)}" bottom="${inch(margins.bottom)}" header="${inch(margins.header)}" footer="${inch(margins.footer)}"/>`,
      /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/i,
    );
    xml = replaceElement(
      xml,
      "pageSetup",
      `<pageSetup paperSize="${OOXML_PAPER_SIZES.get(setup.paperSize) ?? 9}" orientation="${setup.orientation}" scale="${setup.scale}" pageOrder="${setup.pageOrder}"/>`,
      /<pageMargins\b[^>]*(?:\/>|>[\s\S]*?<\/pageMargins>)/i,
    );
    const rowBreaks = [...readBreaks(xml, "rowBreaks"), ...setup.rowBreaks];
    const columnBreaks = [...readBreaks(xml, "colBreaks"), ...setup.columnBreaks];
    xml = removeElement(removeElement(xml, "rowBreaks"), "colBreaks");
    const rowXml = breaksXml("rowBreaks", rowBreaks);
    const columnXml = breaksXml("colBreaks", columnBreaks);
    if (rowXml || columnXml)
      xml = xml.replace(/<\/worksheet\s*>/i, `${rowXml}${columnXml}</worksheet>`);
    entries[path] = strToU8(xml);
  }
}
