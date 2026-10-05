import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellAddress } from "./workbook.js";

export type DrawingShape =
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "arrow"
  | "line"
  | "star"
  | "heart";
export type SheetGraphicKind = "shape" | "textBox" | "wordArt" | "icon" | "equation";
type DrawingBase = {
  id: string;
  name: string;
  anchor: CellAddress;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  text: string;
  shape: DrawingShape;
  fill: string;
  stroke: string;
  strokeWidth: number;
  color: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  rotation: number;
};
export type SheetGraphicDrawing = DrawingBase & { kind: SheetGraphicKind };
export type SheetChartDrawing = DrawingBase & { kind: "chart"; chart: SheetChart };
export type SheetDrawing = SheetGraphicDrawing | SheetChartDrawing;
const kinds = new Set(["shape", "textBox", "wordArt", "icon", "equation", "chart"]);
const shapes = new Set([
  "rectangle",
  "roundedRectangle",
  "ellipse",
  "triangle",
  "diamond",
  "arrow",
  "line",
  "star",
  "heart",
]);
export function normalizeSheetDrawing(value: SheetDrawing): SheetDrawing {
  const finite = (n: number, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const color = (s: string) => typeof s === "string" && /^(#[0-9a-f]{6}|transparent)$/i.test(s);
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    !kinds.has(value.kind) ||
    !shapes.has(value.shape) ||
    typeof value.name !== "string" ||
    typeof value.text !== "string" ||
    value.text.length > 100000 ||
    !value.anchor ||
    !Number.isInteger(value.anchor.row) ||
    !finite(value.anchor.row, 0, MAX_SHEET_ROWS - 1) ||
    !Number.isInteger(value.anchor.column) ||
    !finite(value.anchor.column, 0, MAX_SHEET_COLUMNS - 1) ||
    !finite(value.offsetX, 0, 1000000) ||
    !finite(value.offsetY, 0, 1000000) ||
    !finite(value.width, 1, 16384) ||
    !finite(value.height, 1, 16384) ||
    !finite(value.strokeWidth, 0, 32) ||
    !finite(value.fontSize, 1, 512) ||
    !finite(value.rotation, -360, 360) ||
    !color(value.fill) ||
    !color(value.stroke) ||
    !color(value.color) ||
    typeof value.bold !== "boolean" ||
    typeof value.italic !== "boolean"
  ) {
    throw new RangeError("Invalid sheet drawing.");
  }
  return {
    id: value.id,
    ...(value.kind === "chart"
      ? ({ kind: "chart", chart: normalizeSheetChart(value.chart) } as const)
      : { kind: value.kind }),
    name: value.name,
    anchor: { ...value.anchor },
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    width: value.width,
    height: value.height,
    text: value.text,
    shape: value.shape,
    fill: value.fill,
    stroke: value.stroke,
    strokeWidth: value.strokeWidth,
    color: value.color,
    fontSize: value.fontSize,
    bold: value.bold,
    italic: value.italic,
    rotation: value.rotation,
  };
}
export function normalizeSheetDrawings(
  values: readonly SheetDrawing[] | undefined,
): SheetDrawing[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new RangeError("Invalid sheet drawings.");
  const result = values.map(normalizeSheetDrawing);
  if (new Set(result.map((value) => value.id)).size !== result.length)
    throw new RangeError("Duplicate drawing IDs.");
  return result;
}
