import type { CellStyle, CellStylePatch } from "@sheetcraft/core/style";
import type { CSSProperties } from "vue";
import { getCellFillStyle } from "../../shared/cell-fill/fill-presentation";
import { getCellTextTypographyStyle } from "../../shared/cell-text/font-presentation";
import type { MessageKey } from "../../shared/i18n";
import type { CellStyleDefinition } from "@sheetcraft/core/cell-styles";

export const CELL_STYLE_CATEGORIES = [
  "goodBadNeutral",
  "dataModel",
  "titles",
  "theme",
  "number",
  "custom",
] as const satisfies readonly CellStyleDefinition["category"][];

export const CELL_STYLE_CATEGORY_LABELS = {
  goodBadNeutral: "cellStyles.categories.goodBadNeutral",
  dataModel: "cellStyles.categories.dataModel",
  titles: "cellStyles.categories.titles",
  theme: "cellStyles.categories.theme",
  number: "cellStyles.categories.number",
  custom: "cellStyles.categories.custom",
} as const satisfies Record<CellStyleDefinition["category"], MessageKey>;

/**
 * Builtin ids double as their translation suffix. Custom styles retain the
 * user-provided name so they can be used without extending the message schema.
 */
export function cellStyleLabel(
  style: CellStyleDefinition,
  translate: (key: MessageKey) => string,
): string {
  return style.category === "custom"
    ? style.name
    : translate(`cellStyles.builtin.${style.id}` as MessageKey);
}

export function cellStylePreviewCss(style: CellStylePatch): CSSProperties {
  return {
    ...getCellFillStyle(style as CellStyle),
    ...getCellTextTypographyStyle(style as CellStyle),
    ...(style.horizontalAlign ? { textAlign: cssTextAlign(style.horizontalAlign) } : {}),
    ...(style.verticalAlign ? { alignItems: verticalAlign(style.verticalAlign) } : {}),
    ...(style.wrapText ? { whiteSpace: "normal" } : {}),
    ...borderCss(style),
  };
}

function verticalAlign(
  value: NonNullable<CellStylePatch["verticalAlign"]>,
): CSSProperties["alignItems"] {
  return value === "top" ? "flex-start" : value === "bottom" ? "flex-end" : "center";
}

function cssTextAlign(
  value: Exclude<CellStylePatch["horizontalAlign"], null | undefined | false>,
): CSSProperties["textAlign"] {
  return value === "general" ||
    value === "fill" ||
    value === "centerContinuous" ||
    value === "distributed"
    ? "left"
    : value;
}

function borderCss(style: CellStylePatch): CSSProperties {
  const border = (value: CellStylePatch["borderTop"]): string | undefined =>
    value ? `${borderWidth(value.style)} ${borderLine(value.style)} ${value.color}` : undefined;
  return {
    ...(border(style.borderTop) ? { borderTop: border(style.borderTop) } : {}),
    ...(border(style.borderRight) ? { borderRight: border(style.borderRight) } : {}),
    ...(border(style.borderBottom) ? { borderBottom: border(style.borderBottom) } : {}),
    ...(border(style.borderLeft) ? { borderLeft: border(style.borderLeft) } : {}),
  };
}

function borderWidth(style: string): string {
  if (style === "double") return "3px";
  if (style.includes("medium") || style.includes("thick")) return "2px";
  if (style.includes("hair")) return "1px";
  return "1px";
}

function borderLine(style: string): "solid" | "dashed" | "dotted" | "double" {
  if (style === "double") return "double";
  if (style.includes("dotted")) return "dotted";
  if (style.includes("dash")) return "dashed";
  return "solid";
}
