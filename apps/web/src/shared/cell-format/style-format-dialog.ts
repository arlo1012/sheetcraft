import type { CellBorder, CellBorderFormatPatch, CellStylePatch } from "@sheetcraft/core/style";
import {
  createDefaultSelectionCellStyleState,
  type SelectionBorderState,
  type SelectionCellStyleState,
} from "@sheetcraft/core/style-state";
import type { CellFormatChange } from "@sheetcraft/core/commands";

const STYLE_KEYS = [
  "numberFormat",
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "fontScript",
  "textColor",
  "fillColor",
  "fillPattern",
  "fillPatternColor",
  "fillGradient",
] as const;

export type StyleFormatDraft = {
  style: CellStylePatch;
  innerHorizontal?: CellBorder | null;
  innerVertical?: CellBorder | null;
};

export type StyleFormatMergeOptions = {
  includeInnerBorders?: boolean;
  clearValue?: null | false;
};

export function stylePatchToSelectionState(style: CellStylePatch): SelectionCellStyleState {
  const state = createDefaultSelectionCellStyleState();
  const record = style as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    const value = record[key];
    if (value === undefined || value === null || value === false) continue;
    if (key === "bold" || key === "italic" || key === "strikethrough")
      (state as Record<string, unknown>)[key] = "on";
    else if (key === "underline") {
      state.underline = "on";
      state.underlineStyle = { value: value as never, mixed: false };
    } else (state as Record<string, unknown>)[key] = { value, mixed: false };
  }
  return state;
}

export function stylePatchToDialogPatch(style: CellStylePatch): CellStylePatch {
  const record = style as Record<string, unknown>;
  return Object.fromEntries(
    STYLE_KEYS.filter((key) => record[key] !== undefined && record[key] !== null).map((key) => [
      key,
      record[key],
    ]),
  ) as CellStylePatch;
}

export function styleFormatToBorderState(format: StyleFormatDraft): SelectionBorderState {
  const sides: Record<string, { value: unknown; mixed: boolean }> = {};
  for (const key of [
    "top",
    "right",
    "bottom",
    "left",
    "innerHorizontal",
    "innerVertical",
    "diagonalUp",
    "diagonalDown",
  ])
    sides[key] = { value: undefined, mixed: false };
  for (const [styleKey, side] of [
    ["borderTop", "top"],
    ["borderRight", "right"],
    ["borderBottom", "bottom"],
    ["borderLeft", "left"],
    ["borderDiagonalUp", "diagonalUp"],
    ["borderDiagonalDown", "diagonalDown"],
  ] as const) {
    const value = format.style[styleKey];
    if (value) sides[side] = { value, mixed: false };
  }
  if (format.innerHorizontal)
    sides.innerHorizontal = { value: format.innerHorizontal, mixed: false };
  if (format.innerVertical) sides.innerVertical = { value: format.innerVertical, mixed: false };
  return sides as SelectionBorderState;
}

export function mergeStyleFormatChange(
  format: StyleFormatDraft,
  change: CellFormatChange,
  options: StyleFormatMergeOptions = {},
): StyleFormatDraft {
  const includeInnerBorders = options.includeInnerBorders ?? true;
  const clearValue = options.clearValue ?? null;
  const next: StyleFormatDraft = { style: { ...format.style } };
  if (format.innerHorizontal !== undefined) next.innerHorizontal = format.innerHorizontal;
  if (format.innerVertical !== undefined) next.innerVertical = format.innerVertical;
  for (const key of STYLE_KEYS)
    if (change.style && Object.hasOwn(change.style, key))
      (next.style as Record<string, unknown>)[key] =
        (change.style as Record<string, unknown>)[key] ?? clearValue;
  const sides: Record<string, readonly (keyof CellStylePatch)[]> = {
    top: ["borderTop"],
    right: ["borderRight"],
    bottom: ["borderBottom"],
    left: ["borderLeft"],
    diagonalUp: ["borderDiagonalUp"],
    diagonalDown: ["borderDiagonalDown"],
    outer: ["borderTop", "borderRight", "borderBottom", "borderLeft"],
    all: ["borderTop", "borderRight", "borderBottom", "borderLeft"],
    none: [
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "borderDiagonalUp",
      "borderDiagonalDown",
    ],
  };
  for (const action of change.borders ?? []) {
    const border = action.border ?? clearValue;
    if (action.preset === "innerHorizontal") {
      if (includeInnerBorders) next.innerHorizontal = border as CellBorder | null;
    } else if (action.preset === "innerVertical") {
      if (includeInnerBorders) next.innerVertical = border as CellBorder | null;
    } else if (action.preset === "inner") {
      if (includeInnerBorders) {
        next.innerHorizontal = border as CellBorder | null;
        next.innerVertical = border as CellBorder | null;
      }
    } else {
      for (const key of sides[action.preset] ?? [])
        (next.style as Record<string, unknown>)[key] = border;
      if (includeInnerBorders && (action.preset === "all" || action.preset === "none")) {
        next.innerHorizontal = border as CellBorder | null;
        next.innerVertical = border as CellBorder | null;
      }
    }
  }
  if (change.borderFormat) applyBorderFormat(next, change.borderFormat);
  return next;
}

function applyBorderFormat(format: StyleFormatDraft, patch: CellBorderFormatPatch): void {
  for (const key of [
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderDiagonalUp",
    "borderDiagonalDown",
  ] as const) {
    const border = format.style[key];
    if (border) (format.style as Record<string, unknown>)[key] = { ...border, ...patch };
  }
  if (format.innerHorizontal) format.innerHorizontal = { ...format.innerHorizontal, ...patch };
  if (format.innerVertical) format.innerVertical = { ...format.innerVertical, ...patch };
}
