import {
  isShapeLinePreset,
  normalizeShapeLineEnds,
  type ShapeLineEnds,
} from "./shape-line-ends.js";
import { normalizeShapePresetParameters } from "./shape-presets/contract.js";
import type { ShapePresetParameters } from "./shape-presets/types.js";
import { normalizeShapeStyle, type ShapeDetailedStyle } from "./shape-style.js";
import { normalizeShapeText, type ShapeText } from "./shape-text.js";
import {
  isShapeFreePathClosed,
  normalizeShapeFreePath,
  type ShapeFreePath,
} from "./shape-free-path.js";
import { normalizeFormControl, type SheetFormControl } from "./form-controls.js";
import {
  normalizeSheetAttachment,
  MAX_SHEET_ATTACHMENT_BYTES,
  type SheetAttachment,
} from "./sheet-attachments.js";
import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellAddress, type CellRange } from "./workbook.js";

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
/** Explicit standard geometry is opt-in; missing geometry preserves the legacy nine shapes. */
export type SheetShapeGeometry = ShapePresetParameters;
export type SheetGraphicDrawing = DrawingBase & {
  kind: SheetGraphicKind;
  /** Only kind=shape may carry this feature. Other drawing kinds retain their own contracts. */
  shapeGeometry?: SheetShapeGeometry;
  /** Bounded numeric free geometry; exclusive with standard shapeGeometry. */
  shapePath?: ShapeFreePath;
  /** Endpoint decoration for explicit standard lines or open free paths. */
  shapeLineEnds?: ShapeLineEnds;
  /** Sparse mirroring of explicit standard or free geometry, before drawing rotation. */
  shapeFlipX?: true;
  shapeFlipY?: true;
  /** Shape-only sparse paint, line and effects; absent categories keep the legacy appearance. */
  shapeStyle?: ShapeDetailedStyle;
  /** Explicit shape/text-box layout, paragraph and glyph appearance, independent of body style. */
  shapeText?: ShapeText;
  /** Sparse opt-in vertical text boxes; existing drawings retain horizontal text. */
  textDirection?: "vertical";
};
export type SheetChartDrawing = DrawingBase & { kind: "chart"; chart: SheetChart };
export type SheetCameraDrawing = DrawingBase & {
  kind: "camera";
  camera: { range: CellRange | null; gridLines: boolean };
};
export type SheetAttachmentDrawing = DrawingBase & {
  kind: "attachment";
  attachment: SheetAttachment;
};
export type SheetControlDrawing = DrawingBase & { kind: "control"; control: SheetFormControl };
export type SheetDrawing =
  | SheetGraphicDrawing
  | SheetChartDrawing
  | SheetCameraDrawing
  | SheetAttachmentDrawing
  | SheetControlDrawing;
export function normalizeCameraRange(range: CellRange | null): CellRange | null {
  if (range === null) return null;
  if (
    !range ||
    !range.start ||
    !range.end ||
    [range.start.row, range.start.column, range.end.row, range.end.column].some(
      (n) => !Number.isInteger(n) || n < 0,
    ) ||
    range.end.row >= MAX_SHEET_ROWS ||
    range.end.column >= MAX_SHEET_COLUMNS ||
    range.start.row > range.end.row ||
    range.start.column > range.end.column ||
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) > 10000
  )
    throw new RangeError("Camera source must contain at most 10,000 cells.");
  return { start: { ...range.start }, end: { ...range.end } };
}
export function mapDrawingSource(
  drawing: SheetDrawing,
  map: (range: CellRange) => CellRange | null,
): SheetDrawing {
  const bounded = (range: CellRange | null, limit: number): CellRange | null => {
    const next = range ? map(range) : null;
    return next &&
      (next.end.row - next.start.row + 1) * (next.end.column - next.start.column + 1) <= limit
      ? next
      : null;
  };
  if (drawing.kind === "chart")
    return {
      ...drawing,
      chart: { ...drawing.chart, range: bounded(drawing.chart.range, 10000) },
    };
  if (drawing.kind === "camera")
    return {
      ...drawing,
      camera: { ...drawing.camera, range: bounded(drawing.camera.range, 10000) },
    };
  if (drawing.kind === "control") {
    const linked = drawing.control.linkedCell
      ? map({ start: drawing.control.linkedCell, end: drawing.control.linkedCell })
      : null;
    return {
      ...drawing,
      control: {
        ...drawing.control,
        linkedCell: linked?.start ?? null,
        source: bounded(drawing.control.source, 1000),
      },
    };
  }
  return drawing;
}
const kinds = new Set([
  "shape",
  "textBox",
  "wordArt",
  "icon",
  "equation",
  "chart",
  "camera",
  "attachment",
  "control",
]);
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
export function normalizeSheetShapeGeometry(
  value: SheetShapeGeometry | undefined,
): SheetShapeGeometry | undefined {
  if (value === undefined) return;
  // Unlike a picture mask, an explicit standard rectangle is not legacy geometry.
  return normalizeShapePresetParameters(value) ?? { preset: "rect" };
}

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
  if (value.kind === "camera" && (!value.camera || typeof value.camera.gridLines !== "boolean"))
    throw new RangeError("Invalid camera.");
  const styleField = Object.getOwnPropertyDescriptor(value, "shapeStyle");
  if (!styleField && "shapeStyle" in value)
    throw new TypeError("Shape styles must be own data fields.");
  if (styleField && !("value" in styleField))
    throw new TypeError("Shape styles cannot be accessors.");
  if (styleField && value.kind !== "shape")
    throw new TypeError("Only a shape drawing may carry a shape style.");
  const shapeStyle = normalizeShapeStyle(styleField?.value);
  const geometryField = Object.getOwnPropertyDescriptor(value, "shapeGeometry");
  if (geometryField && (geometryField.get || geometryField.set))
    throw new TypeError("Shape geometry cannot be an accessor.");
  if (geometryField && value.kind !== "shape")
    throw new TypeError("Only a shape drawing may carry standard shape geometry.");
  const shapeGeometry = normalizeSheetShapeGeometry(geometryField?.value);
  const pathField = Object.getOwnPropertyDescriptor(value, "shapePath");
  if (!pathField && "shapePath" in value)
    throw new TypeError("Free shape paths must be own data fields.");
  if (pathField && !("value" in pathField))
    throw new TypeError("Free shape paths cannot be accessors.");
  if (pathField && value.kind !== "shape")
    throw new TypeError("Only a shape drawing may carry a free shape path.");
  if (pathField && (geometryField || "shapeGeometry" in value))
    throw new TypeError("Free shape paths and standard shape geometry are mutually exclusive.");
  const shapePath = pathField ? normalizeShapeFreePath(pathField.value) : undefined;
  const normalizeFlip = (key: "shapeFlipX" | "shapeFlipY"): boolean => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field) {
      if (key in value) throw new TypeError("Shape flips must be own data fields.");
      return false;
    }
    if (!("value" in field)) throw new TypeError("Shape flips cannot be accessors.");
    if (value.kind !== "shape" || (!shapeGeometry && !shapePath))
      throw new TypeError("Shape flips require standard shape geometry or a free shape path.");
    if (typeof field.value !== "boolean") throw new TypeError("Shape flips must be booleans.");
    return field.value;
  };
  const shapeFlipX = normalizeFlip("shapeFlipX"),
    shapeFlipY = normalizeFlip("shapeFlipY");
  const endsField = Object.getOwnPropertyDescriptor(value, "shapeLineEnds");
  if (endsField && (endsField.get || endsField.set))
    throw new TypeError("Shape line ends cannot be accessors.");
  if (
    endsField &&
    (value.kind !== "shape" ||
      (!(shapeGeometry && isShapeLinePreset(shapeGeometry.preset)) &&
        !(shapePath && !isShapeFreePathClosed(shapePath))))
  )
    throw new TypeError("Line ends require standard line geometry or an open free shape path.");
  const shapeLineEnds = normalizeShapeLineEnds(endsField?.value);
  const textField = Object.getOwnPropertyDescriptor(value, "shapeText");
  if (!textField && "shapeText" in value)
    throw new TypeError("Shape text must be an own data field.");
  if (textField && !("value" in textField))
    throw new TypeError("Shape text cannot be an accessor.");
  if (textField && value.kind !== "shape" && value.kind !== "textBox")
    throw new TypeError("Only shape or text box drawings may carry shape text.");
  const directionField = Object.getOwnPropertyDescriptor(value, "textDirection");
  if (textField && directionField)
    throw new TypeError("Shape text and legacy text direction are mutually exclusive.");
  const shapeText = normalizeShapeText(textField?.value);
  if (directionField && (directionField.get || directionField.set))
    throw new TypeError("Text direction cannot be an accessor.");
  if (directionField && (value.kind !== "textBox" || directionField.value !== "vertical"))
    throw new TypeError("Vertical text direction requires a text box.");
  return {
    id: value.id,
    ...(value.kind === "chart"
      ? ({ kind: "chart", chart: normalizeSheetChart(value.chart) } as const)
      : value.kind === "camera"
        ? ({
            kind: "camera",
            camera: {
              range: normalizeCameraRange(value.camera.range),
              gridLines: value.camera.gridLines,
            },
          } as const)
        : value.kind === "attachment"
          ? ({
              kind: "attachment",
              attachment: normalizeSheetAttachment(value.attachment),
            } as const)
          : value.kind === "control"
            ? ({ kind: "control", control: normalizeFormControl(value.control) } as const)
            : { kind: value.kind }),
    ...(shapeGeometry ? { shapeGeometry } : {}),
    ...(shapePath ? { shapePath } : {}),
    ...(shapeLineEnds ? { shapeLineEnds } : {}),
    ...(shapeFlipX ? { shapeFlipX: true as const } : {}),
    ...(shapeFlipY ? { shapeFlipY: true as const } : {}),
    ...(shapeStyle ? { shapeStyle } : {}),
    ...(shapeText ? { shapeText } : {}),
    ...(directionField ? { textDirection: "vertical" as const } : {}),
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
  if (
    result.reduce(
      (total, drawing) => total + (drawing.kind === "attachment" ? drawing.attachment.size : 0),
      0,
    ) > MAX_SHEET_ATTACHMENT_BYTES
  )
    throw new RangeError("Embedded files exceed sheet limit.");
  return result;
}
