import { readChartComboFeature } from "./chart-combo.js";
import { mapChartRangeSeries } from "./chart-range-series.js";
import { normalizeEquationFlipState, type EquationFlipState } from "./equation-flip.js";
import {
  normalizeEquationDocument,
  serializeEquationDocument,
  type EquationDocument,
} from "./equation-document.js";
import { normalizeShapeConnector, type ShapeConnector } from "./shape-connector.js";
import { validateShapeConnectorReferences } from "./shape-connector-layout.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  collectShapeGroupNodeIds,
  isShapeGroupDrawing,
  normalizeShapeGroup,
  normalizeShapeGroupCollection,
  type ShapeGroupDrawing,
} from "./shape-group.js";
import {
  isShapeLinePreset,
  normalizeShapeLineEnds,
  type ShapeLineEnds,
} from "./shape-line-ends.js";
import { normalizeShapePresetParameters } from "./shape-presets/contract.js";
import type { ShapePresetParameters } from "./shape-presets/types.js";
import { normalizeShapeStyle, type ShapeDetailedStyle } from "./shape-style.js";
import { normalizeTextBoxTextReference, type TextBoxTextReference } from "./text-box-reference.js";
export type { TextBoxTextReference } from "./text-box-reference.js";
import { normalizeShapeText, type ShapeText } from "./shape-text.js";
import { normalizeShapeFrame, type ShapeFrame } from "./shape-frame.js";
import {
  normalizeShapeObjectProperties,
  type ShapeObjectProperties,
} from "./shape-object-properties.js";
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
  /** Explicit structured math for kind=equation only; text is its exact generated LaTeX mirror. */
  equationDocument?: EquationDocument;
  /** Equation-only source identity; these never mirror a shape body. */
  equationFlipX?: true;
  equationFlipY?: true;
  /** Only kind=shape may carry this feature. Other drawing kinds retain their own contracts. */
  shapeGeometry?: SheetShapeGeometry;
  /** Bounded numeric free geometry; exclusive with standard shapeGeometry. */
  shapePath?: ShapeFreePath;
  /** Endpoint decoration for explicit standard lines or open free paths. */
  shapeLineEnds?: ShapeLineEnds;
  /** Explicit live endpoints; only canonical shape roots and owned leaves admit this feature. */
  shapeConnector?: ShapeConnector;
  /** Sparse shape/text-box mirroring, before drawing rotation. Existing connectors retain route flips. */
  shapeFlipX?: true;
  shapeFlipY?: true;
  /** Sparse Selection Pane state. Ownership, assets and connector relations remain intact. */
  hidden?: true;
  /** Sparse body paint, line and effects; non-3D text-box choices require explicit shapeText. */
  shapeStyle?: ShapeDetailedStyle;
  /** Explicit shape/text-box layout, paragraph and glyph appearance, independent of body style. */
  shapeText?: ShapeText;
  /** TextBox-only absolute single-cell link; absence owns literal text, null cell owns #REF. */
  textReference?: TextBoxTextReference;
  /** Modern WordArt semantics on an ordinary text-bearing shape; legacy kind=wordArt is separate. */
  wordArt?: true;
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
export type SheetLegacyDrawing =
  | SheetGraphicDrawing
  | SheetChartDrawing
  | SheetCameraDrawing
  | SheetAttachmentDrawing
  | SheetControlDrawing;
/** Canonical source-free placement, never accompanied by legacy physical fields. */
export type SheetFramedGraphicDrawing = Omit<
  SheetGraphicDrawing,
  "anchor" | "offsetX" | "offsetY" | "width" | "height" | "kind" | "equationFlipX" | "equationFlipY"
> & {
  kind: "shape" | "textBox";
  shapeFrame: ShapeFrame;
  shapeProperties?: ShapeObjectProperties;
};
/** Equation source and placement are independent of shape body/text formatting. */
export type SheetFramedEquationDrawing = Omit<
  DrawingBase,
  "anchor" | "offsetX" | "offsetY" | "width" | "height"
> &
  EquationFlipState & {
    kind: "equation";
    /** Absence retains opaque legacy source; presence requires its exact generated text mirror. */
    equationDocument?: EquationDocument;
    hidden?: true;
    shapeFrame: ShapeFrame;
    shapeProperties?: ShapeObjectProperties;
  };
export type SheetDrawing =
  | SheetLegacyDrawing
  | SheetFramedGraphicDrawing
  | SheetFramedEquationDrawing
  | ShapeGroupDrawing;
type DrawingAppearance =
  | Omit<SheetGraphicDrawing, "anchor" | "offsetX" | "offsetY" | "width" | "height">
  | Omit<SheetChartDrawing, "anchor" | "offsetX" | "offsetY" | "width" | "height">
  | Omit<SheetCameraDrawing, "anchor" | "offsetX" | "offsetY" | "width" | "height">
  | Omit<SheetAttachmentDrawing, "anchor" | "offsetX" | "offsetY" | "width" | "height">
  | Omit<SheetControlDrawing, "anchor" | "offsetX" | "offsetY" | "width" | "height">;
export function isFramedShapeDrawing(value: SheetDrawing): value is SheetFramedGraphicDrawing {
  const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value;
  return (kind === "shape" || kind === "textBox") && "shapeFrame" in value;
}
/** Placement only; Equation body and owned membership use separate contracts. */
export function isFramedEquationDrawing(value: SheetDrawing): value is SheetFramedEquationDrawing {
  const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value;
  return kind === "equation" && "shapeFrame" in value;
}
/** Root placement only. Containers do not have leaf geometry, text or paint. */
export function hasShapeObjectFrame(
  value: SheetDrawing,
): value is SheetFramedGraphicDrawing | SheetFramedEquationDrawing | ShapeGroupDrawing {
  return (
    isFramedShapeDrawing(value) || isFramedEquationDrawing(value) || isShapeGroupDrawing(value)
  );
}
/** Temporary consumer gate; it never drops a frame or invents legacy storage coordinates. */
export function requireLegacySheetDrawing(value: SheetDrawing): SheetLegacyDrawing {
  if (hasShapeObjectFrame(value))
    throw new TypeError("This drawing consumer does not yet support canonical shape frames.");
  return value;
}
export function requireLegacySheetDrawings(
  values: readonly SheetDrawing[] | undefined,
): SheetLegacyDrawing[] {
  if (values === undefined) return [];
  readPictureDataArray(values, "sheet drawings", Number.MAX_SAFE_INTEGER);
  // Consume validated indexed fields through the caller's public view. Reactive
  // collections may expose stable owner proxies while descriptors retain raw targets.
  const result: SheetLegacyDrawing[] = [];
  for (let index = 0; index < values.length; index++)
    result.push(requireLegacySheetDrawing(values[index]!));
  return result;
}
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
  mapChartBand: (range: CellRange) => CellRange | null = map,
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
      chart: mapChartRangeSeries(drawing.chart, bounded(drawing.chart.range, 10000), mapChartBand),
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

/** Reject chart payloads before any drawing discriminator or payload accessor is consumed. */
function assertChartPayloadOwnership(value: object): void {
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (!("chart" in value) && kind?.value !== "chart") return;
  if (!kind || !("value" in kind) || kind.value !== "chart")
    throw new TypeError("Chart payloads require an own chart drawing kind.");
  const chart = Object.getOwnPropertyDescriptor(value, "chart");
  if (!chart || !("value" in chart))
    throw new TypeError("Chart payloads must be own data fields, not accessors.");
  // Admit raw combo and all format records before legacy placement/identity getters.
  readChartComboFeature(chart.value);
}

function normalizeDrawingAppearance(value: DrawingAppearance): DrawingAppearance {
  if (value && typeof value === "object") assertChartPayloadOwnership(value);
  if (value && typeof value === "object" && "shapeStyle" in value) {
    const discriminator = Object.getOwnPropertyDescriptor(value, "kind");
    if (!discriminator || !("value" in discriminator))
      throw new TypeError("Shape body styles require an own data drawing kind.");
  }
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
  if (styleField && value.kind !== "shape" && value.kind !== "textBox")
    throw new TypeError("Only a shape drawing or a text box body may carry a shape style.");
  const shapeStyle = normalizeShapeStyle(styleField?.value);
  if (value.kind === "textBox" && styleField && !shapeStyle)
    throw new TypeError("Only a shape drawing may carry empty body styles.");
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
    if (value.kind !== "shape" && value.kind !== "textBox")
      throw new TypeError("Only shapes or text boxes may carry shape flips.");
    if (typeof field.value !== "boolean") throw new TypeError("Shape flips must be booleans.");
    return field.value;
  };
  const shapeFlipX = normalizeFlip("shapeFlipX"),
    shapeFlipY = normalizeFlip("shapeFlipY");
  const equationFlips =
    "equationFlipX" in value || "equationFlipY" in value ? normalizeEquationFlipState(value) : {};
  const hiddenField = Object.getOwnPropertyDescriptor(value, "hidden");
  if (!hiddenField && "hidden" in value)
    throw new TypeError("Shape visibility must be an own data field.");
  if (hiddenField && !("value" in hiddenField))
    throw new TypeError("Shape visibility cannot be an accessor.");
  if (
    hiddenField &&
    value.kind !== "shape" &&
    value.kind !== "textBox" &&
    (value.kind !== "equation" || !("shapeFrame" in value))
  )
    throw new TypeError("Only shapes, text boxes or framed equations may carry shape visibility.");
  if (hiddenField && typeof hiddenField.value !== "boolean")
    throw new TypeError("Shape visibility must be a boolean.");
  const hidden = hiddenField?.value === true;
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
  const connectorField = Object.getOwnPropertyDescriptor(value, "shapeConnector");
  if (!connectorField && "shapeConnector" in value)
    throw new TypeError("Shape connectors must be own data fields.");
  if (connectorField && !("value" in connectorField))
    throw new TypeError("Shape connectors cannot be accessors.");
  if (
    connectorField &&
    (value.kind !== "shape" ||
      !shapeGeometry ||
      !isShapeLinePreset(shapeGeometry.preset) ||
      shapePath)
  )
    throw new TypeError("Live connectors require canonical standard line geometry.");
  const shapeConnector = connectorField ? normalizeShapeConnector(connectorField.value) : undefined;
  const equationField = Object.getOwnPropertyDescriptor(value, "equationDocument");
  if (!equationField && "equationDocument" in value)
    throw new TypeError("Equation documents must be own data fields.");
  if (equationField && (!("value" in equationField) || value.kind !== "equation"))
    throw new TypeError("Only equation drawings may own equation document data fields.");
  const equationDocument = equationField
    ? normalizeEquationDocument(equationField.value)
    : undefined;
  if (equationDocument && value.text !== serializeEquationDocument(equationDocument))
    throw new TypeError("Equation drawing text must exactly mirror its generated document source.");
  const textField = Object.getOwnPropertyDescriptor(value, "shapeText");
  if (!textField && "shapeText" in value)
    throw new TypeError("Shape text must be an own data field.");
  if (textField && !("value" in textField))
    throw new TypeError("Shape text cannot be an accessor.");
  if (textField && value.kind !== "shape" && value.kind !== "textBox")
    throw new TypeError("Only shape or text box drawings may carry shape text.");
  const referenceField = Object.getOwnPropertyDescriptor(value, "textReference");
  if (!referenceField && "textReference" in value)
    throw new TypeError("Text box references must be own data fields.");
  if (referenceField && (!("value" in referenceField) || value.kind !== "textBox"))
    throw new TypeError("Only text boxes may own text reference data fields.");
  const textReference = referenceField
    ? normalizeTextBoxTextReference(referenceField.value)
    : undefined;
  if (
    textReference &&
    (value.text !== "" ||
      (textField?.value &&
        typeof textField.value === "object" &&
        "characterRuns" in textField.value))
  )
    throw new TypeError("Linked text boxes require empty literal text and no character runs.");
  const directionField = Object.getOwnPropertyDescriptor(value, "textDirection");
  if (textField && directionField)
    throw new TypeError("Shape text and legacy text direction are mutually exclusive.");
  const shapeText = normalizeShapeText(textField?.value, value.text);
  // Body edits opt into the shared layout only with an explicitly owned text
  // model. Old 3D-only boxes can still retain their CSS/plain-text rendering.
  if (
    value.kind === "textBox" &&
    shapeStyle &&
    Object.keys(shapeStyle).some((key) => key !== "rotation3d" && key !== "format3d") &&
    (!textField || !shapeText)
  )
    throw new TypeError(
      "Only a shape drawing or a text box with explicit shape text may carry non-3D body styles.",
    );
  const wordArtField = Object.getOwnPropertyDescriptor(value, "wordArt");
  if (!wordArtField && "wordArt" in value)
    throw new TypeError("WordArt semantics must be an own data field.");
  if (wordArtField) {
    if (!("value" in wordArtField) || wordArtField.value !== true)
      throw new TypeError("WordArt semantics require an own true data field.");
    if (
      value.kind !== "shape" ||
      !shapeText ||
      shapeConnector ||
      (shapeGeometry
        ? isShapeLinePreset(shapeGeometry.preset)
        : shapePath
          ? !isShapeFreePathClosed(shapePath) && shapePath.openArea !== true
          : value.shape === "line")
    )
      throw new TypeError("Modern WordArt requires an ordinary text-bearing shape.");
  }
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
    ...(shapeConnector ? { shapeConnector } : {}),
    ...(shapeFlipX ? { shapeFlipX: true as const } : {}),
    ...(shapeFlipY ? { shapeFlipY: true as const } : {}),
    ...equationFlips,
    ...(hidden ? { hidden: true as const } : {}),
    ...(shapeStyle ? { shapeStyle } : {}),
    ...(shapeText ? { shapeText } : {}),
    ...(equationDocument ? { equationDocument } : {}),
    ...(textReference ? { textReference } : {}),
    ...(wordArtField ? { wordArt: true as const } : {}),
    ...(directionField ? { textDirection: "vertical" as const } : {}),
    name: value.name,
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
const shapeFrameFields = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "shapeGeometry",
  "shapePath",
  "shapeLineEnds",
  "shapeConnector",
  "shapeFlipX",
  "shapeFlipY",
  "hidden",
  "shapeStyle",
  "shapeText",
  "equationDocument",
  "textReference",
  "wordArt",
  "textDirection",
  "shapeFrame",
  "shapeProperties",
] as const;
const equationFrameFields = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "equationDocument",
  "equationFlipX",
  "equationFlipY",
  "hidden",
  "shapeFrame",
  "shapeProperties",
] as const;

/** Exact root-only record, validated before any Equation appearance/source read. */
function normalizeFramedEquationDrawing(
  value: SheetFramedEquationDrawing,
): SheetFramedEquationDrawing {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Framed equations must be ordinary data records.");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !(equationFrameFields as readonly string[]).includes(key))
      throw new TypeError("Unknown or conflicting canonical equation field.");
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in field) || field.value === undefined)
      throw new TypeError("Canonical equations require defined own data fields, not accessors.");
  }
  for (const key of equationFrameFields) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (
      (!field &&
        key !== "equationDocument" &&
        key !== "equationFlipX" &&
        key !== "equationFlipY" &&
        key !== "hidden" &&
        key !== "shapeProperties") ||
      (!field && key in value)
    )
      throw new TypeError("Canonical equations require own source and placement data fields.");
  }
  const shapeFrame = normalizeShapeFrame(value.shapeFrame);
  const shapeProperties = normalizeShapeObjectProperties(value.shapeProperties);
  const appearance = normalizeDrawingAppearance(value);
  if (appearance.kind !== "equation") throw new TypeError("Expected canonical Equation source.");
  const mathDocument: EquationDocument | undefined = Object.getOwnPropertyDescriptor(
    appearance,
    "equationDocument",
  )?.value;
  const equationFlipX =
    Object.getOwnPropertyDescriptor(appearance, "equationFlipX")?.value === true;
  const equationFlipY =
    Object.getOwnPropertyDescriptor(appearance, "equationFlipY")?.value === true;
  const hidden = Object.getOwnPropertyDescriptor(appearance, "hidden")?.value === true;
  return {
    id: appearance.id,
    kind: "equation",
    name: appearance.name,
    text: appearance.text,
    shape: appearance.shape,
    fill: appearance.fill,
    stroke: appearance.stroke,
    strokeWidth: appearance.strokeWidth,
    color: appearance.color,
    fontSize: appearance.fontSize,
    bold: appearance.bold,
    italic: appearance.italic,
    rotation: appearance.rotation,
    ...(mathDocument ? { equationDocument: mathDocument } : {}),
    ...(equationFlipX ? { equationFlipX: true as const } : {}),
    ...(equationFlipY ? { equationFlipY: true as const } : {}),
    ...(hidden ? { hidden: true as const } : {}),
    shapeFrame,
    ...(shapeProperties ? { shapeProperties } : {}),
  };
}

export function normalizeSheetDrawing(value: SheetFramedGraphicDrawing): SheetFramedGraphicDrawing;
export function normalizeSheetDrawing(
  value: SheetFramedEquationDrawing,
): SheetFramedEquationDrawing;
export function normalizeSheetDrawing(value: ShapeGroupDrawing): ShapeGroupDrawing;
export function normalizeSheetDrawing(value: SheetLegacyDrawing): SheetLegacyDrawing;
export function normalizeSheetDrawing(value: SheetDrawing): SheetDrawing;
export function normalizeSheetDrawing(value: SheetDrawing): SheetDrawing {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RangeError("Invalid sheet drawing.");
  assertChartPayloadOwnership(value);
  if (isFramedEquationDrawing(value)) return normalizeFramedEquationDrawing(value);
  // Attributed or warped legacy drawings need the canonical descriptor-safe source fields.
  const textModelField = Object.getOwnPropertyDescriptor(value, "shapeText");
  const rawTextModel: unknown =
    textModelField && "value" in textModelField ? textModelField.value : undefined;
  const hasCharacterRuns =
    !!rawTextModel && typeof rawTextModel === "object" && "characterRuns" in rawTextModel;
  const hasTextWarp = !!rawTextModel && typeof rawTextModel === "object" && "warp" in rawTextModel;
  const hasWordArt = "wordArt" in value;
  const hasTextReference = "textReference" in value;
  const hasEquationDocument = "equationDocument" in value;
  const hasEquationFlip = "equationFlipX" in value || "equationFlipY" in value;
  if (
    hasCharacterRuns ||
    hasTextWarp ||
    hasWordArt ||
    hasTextReference ||
    hasEquationDocument ||
    hasEquationFlip
  )
    for (const key of [
      "id",
      "kind",
      "name",
      "text",
      "shape",
      "fill",
      "stroke",
      "strokeWidth",
      "color",
      "fontSize",
      "bold",
      "italic",
      "rotation",
    ] as const) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !("value" in field))
        throw new TypeError("Attributed shape drawings require own source data fields.");
    }
  // Newly admitted legacy controls must be data records before any appearance read.
  const ownKind = Object.getOwnPropertyDescriptor(value, "kind");
  const styleField = Object.getOwnPropertyDescriptor(value, "shapeStyle");
  if ("shapeStyle" in value && (!ownKind || !("value" in ownKind)))
    throw new TypeError("Shape body styles require an own data drawing kind.");
  const rawStyle: unknown = styleField && "value" in styleField ? styleField.value : undefined;
  const hasTextBoxBodyStyle =
    ownKind?.value === "textBox" &&
    "shapeStyle" in value &&
    (!styleField ||
      !("value" in styleField) ||
      (!!rawStyle &&
        typeof rawStyle === "object" &&
        ["fill", "line", "shadow", "reflection", "glow", "softEdges"].some(
          (key) => key in rawStyle,
        )));
  const hasNewControls =
    hasTextBoxBodyStyle ||
    hasTextReference ||
    hasEquationDocument ||
    hasEquationFlip ||
    "hidden" in value ||
    (("shapeFlipX" in value || "shapeFlipY" in value) &&
      (ownKind?.value === "textBox" ||
        (Object.getOwnPropertyDescriptor(value, "shapeGeometry")?.value === undefined &&
          Object.getOwnPropertyDescriptor(value, "shapePath")?.value === undefined)));
  if (
    (hasNewControls || hasCharacterRuns || hasTextWarp || hasWordArt) &&
    ownKind?.value !== "shapeGroup" &&
    !("shapeFrame" in value)
  ) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype)
      throw new TypeError("Shape controls require ordinary records with own data fields.");
    const fields: readonly string[] = [
      ...(ownKind?.value === "equation" ? equationFrameFields : shapeFrameFields).filter(
        (key) => key !== "shapeFrame" && key !== "shapeProperties",
      ),
      "anchor",
      "offsetX",
      "offsetY",
      "width",
      "height",
    ];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !fields.includes(key))
        throw new TypeError("Unknown shape control drawing field.");
      const field = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in field))
        throw new TypeError("Shape controls require own data fields, not accessors.");
      if ((hasTextReference || hasEquationDocument) && field.value === undefined)
        throw new TypeError("Linked text box fields cannot be undefined.");
    }
    if (hasTextBoxBodyStyle || hasTextReference || hasEquationDocument || hasEquationFlip) {
      for (const key of [
        "id",
        "kind",
        "name",
        "text",
        "shape",
        "fill",
        "stroke",
        "strokeWidth",
        "color",
        "fontSize",
        "bold",
        "italic",
        "rotation",
        "anchor",
        "offsetX",
        "offsetY",
        "width",
        "height",
      ] as const) {
        const field = Object.getOwnPropertyDescriptor(value, key);
        if (!field || !("value" in field))
          throw new TypeError("Text box body styles require own source data fields.");
      }
      const anchor: unknown = Object.getOwnPropertyDescriptor(value, "anchor")!.value;
      if (!anchor || typeof anchor !== "object" || Array.isArray(anchor))
        throw new TypeError("Text box body anchors must be ordinary data records.");
      const anchorPrototype = Object.getPrototypeOf(anchor);
      if (anchorPrototype !== null && anchorPrototype !== Object.prototype)
        throw new TypeError("Text box body anchors must be ordinary data records.");
      if (hasTextReference || hasEquationDocument)
        for (const key of Reflect.ownKeys(anchor)) {
          const field = Object.getOwnPropertyDescriptor(anchor, key)!;
          if ((key !== "row" && key !== "column") || !("value" in field))
            throw new TypeError("Linked text box anchors require only own row and column data.");
        }
      for (const key of ["row", "column"] as const) {
        const field = Object.getOwnPropertyDescriptor(anchor, key);
        if (!field || !("value" in field))
          throw new TypeError("Text box body anchors require own data fields.");
      }
    }
  }
  if ("groupFrame" in value)
    throw new TypeError("Owned shape children cannot use root drawing placement.");
  if (Object.getOwnPropertyDescriptor(value, "kind")?.value === "shapeGroup")
    return normalizeShapeGroup(value as ShapeGroupDrawing);
  if ("group3d" in value)
    throw new TypeError("Shared 3D cameras require a genuine shape group owner.");
  if ("groupEffects" in value)
    throw new TypeError("Container effects require a genuine shape group owner.");
  if ("shapeFrame" in value && !isFramedShapeDrawing(value))
    throw new TypeError(
      "Only shapes, text boxes, equations or shape groups may use canonical shape frames.",
    );
  if (isFramedShapeDrawing(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype)
      throw new TypeError("Framed shapes must be ordinary data records.");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !(shapeFrameFields as readonly string[]).includes(key))
        throw new TypeError("Unknown or conflicting canonical shape field.");
      const field = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in field))
        throw new TypeError("Canonical shapes must contain own data fields, not accessors.");
      if (hasTextReference && field.value === undefined)
        throw new TypeError("Linked text box fields cannot be undefined.");
    }
    if (value.kind !== "shape" && value.kind !== "textBox")
      throw new TypeError("Only shapes or text boxes may use canonical shape frames.");
    const field = Object.getOwnPropertyDescriptor(value, "shapeFrame");
    if (!field || !("value" in field))
      throw new TypeError("Shape frame must be an own data field.");
    const shapeFrame = normalizeShapeFrame(field.value);
    const shapeProperties = normalizeShapeObjectProperties(
      Object.getOwnPropertyDescriptor(value, "shapeProperties")?.value,
    );
    const appearance = normalizeDrawingAppearance(value) as Omit<
      SheetGraphicDrawing,
      "anchor" | "offsetX" | "offsetY" | "width" | "height"
    >;
    return {
      ...appearance,
      kind: value.kind,
      shapeFrame,
      ...(shapeProperties ? { shapeProperties } : {}),
    };
  }
  if ("shapeConnector" in value)
    throw new TypeError("Live shape connectors require a canonical root or owned placement.");
  if ("shapeProperties" in value)
    throw new TypeError("Shape properties require a canonical shape frame.");
  const finite = (n: number, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  if (
    !value.anchor ||
    !Number.isInteger(value.anchor.row) ||
    !finite(value.anchor.row, 0, MAX_SHEET_ROWS - 1) ||
    !Number.isInteger(value.anchor.column) ||
    !finite(value.anchor.column, 0, MAX_SHEET_COLUMNS - 1) ||
    !finite(value.offsetX, 0, 1000000) ||
    !finite(value.offsetY, 0, 1000000) ||
    !finite(value.width, 1, 16384) ||
    !finite(value.height, 1, 16384)
  )
    throw new RangeError("Invalid legacy drawing placement.");
  const appearance = normalizeDrawingAppearance(value);
  return {
    ...appearance,
    anchor: hasEquationDocument
      ? { row: value.anchor.row, column: value.anchor.column }
      : { ...value.anchor },
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    width: value.width,
    height: value.height,
  };
}
export function normalizeSheetDrawings(
  values: readonly SheetDrawing[] | undefined,
): SheetDrawing[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new RangeError("Invalid sheet drawings.");
  const source = readPictureDataArray(values, "sheet drawings", Number.MAX_SAFE_INTEGER);
  // Check ownership across raw trees before detached clones can disguise shared nodes.
  normalizeShapeGroupCollection(source.filter(isShapeGroupDrawing));
  const result = source.map(normalizeSheetDrawing);
  const ids = new Set<string>();
  for (const drawing of result) {
    const ownedIds = isShapeGroupDrawing(drawing)
      ? collectShapeGroupNodeIds(drawing)
      : [drawing.id];
    for (const id of ownedIds) {
      if (ids.has(id)) throw new RangeError("Duplicate drawing IDs.");
      ids.add(id);
    }
  }
  if (
    result.reduce(
      (total, drawing) => total + (drawing.kind === "attachment" ? drawing.attachment.size : 0),
      0,
    ) > MAX_SHEET_ATTACHMENT_BYTES
  )
    throw new RangeError("Embedded files exceed sheet limit.");
  validateShapeConnectorReferences(result);
  return result;
}

/** Root visibility only. Group descendants must also honor every owning group. */
export function isSheetDrawingVisible(value: SheetDrawing): boolean {
  const field = Object.getOwnPropertyDescriptor(value, "hidden");
  if (!field) {
    if ("hidden" in value) throw new TypeError("Shape visibility must be an own data field.");
    return true;
  }
  if (!("value" in field)) throw new TypeError("Shape visibility cannot be an accessor.");
  const kind = Object.getOwnPropertyDescriptor(value, "kind")?.value;
  if (
    kind !== "shape" &&
    kind !== "textBox" &&
    kind !== "shapeGroup" &&
    !isFramedEquationDrawing(value)
  )
    throw new TypeError(
      "Only shapes, text boxes, framed equations or shape groups may carry shape visibility.",
    );
  if (typeof field.value !== "boolean") throw new TypeError("Shape visibility must be a boolean.");
  return field.value !== true;
}
