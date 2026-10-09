import type { ConditionalFormatStyle } from "@sheetcraft/core/conditional-formatting";

export const QUICK_RULE_KINDS = [
  "greaterThan",
  "lessThan",
  "between",
  "equal",
  "contains",
  "date",
  "duplicate",
  "top10Items",
  "top10Percent",
  "bottom10Items",
  "bottom10Percent",
  "aboveAverage",
  "belowAverage",
] as const;
export type ConditionalFormatQuickDialogKind = (typeof QUICK_RULE_KINDS)[number];
export function isConditionalFormatQuickDialogKind(
  kind: string | undefined,
): kind is ConditionalFormatQuickDialogKind {
  return QUICK_RULE_KINDS.some((entry) => entry === kind);
}

export type ConditionalFormatStylePreset =
  | "redFillText"
  | "yellowFillText"
  | "greenFillText"
  | "redFill"
  | "redText"
  | "redBorder";
export const CONDITIONAL_FORMAT_STYLE_PRESETS: ConditionalFormatStylePreset[] = [
  "redFillText",
  "yellowFillText",
  "greenFillText",
  "redFill",
  "redText",
  "redBorder",
];
export function conditionalFormatPresetStyle(
  preset: ConditionalFormatStylePreset,
): ConditionalFormatStyle {
  switch (preset) {
    case "redFillText":
      return { fillColor: "#FFC7CE", textColor: "#9C0006" };
    case "yellowFillText":
      return { fillColor: "#FFEB9C", textColor: "#9C6500" };
    case "greenFillText":
      return { fillColor: "#C6EFCE", textColor: "#006100" };
    case "redFill":
      return { fillColor: "#FFC7CE" };
    case "redText":
      return { textColor: "#9C0006" };
    case "redBorder":
      return {
        borderTop: { style: "thin", color: "#9C0006" },
        borderRight: { style: "thin", color: "#9C0006" },
        borderBottom: { style: "thin", color: "#9C0006" },
        borderLeft: { style: "thin", color: "#9C0006" },
      };
  }
}
