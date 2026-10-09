import {
  MAX_SHEET_COLUMNS,
  getCellContent,
  getCellStyle,
  type CellAddress,
  type CellRange,
  type Sheet,
} from "@sheetcraft/core/workbook";

export type CellTextSpan = Readonly<{
  source: CellAddress;
  range: CellRange;
  kind: "fill" | "centerContinuous";
}>;

/** Adjacent, empty cells carrying the same alignment define a visual span. */
export function createCellTextSpanResolver(
  sheet: Sheet,
  isMerged: (address: CellAddress) => boolean,
  columnCount = MAX_SHEET_COLUMNS,
  isOccupied: (address: CellAddress) => boolean = (address) =>
    Boolean(getCellContent(sheet, address)),
): (address: CellAddress) => CellTextSpan | undefined {
  const cache = new Map<string, CellTextSpan | undefined>();
  return (address) => {
    const key = `${address.row}:${address.column}`;
    if (cache.has(key)) return cache.get(key);
    const kind = getCellStyle(sheet, address)?.horizontalAlign;
    if ((kind !== "fill" && kind !== "centerContinuous") || isMerged(address)) return undefined;
    let column = address.column;
    while (column > 0 && !isOccupied({ row: address.row, column })) {
      const previous = { row: address.row, column: column - 1 };
      if (getCellStyle(sheet, previous)?.horizontalAlign !== kind || isMerged(previous)) break;
      column -= 1;
    }
    const source = { row: address.row, column };
    const content = getCellContent(sheet, source);
    let end = column;
    while (end + 1 < columnCount) {
      const next = { row: address.row, column: end + 1 };
      if (isOccupied(next) || getCellStyle(sheet, next)?.horizontalAlign !== kind || isMerged(next))
        break;
      end += 1;
    }
    const span =
      content && content.kind !== "image"
        ? { source, range: { start: source, end: { row: address.row, column: end } }, kind }
        : undefined;
    for (let index = column; index <= end; index += 1) cache.set(`${address.row}:${index}`, span);
    return span;
  };
}
