import type { ConditionalFormatStyle } from "@idea10/core/conditional-formatting";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import {
  createDefaultSelectionCellStyleState,
  type SelectionBorderState,
  type SelectionCellStyleState,
} from "@idea10/core/style-state";

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
export function conditionalStyleToSelectionState(
  style: ConditionalFormatStyle,
): SelectionCellStyleState {
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
export function conditionalStyleToBorderState(style: ConditionalFormatStyle): SelectionBorderState {
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
    const value = (style as Record<string, unknown>)[styleKey];
    if (value && value !== false) sides[side] = { value, mixed: false };
  }
  return sides as SelectionBorderState;
}
export function conditionalStyleToPatch(style: ConditionalFormatStyle): CellStylePatch {
  return Object.fromEntries(
    STYLE_KEYS.filter(
      (key) =>
        (style as Record<string, unknown>)[key] !== undefined &&
        (style as Record<string, unknown>)[key] !== null,
    ).map((key) => [key, (style as Record<string, unknown>)[key]]),
  ) as CellStylePatch;
}
export function mergeConditionalStyleChange(
  style: ConditionalFormatStyle,
  patch: CellStylePatch | undefined,
  actions: readonly CellBorderAction[] | undefined,
  borderFormat?: CellBorderFormatPatch,
): ConditionalFormatStyle {
  const next = { ...style } as ConditionalFormatStyle;
  for (const key of STYLE_KEYS)
    if (patch && Object.hasOwn(patch, key))
      (next as Record<string, unknown>)[key] = patch[key] ?? false;
  const sideMap: Record<string, readonly (keyof ConditionalFormatStyle)[]> = {
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
  for (const action of actions ?? [])
    for (const key of sideMap[action.preset] ?? [])
      (next as Record<string, unknown>)[key] = action.border ?? false;
  if (borderFormat)
    for (const key of [
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "borderDiagonalUp",
      "borderDiagonalDown",
    ]) {
      const current = (next as Record<string, unknown>)[key];
      if (current && current !== false)
        (next as Record<string, unknown>)[key] = {
          ...(current as object),
          ...borderFormat,
        };
    }
  return next;
}
