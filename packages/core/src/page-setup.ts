import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import type { CellRange } from "./workbook.js";

export type SheetPaperSize = "a4" | "a3" | "letter" | "legal";
export type SheetPageOrder = "downThenOver" | "overThenDown";
export type SheetHeaderFooterParts = { left: string; center: string; right: string };
export type SheetHeaderFooterOptions = {
  differentFirst: boolean;
  differentOddEven: boolean;
  scaleWithDocument: boolean;
  alignWithMargins: boolean;
  firstHeader: SheetHeaderFooterParts;
  firstFooter: SheetHeaderFooterParts;
  evenHeader: SheetHeaderFooterParts;
  evenFooter: SheetHeaderFooterParts;
};

export const DEFAULT_SHEET_HEADER_FOOTER_OPTIONS: SheetHeaderFooterOptions = {
  differentFirst: false,
  differentOddEven: false,
  scaleWithDocument: true,
  alignWithMargins: true,
  firstHeader: { left: "", center: "", right: "" },
  firstFooter: { left: "", center: "", right: "" },
  evenHeader: { left: "", center: "", right: "" },
  evenFooter: { left: "", center: "", right: "" },
};

export type SheetPageSetup = {
  paperSize: SheetPaperSize;
  orientation: "portrait" | "landscape";
  /** Print margins in millimetres. */
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    header: number;
    footer: number;
  };
  scale: number;
  printArea: CellRange | null;
  /** Zero-based first row of a new printed page. */
  rowBreaks: number[];
  /** Zero-based first column of a new printed page. */
  columnBreaks: number[];
  /** Odd-page header text, using OOXML header/footer field syntax. */
  header: SheetHeaderFooterParts;
  /** Odd-page footer text, using OOXML header/footer field syntax. */
  footer: SheetHeaderFooterParts;
  /** Optional in source snapshots; normalized setups always include it. */
  headerFooter?: SheetHeaderFooterOptions;
  pageOrder: SheetPageOrder;
};

export const PAGE_PAPER_SIZES_MM: Record<SheetPaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

export const DEFAULT_SHEET_PAGE_SETUP: SheetPageSetup = {
  paperSize: "a4",
  orientation: "portrait",
  margins: { top: 19.05, bottom: 19.05, left: 17.78, right: 17.78, header: 7.62, footer: 7.62 },
  scale: 100,
  printArea: null,
  rowBreaks: [],
  columnBreaks: [],
  header: { left: "", center: "", right: "" },
  footer: { left: "", center: "", right: "" },
  headerFooter: DEFAULT_SHEET_HEADER_FOOTER_OPTIONS,
  pageOrder: "downThenOver",
};

const MAX_HEADER_FOOTER_LENGTH = 1024;

function cloneRange(range: CellRange): CellRange {
  return {
    start: { row: range.start.row, column: range.start.column },
    end: { row: range.end.row, column: range.end.column },
  };
}

function normalizeRange(value: unknown): CellRange {
  if (!value || typeof value !== "object")
    throw new TypeError("Print area must be a cell range or null.");
  const range = value as CellRange;
  const valid = (address: unknown): address is { row: number; column: number } =>
    !!address &&
    typeof address === "object" &&
    Number.isInteger((address as { row?: unknown }).row) &&
    Number.isInteger((address as { column?: unknown }).column) &&
    (address as { row: number }).row >= 0 &&
    (address as { row: number }).row < MAX_SHEET_ROWS &&
    (address as { column: number }).column >= 0 &&
    (address as { column: number }).column < MAX_SHEET_COLUMNS;
  if (!valid(range.start) || !valid(range.end))
    throw new RangeError("Print area is outside the sheet.");
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function normalizeBreaks(value: unknown, maximum: number, axis: string): number[] {
  if (!Array.isArray(value)) throw new TypeError(`${axis} breaks must be an array.`);
  const breaks = value.map((item) => {
    if (!Number.isInteger(item) || item <= 0 || item >= maximum)
      throw new RangeError(`${axis} breaks must be zero-based in-sheet page starts.`);
    return item;
  });
  return [...new Set(breaks)].sort((left, right) => left - right);
}

function normalizeParts(value: unknown, label: string): SheetHeaderFooterParts {
  if (!value || typeof value !== "object")
    throw new TypeError(`${label} must have left, center, and right text.`);
  const parts = value as Record<string, unknown>;
  const validate = (part: "left" | "center" | "right") => {
    const text = parts[part];
    if (typeof text !== "string" || text.length > MAX_HEADER_FOOTER_LENGTH)
      throw new RangeError(
        `${label}.${part} must be text no longer than ${MAX_HEADER_FOOTER_LENGTH} characters.`,
      );
    return text;
  };
  return { left: validate("left"), center: validate("center"), right: validate("right") };
}

function normalizeHeaderFooterOptions(value: unknown): SheetHeaderFooterOptions {
  if (value === undefined) value = DEFAULT_SHEET_HEADER_FOOTER_OPTIONS;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Header/footer options must be an object.");
  const options = value as Record<string, unknown>;
  const boolean = (
    name: "differentFirst" | "differentOddEven" | "scaleWithDocument" | "alignWithMargins",
  ) => {
    if (typeof options[name] !== "boolean")
      throw new TypeError(`Header/footer option ${name} must be a boolean.`);
    return options[name];
  };
  return {
    differentFirst: boolean("differentFirst"),
    differentOddEven: boolean("differentOddEven"),
    scaleWithDocument: boolean("scaleWithDocument"),
    alignWithMargins: boolean("alignWithMargins"),
    firstHeader: normalizeParts(options.firstHeader, "First header"),
    firstFooter: normalizeParts(options.firstFooter, "First footer"),
    evenHeader: normalizeParts(options.evenHeader, "Even header"),
    evenFooter: normalizeParts(options.evenFooter, "Even footer"),
  };
}

/** Returns a detached canonical header/footer configuration, including legacy defaults. */
export function cloneSheetHeaderFooterOptions(
  options: SheetHeaderFooterOptions | undefined,
): SheetHeaderFooterOptions {
  return normalizeHeaderFooterOptions(options);
}

/** Reads the canonical header/footer configuration from a page setup. */
export function getSheetHeaderFooterOptions(
  pageSetup: Pick<SheetPageSetup, "headerFooter">,
): SheetHeaderFooterOptions {
  return cloneSheetHeaderFooterOptions(pageSetup.headerFooter);
}

/** Validates persisted page settings and returns a detached, canonical value. */
export function normalizeSheetPageSetup(value: unknown): SheetPageSetup {
  if (!value || typeof value !== "object") throw new TypeError("Page setup must be an object.");
  const setup = value as Record<string, unknown>;
  if (typeof setup.paperSize !== "string" || !Object.hasOwn(PAGE_PAPER_SIZES_MM, setup.paperSize))
    throw new TypeError("Unsupported paper size.");
  if (setup.orientation !== "portrait" && setup.orientation !== "landscape")
    throw new TypeError("Unsupported page orientation.");
  if (!setup.margins || typeof setup.margins !== "object")
    throw new TypeError("Page margins must be an object.");
  const marginSource = setup.margins as Record<string, unknown>;
  const margin = (name: "top" | "bottom" | "left" | "right" | "header" | "footer") => {
    const item = marginSource[name];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0)
      throw new RangeError(`Page margin ${name} must be finite and non-negative.`);
    return item;
  };
  const paperSize = setup.paperSize as SheetPaperSize;
  const margins = {
    top: margin("top"),
    bottom: margin("bottom"),
    left: margin("left"),
    right: margin("right"),
    header: margin("header"),
    footer: margin("footer"),
  };
  const paper = PAGE_PAPER_SIZES_MM[paperSize];
  const width = setup.orientation === "landscape" ? paper.height : paper.width;
  const height = setup.orientation === "landscape" ? paper.width : paper.height;
  if (margins.left + margins.right >= width || margins.top + margins.bottom >= height)
    throw new RangeError("Page margins leave no usable paper area.");
  if (margins.header > margins.top || margins.footer > margins.bottom)
    throw new RangeError(
      "Header and footer margins must remain within the top and bottom page margins.",
    );
  if (
    !Number.isInteger(setup.scale) ||
    (setup.scale as number) < 10 ||
    (setup.scale as number) > 400
  )
    throw new RangeError("Page scale must be an integer from 10 through 400.");
  if (setup.printArea !== null && setup.printArea === undefined)
    throw new TypeError("Print area must be a cell range or null.");
  if (setup.pageOrder !== "downThenOver" && setup.pageOrder !== "overThenDown")
    throw new TypeError("Unsupported page order.");
  return {
    paperSize,
    orientation: setup.orientation,
    margins,
    scale: setup.scale as number,
    printArea: setup.printArea === null ? null : normalizeRange(setup.printArea),
    rowBreaks: normalizeBreaks(setup.rowBreaks, MAX_SHEET_ROWS, "Row"),
    columnBreaks: normalizeBreaks(setup.columnBreaks, MAX_SHEET_COLUMNS, "Column"),
    header: normalizeParts(setup.header, "Header"),
    footer: normalizeParts(setup.footer, "Footer"),
    headerFooter: normalizeHeaderFooterOptions(setup.headerFooter),
    pageOrder: setup.pageOrder,
  };
}

export function cloneSheetPageSetup(setup: SheetPageSetup): SheetPageSetup {
  return normalizeSheetPageSetup(setup);
}

/** Returns physical paper bounds in millimetres after orientation has been applied. */
export function getPagePaperSize(pageSetup: Pick<SheetPageSetup, "paperSize" | "orientation">): {
  width: number;
  height: number;
} {
  if (!Object.hasOwn(PAGE_PAPER_SIZES_MM, pageSetup.paperSize))
    throw new TypeError("Unsupported paper size.");
  const paper = PAGE_PAPER_SIZES_MM[pageSetup.paperSize];
  if (pageSetup.orientation === "portrait") return { ...paper };
  if (pageSetup.orientation === "landscape") return { width: paper.height, height: paper.width };
  throw new TypeError("Unsupported page orientation.");
}

export function clonePageSetupRange(range: CellRange | null): CellRange | null {
  return range ? cloneRange(range) : null;
}
