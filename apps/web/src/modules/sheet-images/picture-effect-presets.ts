import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
  type Choice,
  type PictureShadow,
  type PictureReflection,
  type PictureGlow,
  type PictureSoftEdges,
  type PictureRotation3d,
} from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatLabelKey } from "./picture-format-pane-model";
import { createPictureShadow, createPictureRotation3d } from "./picture-effect-edit";

export type PicturePresetCategory = "shadow" | "reflection" | "glow" | "softEdges" | "rotation3d";
export type PicturePresetValues = {
  shadow: PictureShadow;
  reflection: PictureReflection;
  glow: PictureGlow;
  softEdges: PictureSoftEdges;
  rotation3d: PictureRotation3d;
};
export type PictureEffectPreset<K extends PicturePresetCategory> = Readonly<{
  id: string;
  labelKey: PictureFormatLabelKey;
  ordinal?: number;
  unitKey?: PictureFormatLabelKey;
  value: Choice<PicturePresetValues[K]>;
  previewStyle: PictureDetailedStyle;
}>;
export type PictureEffectPresetGroup<K extends PicturePresetCategory> = Readonly<{
  labelKey: PictureFormatLabelKey;
  items: readonly PictureEffectPreset<K>[];
}>;
function preset<K extends PicturePresetCategory>(
  category: K,
  id: string,
  labelKey: PictureFormatLabelKey,
  value: Choice<PicturePresetValues[K]>,
  ordinal?: number,
): PictureEffectPreset<K> {
  const previewStyle = normalizeDetailedPictureStyle({ [category]: value })!;
  return {
    id,
    labelKey,
    ...(ordinal === undefined ? {} : { ordinal }),
    value: previewStyle[category] as Choice<PicturePresetValues[K]>,
    previewStyle,
  };
}
function noEffect<K extends PicturePresetCategory>(category: K): PictureEffectPresetGroup<K> {
  return {
    labelKey: "effectNone",
    items: [preset(category, `${category}-none`, "effectNone", { kind: "none" })],
  };
}
const directions = [
  ["top-left", "alignTopLeft", -1, -1],
  ["top", "alignTop", 0, -1],
  ["top-right", "alignTopRight", 1, -1],
  ["left", "alignLeft", -1, 0],
  ["center", "alignCenter", 0, 0],
  ["right", "alignRight", 1, 0],
  ["bottom-left", "alignBottomLeft", -1, 1],
  ["bottom", "alignBottom", 0, 1],
  ["bottom-right", "alignBottomRight", 1, 1],
] as const;
/** Own numeric presets. Counts/layout follow observed tool families; parameters are not extracted WPS assets. */
const shadows: readonly PictureEffectPresetGroup<"shadow">[] = [
  noEffect("shadow"),
  ...(["outer", "inner"] as const).map((kind) => ({
    labelKey: kind === "outer" ? ("shadowOuter" as const) : ("shadowInner" as const),
    items: directions.map(([id, labelKey, x, y]) =>
      preset("shadow", `${kind}-${id}`, labelKey, {
        kind: "value",
        value: {
          ...createPictureShadow(kind),
          scale: id === "center" && kind === "outer" ? 1.06 : 1,
          blurPt: kind === "inner" ? 3 : 4,
          distancePt: Math.hypot(x, y) * 3,
          angleDeg: x === 0 && y === 0 ? 0 : (Math.atan2(y, x) * 180) / Math.PI,
        },
      }),
    ),
  })),
  {
    labelKey: "shadowPerspective",
    items: [-40, -20, 0, 20, 40].map((skew, index) =>
      preset(
        "shadow",
        `perspective-${index}`,
        "shadowPerspective",
        {
          kind: "value",
          value: {
            ...createPictureShadow("perspective"),
            kind: "perspective",
            scaleX: 1,
            scaleY: 0.5,
            skewXDeg: skew,
            originX: 0.5,
            originY: 1,
          },
        },
        index + 1,
      ),
    ),
  },
];
const reflections: readonly PictureEffectPresetGroup<"reflection">[] = [
  noEffect("reflection"),
  {
    labelKey: "reflectionSection",
    items: [0.25, 0.5, 1].flatMap((size, row) =>
      [0, 3, 6].map((distancePt, column) =>
        preset(
          "reflection",
          `reflection-${row}-${column}`,
          "reflectionSection",
          { kind: "value", value: { size, opacity: 0.35, blurPt: 0, distancePt } },
          row * 3 + column + 1,
        ),
      ),
    ),
  },
];
const accents = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;
const glows: readonly PictureEffectPresetGroup<"glow">[] = [
  noEffect("glow"),
  {
    labelKey: "glowSection",
    items: [2, 5, 10, 15].flatMap((sizePt, row) =>
      accents.map((slot, column) =>
        preset(
          "glow",
          `glow-${slot}-${sizePt}`,
          "glowSection",
          {
            kind: "value",
            value: { color: { kind: "theme", reference: { slot } }, opacity: 0.6, sizePt },
          },
          row * 6 + column + 1,
        ),
      ),
    ),
  },
];
const softEdges: readonly PictureEffectPresetGroup<"softEdges">[] = [
  noEffect("softEdges"),
  {
    labelKey: "softEdgesSection",
    items: [1, 2.5, 5, 10, 25, 50].map((sizePt) => ({
      ...preset(
        "softEdges",
        `soft-${sizePt}`,
        "softEdgeSizePt",
        { kind: "value", value: { sizePt } },
        sizePt,
      ),
      unitKey: "unitPt" as const,
    })),
  },
];
const parallelAngles: readonly (readonly [number, number, number])[] = [
  [-35, -20, 0],
  [35, -20, 0],
  [-35, 20, 0],
  [35, 20, 0],
  [-55, 0, 0],
  [0, -25, 0],
  [0, 55, 0],
  [35, 0, 0],
  [-35, 0, 0],
  [0, 35, 0],
];
const perspectiveAngles: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [-20, 0, 0],
  [20, 0, 0],
  [0, 20, 0],
  [0, -20, 0],
  [0, 45, 0],
  [-35, 20, 0],
  [35, 20, 0],
  [-35, -20, 0],
  [35, -20, 0],
  [35, 0, 0],
];
const rotations: readonly PictureEffectPresetGroup<"rotation3d">[] = [
  noEffect("rotation3d"),
  {
    labelKey: "projectionParallel",
    items: parallelAngles.map(([xDeg, yDeg, zDeg], index) =>
      preset(
        "rotation3d",
        `parallel-${index}`,
        "projectionParallel",
        {
          kind: "value",
          value: {
            ...createPictureRotation3d("parallel"),
            projection: "parallel",
            xDeg,
            yDeg,
            zDeg,
          },
        },
        index + 1,
      ),
    ),
  },
  {
    labelKey: "projectionPerspective",
    items: perspectiveAngles.map(([xDeg, yDeg, zDeg], index) =>
      preset(
        "rotation3d",
        `perspective-${index}`,
        "projectionPerspective",
        {
          kind: "value",
          value: {
            ...createPictureRotation3d("perspective"),
            projection: "perspective",
            perspectiveDeg: 45,
            xDeg,
            yDeg,
            zDeg,
          },
        },
        index + 1,
      ),
    ),
  },
  {
    labelKey: "projectionOblique",
    items: [
      [-0.35, 0],
      [0.35, 0],
      [0, -0.35],
      [0, 0.35],
    ].map(([shearX, shearY], index) =>
      preset(
        "rotation3d",
        `oblique-${index}`,
        "projectionOblique",
        {
          kind: "value",
          value: {
            ...createPictureRotation3d("oblique"),
            projection: "oblique",
            shearX: shearX!,
            shearY: shearY!,
          },
        },
        index + 1,
      ),
    ),
  },
];
const catalogs: { [K in PicturePresetCategory]: readonly PictureEffectPresetGroup<K>[] } = {
  shadow: shadows,
  reflection: reflections,
  glow: glows,
  softEdges,
  rotation3d: rotations,
};
export function getPictureEffectPresetGroups<K extends PicturePresetCategory>(
  category: K,
): readonly PictureEffectPresetGroup<K>[] {
  return catalogs[category];
}
export function getPictureEffectPreset<K extends PicturePresetCategory>(
  category: K,
  id: string,
): Choice<PicturePresetValues[K]> | undefined {
  const value = catalogs[category]
    .flatMap((group) => group.items)
    .find((item) => item.id === id)?.value;
  return value === undefined
    ? undefined
    : (normalizeDetailedPictureStyle({ [category]: value })![category] as Choice<
        PicturePresetValues[K]
      >);
}
export function findPictureEffectPresetId<K extends PicturePresetCategory>(
  category: K,
  value: PictureDetailedStyle[K],
): string | undefined {
  if (value === undefined) return;
  const canonical = normalizeDetailedPictureStyle({ [category]: value })![category];
  const key = JSON.stringify(canonical);
  return catalogs[category]
    .flatMap((group) => group.items)
    .find((item) => JSON.stringify(item.value) === key)?.id;
}
