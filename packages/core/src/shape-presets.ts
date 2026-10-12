export { SHAPE_PRESET_NAMES, type ShapePresetName } from "./shape-presets/catalog.js";
export { isShapePresetName, normalizePictureCropShape } from "./shape-presets/contract.js";
export { getShapePresetFillBounds, type ShapePresetBounds } from "./shape-presets/bounds.js";
export { moveShapePresetAdjustment } from "./shape-presets/adjustment.js";
export { evaluateShapePreset } from "./shape-presets/evaluate.js";
export {
  flattenShapePath,
  isPointInShapePreset,
  shapePresetPathToSvg,
  type ShapePolyline,
} from "./shape-presets/path.js";
export type {
  PictureCropShape,
  ShapeAdjustmentHandle,
  ShapePathCommand,
  ShapePresetGeometry,
  ShapePresetPath,
} from "./shape-presets/types.js";
