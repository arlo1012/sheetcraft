import type { ShapePresetName } from "./catalog.js";

export type PictureCropShape = {
  preset: ShapePresetName;
  /** Sparse overrides of this preset's declared adjustment values. */
  adjustments?: Readonly<Record<string, number>>;
};
export type ShapePresetDefinition = Readonly<{
  guides: readonly (readonly string[])[];
  handles: readonly Readonly<{
    kind: "ahXY" | "ahPolar";
    fields: Readonly<Record<string, string>>;
    position: readonly [string, string];
  }>[];
  paths: readonly Readonly<{
    fill: string;
    stroke: boolean;
    width?: string | null;
    height?: string | null;
    commands: readonly (readonly string[])[];
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
  stroke: boolean;
  commands: readonly ShapePathCommand[];
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
}>;
