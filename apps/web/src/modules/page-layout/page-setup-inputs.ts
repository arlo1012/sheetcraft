import { formatCellAddress, parseCellAddress } from "@sheetcraft/core/coordinates";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellRange } from "@sheetcraft/core/workbook";
import type { SheetPageSetup } from "@sheetcraft/core/page-setup";

export type PageSetupReferences = {
  printArea: string;
  titleRows: string;
  titleColumns: string;
  bottomTitleRows: string;
};
export type PageSetupReferenceField = keyof PageSetupReferences;
export type PageSetupReferenceErrors = Partial<Record<PageSetupReferenceField, string>>;
type TitleRange = NonNullable<NonNullable<SheetPageSetup["printTitles"]>["rows"]>;

export function formatPageSetupRange(range: CellRange | null): string {
  if (!range) return "";
  const start = formatCellAddress(range.start);
  const end = formatCellAddress(range.end);
  return start === end ? start : `${start}:${end}`;
}

export function parsePageSetupRange(value: string): CellRange | null | undefined {
  const text = value.trim();
  if (!text) return null;
  if (text.includes("!") || text.includes(",")) return undefined;
  const pieces = text.replaceAll("$", "").split(":");
  if (pieces.length > 2) return undefined;
  const [first, last = first] = pieces;
  if (!first || !last) return undefined;
  const start = parseCellAddress(first);
  const end = parseCellAddress(last);
  if (!start || !end) return undefined;
  return {
    start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
    end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
  };
}

export function formatPageSetupTitle(range: TitleRange | null, axis: "row" | "column"): string {
  if (!range) return "";
  const label = (index: number) =>
    axis === "row"
      ? String(index + 1)
      : formatCellAddress({ row: 0, column: index }).replace(/\d+$/, "");
  return `$${label(range.start)}:$${label(range.end)}`;
}

export function parsePageSetupTitle(
  value: string,
  axis: "row" | "column",
): TitleRange | null | undefined {
  const text = value.trim().replaceAll("$", "");
  if (!text) return null;
  const match = (
    axis === "row" ? /^([1-9]\d*)(?::([1-9]\d*))?$/ : /^([A-Z]+)(?::([A-Z]+))?$/i
  ).exec(text);
  if (match) {
    const index = (label: string) =>
      axis === "row" ? Number(label) - 1 : parseCellAddress(`${label}1`)?.column;
    const start = index(match[1]!);
    const end = index(match[2] ?? match[1]!);
    const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
    if (
      start === undefined ||
      end === undefined ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < 0 ||
      start >= maximum ||
      end >= maximum
    )
      return undefined;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }
  const range = parsePageSetupRange(value);
  return range ? { start: range.start[axis], end: range.end[axis] } : undefined;
}

export function createPageSetupReferences(setup: SheetPageSetup): PageSetupReferences {
  return {
    printArea: formatPageSetupRange(setup.printArea),
    titleRows: formatPageSetupTitle(setup.printTitles?.rows ?? null, "row"),
    titleColumns: formatPageSetupTitle(setup.printTitles?.columns ?? null, "column"),
    bottomTitleRows: formatPageSetupTitle(setup.printTitles?.bottomRows ?? null, "row"),
  };
}

export function formatPickedPageSetupReference(
  range: CellRange,
  field: PageSetupReferenceField,
): string {
  if (field === "printArea") return formatPageSetupRange(range);
  const axis = field === "titleColumns" ? "column" : "row";
  return formatPageSetupTitle({ start: range.start[axis], end: range.end[axis] }, axis);
}
