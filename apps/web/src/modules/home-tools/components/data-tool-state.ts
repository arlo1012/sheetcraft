import type { CellAddress, SheetFilterValue } from "@idea10/core/workbook";
import type { CellMergeMode } from "@idea10/core/commands";

export type FilterValueKey = SheetFilterValue;

export type FilterValueOption = {
  key: FilterValueKey;
  label: string;
  count?: number;
};

export type HomeDataToolState = {
  activeCell: CellAddress;
  sortEnabled: boolean;
  filterEnabled: boolean;
  freezeEnabled: boolean;
  filter: {
    active: boolean;
    options: readonly FilterValueOption[];
    appliedKeys: readonly FilterValueKey[];
  };
  freeze: { rows: number; columns: number };
};

export type MergeCellsState = {
  canMerge: boolean;
  canUnmerge: boolean;
  availableModes?: Record<CellMergeMode, boolean>;
};

export function createDefaultHomeDataToolState(): HomeDataToolState {
  return {
    activeCell: { row: 0, column: 0 },
    sortEnabled: false,
    filterEnabled: false,
    freezeEnabled: false,
    filter: { active: false, options: [], appliedKeys: [] },
    freeze: { rows: 0, columns: 0 },
  };
}

export function createDefaultMergeCellsState(): MergeCellsState {
  return { canMerge: false, canUnmerge: false };
}

export function areFilterValueKeysEqual(left: FilterValueKey, right: FilterValueKey): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "blank") return true;
  if (left.kind === "error" && right.kind === "error") return left.code === right.code;
  return "value" in left && "value" in right && left.value === right.value;
}
