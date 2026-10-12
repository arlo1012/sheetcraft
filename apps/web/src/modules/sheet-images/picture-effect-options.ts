import type { PictureLightingId, PictureMaterialId } from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatLabelKey } from "./picture-format-pane-model";
export const PICTURE_MATERIAL_LABELS = {
  matte: "materialMatte",
  plastic: "materialPlastic",
  metal: "materialMetal",
  "warm-matte": "materialWarmMatte",
  "dark-edge": "materialDarkEdge",
  "soft-edge": "materialSoftEdge",
  flat: "materialFlat",
  "wire-frame": "materialWireFrame",
  clear: "materialClear",
  powder: "materialPowder",
  "translucent-powder": "materialTranslucentPowder",
} as const satisfies Record<PictureMaterialId, PictureFormatLabelKey>;
/** Public/product names; the desktop reference did not expose individual lighting tooltips. */
export const PICTURE_LIGHTING_LABELS = {
  "three-point": "lightingThreePoint",
  balanced: "lightingBalanced",
  soft: "lightingSoft",
  harsh: "lightingHarsh",
  flood: "lightingFlood",
  contrasting: "lightingContrasting",
  morning: "lightingMorning",
  sunrise: "lightingSunrise",
  sunset: "lightingSunset",
  chilly: "lightingChilly",
  freezing: "lightingFreezing",
  flat: "lightingFlat",
  "two-point": "lightingTwoPoint",
  glow: "lightingGlow",
  "bright-room": "lightingBrightRoom",
} as const satisfies Record<PictureLightingId, PictureFormatLabelKey>;
