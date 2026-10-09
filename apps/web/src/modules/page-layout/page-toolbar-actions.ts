import type { CellAddress } from "@sheetcraft/core/workbook";
import type { SheetPageSetup } from "@sheetcraft/core/page-setup";
import type { SelectionMode } from "@sheetcraft/sheet-engine/selection";

export type PageBreakAction = "insert" | "remove" | "reset";
export type PageSetupTab = "page" | "margins" | "header-footer" | "sheet";

/** Breaks start immediately above/left of the selection; an axis selection changes only that axis. */
export function getPageBreakPatch(
  setup: SheetPageSetup,
  address: CellAddress,
  mode: SelectionMode,
  action: PageBreakAction,
): Partial<SheetPageSetup> {
  if (action === "reset") return { rowBreaks: [], columnBreaks: [] };
  const patch: Partial<SheetPageSetup> = {};
  function update(values: number[], index: number): number[] {
    return action === "insert"
      ? [...new Set([...values, index])].sort((a, b) => a - b)
      : values.filter((value) => value !== index);
  }
  if (mode !== "columns" && mode !== "all" && address.row > 0)
    patch.rowBreaks = update(setup.rowBreaks, address.row);
  if (mode !== "rows" && mode !== "all" && address.column > 0)
    patch.columnBreaks = update(setup.columnBreaks, address.column);
  return patch;
}

export function canChangePageBreak(
  setup: SheetPageSetup,
  address: CellAddress,
  mode: SelectionMode,
  action: PageBreakAction,
): boolean {
  const patch = getPageBreakPatch(setup, address, mode, action);
  return (Object.keys(patch) as ("rowBreaks" | "columnBreaks")[]).some(
    (key) => patch[key]!.join(",") !== setup[key].join(","),
  );
}
