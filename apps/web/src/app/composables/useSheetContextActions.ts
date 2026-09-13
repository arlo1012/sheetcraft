import { shallowRef, watch } from "vue";
import { createSetCellContentCommand, type WorkbookCommand } from "@idea10/core/commands";
import type { CellAddress, CellRange, Sheet } from "@idea10/core/workbook";
import type {
  SheetContextMenuState,
  SheetContextRequest,
} from "../../modules/sheet-grid/context-menu-contracts";
import type { createAxisToolActions } from "../../modules/sheet-grid/axis-tool-actions";
import type { createCellOperationActions } from "../../modules/sheet-grid/cell-operation-actions";
import type { FilterValueKey } from "../../modules/home-tools/components/data-tool-state";
import { createContextClearCommand } from "../../modules/sheet-grid/context-clear-command";

export function useSheetContextActions(options: {
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getAddress: () => CellAddress;
  getState: () => SheetContextMenuState;
  getGeneration: () => number;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  axis: ReturnType<typeof createAxisToolActions>;
  cells: ReturnType<typeof createCellOperationActions>;
  runExisting: (request: SheetContextRequest) => void;
  applyFilter: (keys: FilterValueKey[]) => void;
  focus: () => void;
  onError: () => void;
}) {
  const statisticsRange = shallowRef<CellRange>();
  const choiceAddress = shallowRef<CellAddress>();
  const filterState = shallowRef<SheetContextMenuState["data"]["filter"]>();
  let filterSelection: string | undefined;
  const cloneRange = (range: CellRange): CellRange => ({
    start: { ...range.start },
    end: { ...range.end },
  });
  function selectionKey(): string {
    return JSON.stringify([
      options.getSheet().id,
      options.getGeneration(),
      options.getRange(),
      options.getAddress(),
    ]);
  }

  function closePanels(restoreFocus = true): void {
    statisticsRange.value = undefined;
    choiceAddress.value = undefined;
    filterState.value = undefined;
    filterSelection = undefined;
    if (restoreFocus) options.focus();
  }

  watch(
    () => [options.getSheet().id, options.getGeneration()],
    () => closePanels(false),
  );

  function request(request: SheetContextRequest): void {
    const { action, range } = request;
    if (action.type === "columnStatistics") {
      statisticsRange.value = cloneRange(range);
      return;
    }
    if (options.getSheet().properties.protected || !options.flush()) return;
    const axisSpan = (axis: "row" | "column") => ({
      axis,
      index: axis === "row" ? range.start.row : range.start.column,
      count:
        (axis === "row" ? range.end.row - range.start.row : range.end.column - range.start.column) +
        1,
    });
    try {
      switch (action.type) {
        case "resize":
          options.axis.resize({ ...axisSpan(action.axis), size: action.size });
          break;
        case "autoFit":
          options.axis.autoFit({ axis: action.axis, range });
          break;
        case "visibility":
          options.axis.visibility({ ...axisSpan(action.axis), hidden: action.hidden });
          break;
        case "cellOperation":
          options.cells.cellOperation({ ...action, range });
          break;
        case "deleteEmptyRows":
          options.cells.deleteEmptyRows(range);
          break;
        case "clear":
          options.execute(createContextClearCommand(options.getSheet(), range, action.mode));
          break;
        case "chooseFromColumn":
          choiceAddress.value = { ...options.getAddress() };
          break;
        case "filter": {
          const state = options.getState().data;
          if (!state.filterEnabled) return;
          filterSelection = selectionKey();
          filterState.value = {
            ...state.filter,
            options: [...state.filter.options],
            appliedKeys: state.filter.appliedKeys.map((key) => ({ ...key })),
          };
          break;
        }
        default:
          options.runExisting(request);
      }
    } catch {
      options.onError();
    }
  }

  function choose(value: string): void {
    if (!choiceAddress.value || options.getSheet().properties.protected) return;
    try {
      options.execute(
        createSetCellContentCommand(options.getSheet().id, choiceAddress.value, {
          kind: "literal",
          value,
        }),
      );
      closePanels();
    } catch {
      options.onError();
    }
  }

  function confirmFilter(keys: FilterValueKey[]): void {
    if (!filterState.value || options.getSheet().properties.protected) return;
    if (filterSelection !== selectionKey()) {
      closePanels();
      options.onError();
      return;
    }
    try {
      options.applyFilter(keys);
      closePanels();
    } catch {
      options.onError();
    }
  }

  return {
    request,
    statisticsRange,
    choiceAddress,
    filterState,
    choose,
    confirmFilter,
    closePanels,
  };
}
