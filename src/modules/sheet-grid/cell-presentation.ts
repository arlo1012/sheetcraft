import type { CSSProperties } from "vue";
import type { CellBorder, CellStyle } from "../workbook/cell-style";
import { WRAPPED_CELL_LINE_HEIGHT, WRAPPED_CELL_VERTICAL_PADDING } from "./auto-row-height";

const ALIGNMENT_JUSTIFICATION = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

const VERTICAL_ALIGNMENT = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
} as const;

export type CellBorderEdges = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};

export type CellBorderNeighbors = {
  top?: Readonly<CellStyle>;
  right?: Readonly<CellStyle>;
  bottom?: Readonly<CellStyle>;
  left?: Readonly<CellStyle>;
};

const BORDER_LINE_STYLE_CSS: Record<CellBorder["style"], string> = {
  thin: "1px solid",
  medium: "2px solid",
  dashed: "1px dashed",
  dotted: "1px dotted",
  double: "3px double",
};

function getCellBorderCss(border: CellBorder | undefined): string | undefined {
  return border ? `${BORDER_LINE_STYLE_CSS[border.style]} ${border.color}` : undefined;
}

function getPreferredBorder(
  primary: CellBorder | undefined,
  fallback: CellBorder | undefined,
): string | undefined {
  return getCellBorderCss(primary ?? fallback);
}

/**
 * Render each shared edge once. The upper/left cell has precedence so conflicting
 * cell styles resolve consistently, while the lower/right side still supports sparse data.
 */
export function getCellBorderEdges(
  style: Readonly<CellStyle> | undefined,
  neighbors: CellBorderNeighbors,
  includeTop: boolean,
  includeLeft: boolean,
): CellBorderEdges {
  return {
    ...(includeTop
      ? { top: getPreferredBorder(neighbors.top?.borderBottom, style?.borderTop) }
      : {}),
    right: getPreferredBorder(style?.borderRight, neighbors.right?.borderLeft),
    bottom: getPreferredBorder(style?.borderBottom, neighbors.bottom?.borderTop),
    ...(includeLeft
      ? { left: getPreferredBorder(neighbors.left?.borderRight, style?.borderLeft) }
      : {}),
  };
}

function getTypographyStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  if (!style) {
    return {};
  }

  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSize: `${style.fontSize}px` } : {}),
    ...(style.bold ? { fontWeight: 700 } : {}),
    ...(style.italic ? { fontStyle: "italic" } : {}),
    ...(style.underline ? { textDecoration: "underline" } : {}),
    ...(style.textColor ? { color: style.textColor } : {}),
  };
}

function getSingleLineEdgeStyle(
  style: Readonly<CellStyle> | undefined,
  multiline: boolean,
): CSSProperties {
  if (multiline || style?.horizontalAlign === "center") {
    return {};
  }
  return style?.horizontalAlign === "right" ? { paddingLeft: "0px" } : { paddingRight: "0px" };
}

export function getCellContentStyle(
  style: Readonly<CellStyle> | undefined,
  preserveLineBreaks = false,
): CSSProperties {
  const multiline = Boolean(style?.wrapText) || preserveLineBreaks;
  const multilineStyle: CSSProperties = multiline
    ? {
        whiteSpace: style?.wrapText ? "pre-wrap" : "pre",
        ...(style?.wrapText ? { overflowWrap: "anywhere" } : {}),
        wordBreak: "normal",
        lineHeight: String(WRAPPED_CELL_LINE_HEIGHT),
        paddingTop: `${WRAPPED_CELL_VERTICAL_PADDING / 2}px`,
        paddingBottom: `${WRAPPED_CELL_VERTICAL_PADDING / 2}px`,
        ...(style?.horizontalAlign ? { textAlign: style.horizontalAlign } : {}),
      }
    : {};

  return {
    ...getTypographyStyle(style),
    ...multilineStyle,
    ...getSingleLineEdgeStyle(style, multiline),
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    ...(style?.horizontalAlign
      ? { justifyContent: ALIGNMENT_JUSTIFICATION[style.horizontalAlign] }
      : {}),
    ...(style?.verticalAlign ? { alignItems: VERTICAL_ALIGNMENT[style.verticalAlign] } : {}),
  };
}

export function getCellEditorStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getTypographyStyle(style),
    ...(style?.fontSize ? { minHeight: `${style.fontSize + 2}px` } : {}),
    ...(style?.horizontalAlign ? { textAlign: style.horizontalAlign } : {}),
  };
}

export function getCellEditorFrameStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    alignItems: VERTICAL_ALIGNMENT[style?.verticalAlign ?? "middle"],
  };
}
