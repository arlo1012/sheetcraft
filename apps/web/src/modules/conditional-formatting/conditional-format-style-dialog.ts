import type { ConditionalFormatStyle } from "@sheetcraft/core/conditional-formatting";
import type {
  CellBorderAction,
  CellBorderFormatPatch,
  CellStylePatch,
} from "@sheetcraft/core/style";
import type { SelectionBorderState, SelectionCellStyleState } from "@sheetcraft/core/style-state";
import {
  mergeStyleFormatChange,
  styleFormatToBorderState,
  stylePatchToDialogPatch,
  stylePatchToSelectionState,
} from "../../shared/cell-format/style-format-dialog";

export function conditionalStyleToSelectionState(
  style: ConditionalFormatStyle,
): SelectionCellStyleState {
  return stylePatchToSelectionState(style);
}
export function conditionalStyleToBorderState(style: ConditionalFormatStyle): SelectionBorderState {
  return styleFormatToBorderState({ style });
}
export function conditionalStyleToPatch(style: ConditionalFormatStyle): CellStylePatch {
  return stylePatchToDialogPatch(style);
}
export function mergeConditionalStyleChange(
  style: ConditionalFormatStyle,
  patch: CellStylePatch | undefined,
  actions: readonly CellBorderAction[] | undefined,
  borderFormat?: CellBorderFormatPatch,
): ConditionalFormatStyle {
  return mergeStyleFormatChange(
    { style },
    {
      ...(patch ? { style: patch } : {}),
      ...(actions ? { borders: [...actions] } : {}),
      ...(borderFormat ? { borderFormat } : {}),
    },
    { includeInnerBorders: false, clearValue: false },
  ).style as ConditionalFormatStyle;
}
