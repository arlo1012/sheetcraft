import type { ShapeAdjustmentHandle, ShapePathCommand } from "../shape-presets/types.js";
import type { TextWarpPresetName } from "./catalog.js";

/** An active text transform. Standard textNoShape is represented by absence. */
export type ShapeTextWarp = Readonly<{
  preset: TextWarpPresetName;
  /** Sparse overrides of the selected preset's declared adjustment defaults. */
  adjustments?: Readonly<Record<string, number>>;
}>;

/** Directed open curves in actual text-rectangle logical pixels, never body paths. */
export type TextWarpPathCommand = Exclude<ShapePathCommand, readonly ["Z"]>;
export type TextWarpBoundary = Readonly<{
  commands: readonly TextWarpPathCommand[];
}>;
export type TextWarpTrack = Readonly<{ pathIndex: number }>;
export type TextWarpBand = Readonly<{ topPathIndex: number; bottomPathIndex: number }>;
export type TextWarpFamily = "follow-path" | "envelope";

/** Explicit source roles retain path order; callers select tracks/bands themselves. */
export type EvaluatedTextWarpGeometry = Readonly<{
  preset: TextWarpPresetName;
  width: number;
  height: number;
  family: TextWarpFamily;
  boundaries: readonly TextWarpBoundary[];
  tracks: readonly TextWarpTrack[];
  bands: readonly TextWarpBand[];
  /** Final derived guide values after sequential source-order evaluation. */
  guides: Readonly<Record<string, number>>;
  handles: readonly ShapeAdjustmentHandle[];
  adjustments: Readonly<Record<string, number>>;
}>;

/** Internal trusted compiler output; no caller-supplied definitions are evaluated. */
export type TextWarpDefinition = Readonly<{
  guides: readonly (readonly string[])[];
  handles: readonly Readonly<{
    kind: "ahXY" | "ahPolar";
    fields: Readonly<Record<string, string>>;
    position: readonly [string, string];
  }>[];
  paths: readonly Readonly<{ commands: readonly (readonly string[])[] }>[];
  family: TextWarpFamily;
  tracks: readonly TextWarpTrack[];
  bands: readonly TextWarpBand[];
}>;
