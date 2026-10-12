export {
  SHAPE_PRESET_NAMES,
  SHAPE_PRESET_FILLED_NAMES,
  type ShapePresetName,
} from "./shape-presets/catalog.js";
export {
  isShapePresetName,
  normalizePictureCropShape,
  normalizeShapePresetParameters,
} from "./shape-presets/contract.js";
export { getShapePresetFillBounds, type ShapePresetBounds } from "./shape-presets/bounds.js";
export { moveShapePresetAdjustment } from "./shape-presets/adjustment.js";
export { evaluateShapePreset } from "./shape-presets/evaluate.js";
export {
  evaluateShapePresetAtDisplaySize,
  SHAPE_PRESET_DISPLAY_SIZE_LIMITS,
} from "./shape-presets/display-size.js";
export {
  flattenShapePath,
  isPointInShapePreset,
  shapePresetPathToSvg,
  type ShapePolyline,
} from "./shape-presets/path.js";
export type {
  EvaluatedShapePresetGeometry,
  EvaluatedShapePresetPath,
  PictureCropShape,
  ShapeAdjustmentHandle,
  ShapePathCommand,
  ShapePresetGeometry,
  ShapePresetConnectionSite,
  ShapePresetFillMode,
  ShapePresetPath,
  ShapePresetParameters,
  ShapePresetTextRect,
} from "./shape-presets/types.js";

export {
  FREE_SHAPE_PATH_WORK_BUDGET,
  type ShapePathWorkBudget,
} from "./shape-presets/path-budget.js";
