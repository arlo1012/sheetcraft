import type { CellAddress, CellRange } from "@sheetcraft/core/workbook";
/** Both conversion and local file insertion use the same explicit overwrite surface. */
export type PictureCellOverwriteConfirmation = {
  key: number;
  address: CellAddress;
  sheetName: string;
  error: boolean;
  errorReason?: "targets" | "command";
  busy?: boolean;
  insertionTargets?: readonly CellRange[];
  occupiedTargetCount?: number;
  confirm: () => boolean | Promise<boolean>;
  cancel: () => void;
};
