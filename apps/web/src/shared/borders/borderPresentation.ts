import type { CellBorderLineStyle } from "@idea10/core/style";

export type BorderLinePresentation = Readonly<{
  thickness: number;
  strokeWidth: number;
  dashArray?: string;
  lineCap: "butt" | "round";
  offsets: readonly number[];
}>;

const BORDER_LINE_PRESENTATIONS: Record<CellBorderLineStyle, BorderLinePresentation> = {
  hair: { thickness: 1, strokeWidth: 0.5, lineCap: "butt", offsets: [0] },
  thin: { thickness: 1, strokeWidth: 1, lineCap: "butt", offsets: [0] },
  medium: { thickness: 2, strokeWidth: 2, lineCap: "butt", offsets: [0] },
  thick: { thickness: 3, strokeWidth: 3, lineCap: "butt", offsets: [0] },
  dotted: { thickness: 1, strokeWidth: 1, dashArray: "0 2", lineCap: "round", offsets: [0] },
  dashed: { thickness: 1, strokeWidth: 1, dashArray: "6 3", lineCap: "butt", offsets: [0] },
  mediumDashed: { thickness: 2, strokeWidth: 2, dashArray: "8 4", lineCap: "butt", offsets: [0] },
  dashDot: { thickness: 1, strokeWidth: 1, dashArray: "6 3 1 3", lineCap: "round", offsets: [0] },
  mediumDashDot: {
    thickness: 2,
    strokeWidth: 2,
    dashArray: "8 3 1 3",
    lineCap: "round",
    offsets: [0],
  },
  dashDotDot: {
    thickness: 1,
    strokeWidth: 1,
    dashArray: "6 2 1 2 1 2",
    lineCap: "round",
    offsets: [0],
  },
  mediumDashDotDot: {
    thickness: 2,
    strokeWidth: 2,
    dashArray: "8 2 1 2 1 2",
    lineCap: "round",
    offsets: [0],
  },
  slantDashDot: {
    thickness: 1,
    strokeWidth: 1,
    dashArray: "8 2 1 2",
    lineCap: "round",
    offsets: [0],
  },
  double: { thickness: 3, strokeWidth: 1, lineCap: "butt", offsets: [-1, 1] },
};

export function getBorderLinePresentation(style: CellBorderLineStyle): BorderLinePresentation {
  return BORDER_LINE_PRESENTATIONS[style];
}
