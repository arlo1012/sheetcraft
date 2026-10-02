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

function titleRange(value: string, axis: "row" | "column"): { start: number; end: number } | null {
  const match =
    axis === "row" ? /^\$?(\d+):\$?(\d+)$/i.exec(value) : /^\$?([A-Z]+):\$?([A-Z]+)$/i.exec(value);
  if (!match) return null;
  const index = (source: string) =>
    axis === "row"
      ? Number(source) - 1
      : [...source.toUpperCase()].reduce(
          (total, character) => total * 26 + character.charCodeAt(0) - 64,
          0,
        ) - 1;
  const start = index(match[1] ?? "");
  const end = index(match[2] ?? "");
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start
    ? { start, end }
    : null;
}

function readPrintTitles(
  bytes: Uint8Array,
  sheets: readonly Pick<Sheet, "name">[],
): Array<SheetPageSetup["printTitles"]> {
  const workbook = unzipSync(bytes)["xl/workbook.xml"];
  const result: Array<NonNullable<SheetPageSetup["printTitles"]>> = sheets.map(() => ({
    rows: null,
    columns: null,
    bottomRows: null,
  }));
  if (!workbook) return result;
  for (const match of strFromU8(workbook).matchAll(
    /<(?:\w+:)?definedName\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?definedName\s*>/gi,
  )) {
    const attrs = match[1] ?? "";
    if ((attribute(attrs, "name") ?? "").toLowerCase() !== "_xlnm.print_titles") continue;
    const index = Number(attribute(attrs, "localSheetId"));
    if (!Number.isInteger(index) || !result[index]) continue;
    const parts = decodeXml(match[2] ?? "").split(",");
    for (const part of parts) {
      const reference = part
        .trim()
        .replace(/^'(?:[^']|'')+'!/, "")
        .replace(/^[^'!]+!/, "");
      const rows = titleRange(reference, "row");
      const columns = titleRange(reference, "column");
      if (rows) result[index].rows = rows;
      if (columns) result[index].columns = columns;
    }
  }
  return result;
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
  const printTitles = readPrintTitles(bytes, sheets);
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
    const hasPrintOptions = /<printOptions\b/i.test(xml);
    const hasFitToPage = /<pageSetUpPr\b[^>]*\bfitToPage\s*=\s*(["'])(?:1|true)\1/i.test(xml);
    const hasPrintTitles =
      printTitles[index]?.rows !== null || printTitles[index]?.columns !== null;
    const rowBreaks = readBreaks(xml, "rowBreaks");
    const columnBreaks = readBreaks(xml, "colBreaks");
    const hasSetup =
      !!margins ||
      !!setup ||
      !!headerFooter ||
      hasPrintOptions ||
      hasFitToPage ||
      hasPrintTitles ||
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
    const pageSetUpPr = /<pageSetUpPr\b([^>]*)\/?\s*>/i.exec(xml)?.[1] ?? "";
    const fitToPage = truthy(attribute(pageSetUpPr, "fitToPage"));
    const fitToWidth = parseNumber(attribute(setup ?? "", "fitToWidth"));
    const fitToHeight = parseNumber(attribute(setup ?? "", "fitToHeight"));
    const customWidth = /^([0-9]+(?:\.[0-9]+)?)mm$/i.exec(
      attribute(setup ?? "", "paperWidth") ?? "",
    )?.[1];
    const customHeight = /^([0-9]+(?:\.[0-9]+)?)mm$/i.exec(
      attribute(setup ?? "", "paperHeight") ?? "",
    )?.[1];
    const firstPageNumber = truthy(attribute(setup ?? "", "useFirstPageNumber"))
      ? parseNumber(attribute(setup ?? "", "firstPageNumber"))
      : undefined;
    const parsedQuality = parseNumber(attribute(setup ?? "", "horizontalDpi"));
    const quality =
      parsedQuality !== undefined &&
      Number.isInteger(parsedQuality) &&
      parsedQuality >= 1 &&
      parsedQuality <= 9600
        ? parsedQuality
        : undefined;
    const printOptions = /<printOptions\b([^>]*)\/?\s*>/i.exec(xml)?.[1] ?? "";
    const millimetres = (name: string) => {
      const inches = parseNumber(attribute(margins ?? "", name));
      return inches !== undefined && inches >= 0
        ? Number((inches * MILLIMETRES_PER_INCH).toFixed(12))
        : undefined;
    };
    return normalizeSheetPageSetup({
      ...DEFAULT_SHEET_PAGE_SETUP,
      ...(customWidth && customHeight
        ? {
            paperSize: "custom",
            customPaperSize: { width: Number(customWidth), height: Number(customHeight) },
          }
        : paperSize
          ? { paperSize }
          : {}),
      ...(fitToPage ? { fitToPage: { width: fitToWidth ?? 1, height: fitToHeight ?? 1 } } : {}),
      ...(firstPageNumber !== undefined ? { firstPageNumber } : {}),
      ...(quality !== undefined ? { printQuality: quality } : {}),
      printOptions: {
        horizontalCentered: truthy(attribute(printOptions, "horizontalCentered")),
        verticalCentered: truthy(attribute(printOptions, "verticalCentered")),
        gridLines: truthy(attribute(printOptions, "gridLines")),
        blackAndWhite: truthy(attribute(setup ?? "", "blackAndWhite")),
        headings: truthy(attribute(printOptions, "headings")),
        cellComments:
          attribute(setup ?? "", "cellComments") === "atEnd"
            ? "atEnd"
            : attribute(setup ?? "", "cellComments") === "asDisplayed"
              ? "asDisplayed"
              : "none",
        errors:
          attribute(setup ?? "", "errors") === "blank"
            ? "blank"
            : attribute(setup ?? "", "errors") === "dash"
              ? "dash"
              : attribute(setup ?? "", "errors") === "NA"
                ? "NA"
                : "displayed",
      },
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
      printTitles: printTitles[index],
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

function printTitleReference(
  sheet: Sheet,
  titles: NonNullable<SheetPageSetup["printTitles"]>,
): string | null {
  const name = `'${sheet.name.replaceAll("'", "''")}'!`;
  const rows = titles.rows ? `${name}$${titles.rows.start + 1}:$${titles.rows.end + 1}` : null;
  const columns = titles.columns
    ? `${name}$${columnLabel(titles.columns.start)}:$${columnLabel(titles.columns.end)}`
    : null;
  return [rows, columns].filter((value): value is string => Boolean(value)).join(",") || null;
}

export function collectPrintTitleDefinedNames(workbook: Workbook): Array<{
  name: string;
  localSheetId: number;
  reference: string;
}> {
  return [...workbook.sheets.values()].flatMap((sheet, index) => {
    const reference =
      sheet.pageSetup?.printTitles && printTitleReference(sheet, sheet.pageSetup.printTitles);
    return reference ? [{ name: "_xlnm.Print_Titles", localSheetId: index, reference }] : [];
  });
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
  report?: CompatibilityReportBuilder,
): void {
  for (const [index, setup] of setups.entries()) {
    if (!setup) continue;
    if (setup.printTitles?.bottomRows)
      report?.add("feature-omitted", "warning", `sheet${index + 1}.printTitles.bottomRows`);
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    let xml = strFromU8(entry);
    const margins = setup.margins;
    const printOptions = setup.printOptions ?? DEFAULT_SHEET_PAGE_SETUP.printOptions!;
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
    const printOptionsXml = [
      printOptions.horizontalCentered ? ' horizontalCentered="1"' : "",
      printOptions.verticalCentered ? ' verticalCentered="1"' : "",
      printOptions.gridLines ? ' gridLines="1"' : "",
      printOptions.headings ? ' headings="1"' : "",
    ].join("");
    xml = printOptionsXml
      ? replaceElement(
          xml,
          "printOptions",
          `<printOptions${printOptionsXml}/>`,
          /<pageMargins\b[^>]*(?:\/>|>[\s\S]*?<\/pageMargins>)/i,
        )
      : removeElement(xml, "printOptions");
    const pageSetUpPr = setup.fitToPage ? `<pageSetUpPr fitToPage="1"/>` : "";
    const sheetPr = /<sheetPr\b([^>]*)\/>/i;
    const sheetPrPair = /<sheetPr\b([^>]*)>([\s\S]*?)<\/sheetPr>/i;
    if (sheetPr.test(xml)) {
      xml = xml.replace(sheetPr, (match, attributes: string) =>
        pageSetUpPr ? `<sheetPr${attributes}>${pageSetUpPr}</sheetPr>` : match,
      );
    } else if (sheetPrPair.test(xml)) {
      xml = xml.replace(sheetPrPair, (_match, attributes: string, content: string) => {
        const withoutPageSetup = removeElement(content, "pageSetUpPr");
        return `<sheetPr${attributes}>${withoutPageSetup}${pageSetUpPr}</sheetPr>`;
      });
    } else if (pageSetUpPr) {
      xml = xml.replace(
        /<worksheet\b[^>]*>/i,
        (match) => `${match}<sheetPr>${pageSetUpPr}</sheetPr>`,
      );
    }
    xml = replaceElement(
      xml,
      "pageSetup",
      `<pageSetup${setup.paperSize === "custom" && setup.customPaperSize ? ` paperWidth="${setup.customPaperSize.width}mm" paperHeight="${setup.customPaperSize.height}mm"` : ` paperSize="${OOXML_PAPER_SIZES.get(setup.paperSize) ?? 9}"`} orientation="${setup.orientation}"${setup.fitToPage ? ` fitToWidth="${setup.fitToPage.width}" fitToHeight="${setup.fitToPage.height}"` : ` scale="${setup.scale}"`}${setup.firstPageNumber !== null ? ` firstPageNumber="${setup.firstPageNumber}" useFirstPageNumber="1"` : ""} horizontalDpi="${setup.printQuality}" verticalDpi="${setup.printQuality}"${printOptions.blackAndWhite ? ' blackAndWhite="1"' : ""}${printOptions.cellComments === "none" ? "" : ` cellComments="${printOptions.cellComments}"`}${printOptions.errors === "displayed" ? "" : ` errors="${printOptions.errors}"`} pageOrder="${setup.pageOrder}"/>`,
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
