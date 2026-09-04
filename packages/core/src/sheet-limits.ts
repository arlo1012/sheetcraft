export const MAX_SHEET_ROWS = 1_048_576;
export const MAX_SHEET_COLUMNS = 16_384;

export type SheetAddress = {
  row: number;
  column: number;
};

export function isSheetAddressInBounds(address: SheetAddress): boolean {
  return (
    Number.isInteger(address.row) &&
    Number.isInteger(address.column) &&
    address.row >= 0 &&
    address.row < MAX_SHEET_ROWS &&
    address.column >= 0 &&
    address.column < MAX_SHEET_COLUMNS
  );
}
