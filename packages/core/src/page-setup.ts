import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import type { CellRange } from "./workbook.js";

export type SheetPaperSize = "a4" | "a3" | "letter" | "legal" | "custom";
export type SheetCustomPaperSize = { width: number; height: number };
export type SheetPageFitToPage = { width: number; height: number };
export type SheetPagePrintOptions = {
  horizontalCentered: boolean;
  verticalCentered: boolean;
  gridLines: boolean;
  blackAndWhite: boolean;
  headings: boolean;
  cellComments: "none" | "atEnd" | "asDisplayed";
  errors: "displayed" | "blank" | "dash" | "NA";
};
export type SheetPrintTitleRange = { start: number; end: number };
export type SheetPrintTitles = {
  rows: SheetPrintTitleRange | null;
  columns: SheetPrintTitleRange | null;
  bottomRows: SheetPrintTitleRange | null;
};
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

export const DEFAULT_SHEET_PAGE_PRINT_OPTIONS: SheetPagePrintOptions = {
  horizontalCentered: false,
  verticalCentered: false,
  gridLines: false,
  blackAndWhite: false,
  headings: false,
  cellComments: "none",
  errors: "displayed",
};

export const DEFAULT_SHEET_PRINT_TITLES: SheetPrintTitles = {
  rows: null,
  columns: null,
  bottomRows: null,
};

export type SheetPageSetup = {
  paperSize: SheetPaperSize;
  /** Millimetres before orientation is applied. */
  customPaperSize?: SheetCustomPaperSize;
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
  /** Null leaves the scale unchanged; zero means unlimited on that axis. */
  fitToPage?: SheetPageFitToPage | null;
  /** Null lets the renderer choose the first printed page automatically. */
  firstPageNumber?: number | null;
  printQuality?: number;
  printOptions?: SheetPagePrintOptions;
  printTitles?: SheetPrintTitles;
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

export const PAGE_PAPER_SIZES_MM: Record<
  Exclude<SheetPaperSize, "custom">,
  SheetCustomPaperSize
> = {
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
  fitToPage: null,
  firstPageNumber: null,
  printQuality: 600,
  printOptions: DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  printTitles: DEFAULT_SHEET_PRINT_TITLES,
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

function normalizeCustomPaperSize(value: unknown): SheetCustomPaperSize {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Custom paper size must have width and height.");
  const paper = value as Record<string, unknown>;
  const dimension = (name: "width" | "height") => {
    const item = paper[name];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 1 || item > 5000)
      throw new RangeError(`Custom paper ${name} must be from 1 through 5000 millimetres.`);
    return item;
  };
  return { width: dimension("width"), height: dimension("height") };
}

function normalizeFitToPage(value: unknown): SheetPageFitToPage | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Fit to page must be an object or null.");
  const fit = value as Record<string, unknown>;
  const axis = (name: "width" | "height") => {
    const item = fit[name];
    if (!Number.isInteger(item) || (item as number) < 0 || (item as number) > 32767)
      throw new RangeError(`Fit to page ${name} must be an integer from 0 through 32767.`);
    return item as number;
  };
  const result = { width: axis("width"), height: axis("height") };
  if (result.width === 0 && result.height === 0)
    throw new RangeError("Fit to page cannot leave both axes unlimited.");
  return result;
}

function normalizePrintOptions(value: unknown): SheetPagePrintOptions {
  if (value === undefined) return { ...DEFAULT_SHEET_PAGE_PRINT_OPTIONS };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Print options must be an object.");
  const options = value as Record<string, unknown>;
  const boolean = (
    name: "horizontalCentered" | "verticalCentered" | "gridLines" | "blackAndWhite" | "headings",
  ) => {
    if (typeof options[name] !== "boolean")
      throw new TypeError(`Print option ${name} must be a boolean.`);
    return options[name];
  };
  const cellComments = options.cellComments;
  const errors = options.errors;
  if (cellComments !== "none" && cellComments !== "atEnd" && cellComments !== "asDisplayed")
    throw new TypeError("Unsupported cell comment print option.");
  if (errors !== "displayed" && errors !== "blank" && errors !== "dash" && errors !== "NA")
    throw new TypeError("Unsupported print error option.");
  return {
    horizontalCentered: boolean("horizontalCentered"),
    verticalCentered: boolean("verticalCentered"),
    gridLines: boolean("gridLines"),
    blackAndWhite: boolean("blackAndWhite"),
    headings: boolean("headings"),
    cellComments,
    errors,
  };
}

function normalizePrintTitles(value: unknown): SheetPrintTitles {
  if (value === undefined) return { ...DEFAULT_SHEET_PRINT_TITLES };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Print titles must be an object.");
  const titles = value as Record<string, unknown>;
  const range = (
    name: "rows" | "columns" | "bottomRows",
    maximum: number,
  ): SheetPrintTitleRange | null => {
    const item = titles[name];
    if (item === undefined || item === null) return null;
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new TypeError(`Print title ${name} must be a range or null.`);
    const source = item as Record<string, unknown>;
    const start = source.start;
    const end = source.end;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      (start as number) < 0 ||
      (end as number) < (start as number) ||
      (end as number) >= maximum
    )
      throw new RangeError(`Print title ${name} must be an in-sheet zero-based range.`);
    return { start: start as number, end: end as number };
  };
  return {
    rows: range("rows", MAX_SHEET_ROWS),
    columns: range("columns", MAX_SHEET_COLUMNS),
    bottomRows: range("bottomRows", MAX_SHEET_ROWS),
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
  if (
    setup.paperSize !== "custom" &&
    (typeof setup.paperSize !== "string" || !Object.hasOwn(PAGE_PAPER_SIZES_MM, setup.paperSize))
  )
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
  const customPaperSize =
    setup.customPaperSize === undefined
      ? undefined
      : normalizeCustomPaperSize(setup.customPaperSize);
  if (paperSize === "custom" && !customPaperSize)
    throw new TypeError("Custom paper size must have width and height.");
  const margins = {
    top: margin("top"),
    bottom: margin("bottom"),
    left: margin("left"),
    right: margin("right"),
    header: margin("header"),
    footer: margin("footer"),
  };
  const paper =
    paperSize === "custom"
      ? customPaperSize!
      : PAGE_PAPER_SIZES_MM[paperSize as Exclude<SheetPaperSize, "custom">];
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
  const firstPageNumber: number | null =
    setup.firstPageNumber === undefined || setup.firstPageNumber === null
      ? null
      : (setup.firstPageNumber as number);
  if (
    (!Number.isInteger(firstPageNumber) && firstPageNumber !== null) ||
    (typeof firstPageNumber === "number" && (firstPageNumber < 1 || firstPageNumber > 32767))
  )
    throw new RangeError("First page number must be an integer from 1 through 32767 or null.");
  const printQuality: number =
    setup.printQuality === undefined ? 600 : (setup.printQuality as number);
  if (!Number.isInteger(printQuality) || printQuality <= 0 || printQuality > 9600)
    throw new RangeError("Print quality must be a positive integer through 9600.");
  return {
    paperSize,
    ...(customPaperSize ? { customPaperSize } : {}),
    orientation: setup.orientation,
    margins,
    scale: setup.scale as number,
    fitToPage: normalizeFitToPage(setup.fitToPage),
    firstPageNumber,
    printQuality,
    printOptions: normalizePrintOptions(setup.printOptions),
    printTitles: normalizePrintTitles(setup.printTitles),
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
export function getPagePaperSize(
  pageSetup: Pick<SheetPageSetup, "paperSize" | "customPaperSize" | "orientation">,
): {
  width: number;
  height: number;
} {
  const paper =
    pageSetup.paperSize === "custom"
      ? normalizeCustomPaperSize(pageSetup.customPaperSize)
      : Object.hasOwn(PAGE_PAPER_SIZES_MM, pageSetup.paperSize)
        ? PAGE_PAPER_SIZES_MM[pageSetup.paperSize]
        : (() => {
            throw new TypeError("Unsupported paper size.");
          })();
  if (pageSetup.orientation === "portrait") return { ...paper };
  if (pageSetup.orientation === "landscape") return { width: paper.height, height: paper.width };
  throw new TypeError("Unsupported page orientation.");
}

export function clonePageSetupRange(range: CellRange | null): CellRange | null {
  return range ? cloneRange(range) : null;
}
