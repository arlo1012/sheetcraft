/** Pattern names shared by the workbook model and XLSX adapters. */
export const CELL_FILL_PATTERNS = [
  "darkVertical",
  "darkHorizontal",
  "darkGrid",
  "darkTrellis",
  "darkDown",
  "darkUp",
  "lightVertical",
  "lightHorizontal",
  "lightGrid",
  "lightTrellis",
  "lightDown",
  "lightUp",
  "darkGray",
  "mediumGray",
  "lightGray",
  "gray125",
  "gray0625",
] as const;

export type CellFillPatternStyle = (typeof CELL_FILL_PATTERNS)[number];

export type CellFillGradientStop = {
  position: number;
  color: string;
};

export type CellFillGradient =
  | {
      type: "linear";
      angle: number;
      stops: CellFillGradientStop[];
    }
  | {
      type: "path";
      left: number;
      right: number;
      top: number;
      bottom: number;
      stops: CellFillGradientStop[];
    };
