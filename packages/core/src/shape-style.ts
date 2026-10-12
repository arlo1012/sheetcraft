import type { PictureDetailedStyle } from "./picture-detailed-style.js";

/** Shape appearance shares the strict, document-owned paint/line/effect contract. */
export type ShapeDetailedStyle = PictureDetailedStyle;

export type {
  Choice as ShapeChoice,
  PictureColor as ShapeColor,
  PicturePaintStop as ShapePaintStop,
  PictureGradientPaint as ShapeGradientPaint,
  PicturePatternPreset as ShapePatternPreset,
  PictureAnchor as ShapeAnchor,
  PictureImageFillLayout as ShapeImageFillLayout,
  PicturePaint as ShapePaint,
  PictureDashId as ShapeDashId,
  PictureLine as ShapeLine,
  PictureShadowAnchor as ShapeShadowAnchor,
  PictureShadow as ShapeShadow,
  PictureReflection as ShapeReflection,
  PictureGlow as ShapeGlow,
  PictureSoftEdges as ShapeSoftEdges,
  PictureMaterialId as ShapeMaterialId,
  PictureLightingId as ShapeLightingId,
  PictureFormat3d as ShapeFormat3d,
  PictureRotation3d as ShapeRotation3d,
} from "./picture-detailed-style.js";

export {
  PICTURE_PATTERN_PRESETS as SHAPE_PATTERN_PRESETS,
  PICTURE_MATERIAL_IDS as SHAPE_MATERIAL_IDS,
  PICTURE_LIGHTING_IDS as SHAPE_LIGHTING_IDS,
  PICTURE_DETAILED_STYLE_LIMITS as SHAPE_DETAILED_STYLE_LIMITS,
  normalizeDetailedPictureStyle as normalizeShapeStyle,
  cloneDetailedPictureStyle as cloneShapeStyle,
  getDetailedPictureStyleAssetIds as getShapeStyleAssetIds,
} from "./picture-detailed-style.js";
