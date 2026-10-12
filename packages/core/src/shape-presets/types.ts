import type { ShapePresetName } from "./catalog.js";

export type ShapePresetParameters = {
  preset: ShapePresetName;
  /** Sparse overrides of this preset's declared adjustment values. */
  adjustments?: Readonly<Record<string, number>>;
};
/** Picture cropping retains its existing sparse preset contract. */
export type PictureCropShape = ShapePresetParameters;
/** DrawingML path shading, in source path order. */
export type ShapePresetFillMode =
  | "norm"
  | "none"
  | "lighten"
  | "lightenLess"
  | "darken"
  | "darkenLess";
export type ShapePresetDefinition = Readonly<{
  guides: readonly (readonly string[])[];
  handles: readonly Readonly<{
    kind: "ahXY" | "ahPolar";
    fields: Readonly<Record<string, string>>;
    position: readonly [string, string];
  }>[];
  paths: readonly Readonly<{
    fillMode: ShapePresetFillMode;
    stroke: boolean;
    width?: string | null;
    height?: string | null;
    commands: readonly (readonly string[])[];
  }>[];
  /** Source guide tokens: left, top, right, bottom. Null means no source text rectangle. */
  textRect: readonly [string, string, string, string] | null;
  connectionSites: readonly Readonly<{
    angle: string;
    position: readonly [string, string];
  }>[];
}>;
/** Coordinates are local logical pixels. Arc angles are continuous ellipse parameters. */
export type ShapePathCommand =
  | readonly ["M" | "L", number, number]
  | readonly ["Q", number, number, number, number]
  | readonly ["C", number, number, number, number, number, number]
  | readonly ["A", number, number, number, number, number, number]
  | readonly ["Z"];
export type ShapePresetPath = Readonly<{
  filled: boolean;
  /** Optional only for legacy, hand-built picture-mask paths. Evaluated paths always have it. */
  fillMode?: ShapePresetFillMode;
  stroke: boolean;
  commands: readonly ShapePathCommand[];
}>;
export type EvaluatedShapePresetPath = ShapePresetPath &
  Readonly<{ fillMode: ShapePresetFillMode }>;
/** Local logical coordinates, without path-coordinate-space scaling or text margins. */
export type ShapePresetTextRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;
export type ShapePresetConnectionSite = Readonly<{
  position: Readonly<{ x: number; y: number }>;
  /** DrawingML angle units: 60,000 per degree, clockwise from local positive x. */
  angle: number;
}>;
export type ShapeAdjustmentHandle = Readonly<{
  kind: "xy" | "polar";
  position: Readonly<{ x: number; y: number }>;
  fields: readonly Readonly<{
    name: string;
    axis: "x" | "y" | "radius" | "angle";
    minimum: number;
    maximum: number;
    value: number;
    /** No legal interval exists at these extents; rendering remains valid. */
    disabled?: boolean;
  }>[];
}>;
export type ShapePresetGeometry = Readonly<{
  width: number;
  height: number;
  paths: readonly ShapePresetPath[];
  handles: readonly ShapeAdjustmentHandle[];
  adjustments: Readonly<Record<string, number>>;
  /** Optional only for legacy, hand-built picture-mask geometry. */
  textRect?: ShapePresetTextRect | null;
  /** Optional only for legacy, hand-built picture-mask geometry. */
  connectionSites?: readonly ShapePresetConnectionSite[];
}>;
/** Complete standard preset output; consumers need not invent missing metadata. */
export type EvaluatedShapePresetGeometry = Omit<
  ShapePresetGeometry,
  "paths" | "textRect" | "connectionSites"
> &
  Readonly<{
    paths: readonly EvaluatedShapePresetPath[];
    textRect: ShapePresetTextRect | null;
    connectionSites: readonly ShapePresetConnectionSite[];
  }>;
