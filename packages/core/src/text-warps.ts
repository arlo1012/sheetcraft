export {
  TEXT_WARP_PRESET_NAMES,
  TEXT_WARP_PRESET_DEFAULTS,
  type TextWarpPresetName,
} from "./text-warps/catalog.js";
export { isTextWarpPresetName, normalizeShapeTextWarp } from "./text-warps/contract.js";
export { evaluateTextWarp, TEXT_WARP_GEOMETRY_LIMITS } from "./text-warps/evaluate.js";
export { moveTextWarpAdjustment } from "./text-warps/adjustment.js";
export {
  TextWarpSamplingError,
  sampleTextWarpBoundary,
  sampleTextWarpBoundaries,
  sampleTextWarpFraction,
} from "./text-warps/sampling.js";
export type {
  TextWarpPoint,
  TextWarpSamplingOptions,
  TextWarpArcSample,
  SampledTextWarpBoundary,
  SampledTextWarpBoundaries,
  TextWarpFractionSample,
} from "./text-warps/sampling.js";
export { mapTextWarpEnvelopePoint, mapTextWarpBaselinePoint } from "./text-warps/mapping.js";
export type {
  TextWarpMappingSource,
  TextWarpExtrapolation,
  TextWarpMappingOptions,
} from "./text-warps/mapping.js";
export type {
  ShapeTextWarp,
  TextWarpPathCommand,
  TextWarpBoundary,
  TextWarpTrack,
  TextWarpBand,
  TextWarpFamily,
  EvaluatedTextWarpGeometry,
} from "./text-warps/types.js";
