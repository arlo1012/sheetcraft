import type {
  ConditionalFormatCondition,
  ConditionalFormatIconSet,
} from "@sheetcraft/core/conditional-formatting";

const BAR_COLORS = {
  Blue: "#638EC6",
  Green: "#63BE7B",
  Red: "#F8696B",
  Orange: "#F4B183",
  LightBlue: "#9DC3E6",
  Purple: "#B4A7D6",
} as const;

type BarColor = keyof typeof BAR_COLORS;
type BarPreset = `bar${BarColor}` | `bar${BarColor}Solid`;
type ScalePreset =
  | "scaleRedYellowGreen"
  | "scaleGreenYellowRed"
  | "scaleRedWhiteBlue"
  | "scaleBlueWhiteRed"
  | "scaleWhiteRed"
  | "scaleRedWhite"
  | "scaleWhiteGreen"
  | "scaleGreenWhite"
  | "scaleWhiteBlue"
  | "scaleBlueWhite"
  | "scaleYellowRed"
  | "scaleGreenYellow";
type IconPreset = `icons${ConditionalFormatIconSet}`;

export type ConditionalFormatPresetKind =
  | BarPreset
  | ScalePreset
  | IconPreset
  | "iconsArrows"
  | "iconsTrafficLights"
  | "iconsFlags"
  | "iconsSymbols";

export const dataBarPresetTiles = (Object.keys(BAR_COLORS) as BarColor[]).flatMap((color) => [
  { kind: `bar${color}` as const, color: BAR_COLORS[color], gradient: true },
  { kind: `bar${color}Solid` as const, color: BAR_COLORS[color], gradient: false },
]);

const SCALE_COLORS = {
  scaleRedYellowGreen: ["#F8696B", "#FFEB84", "#63BE7B"],
  scaleGreenYellowRed: ["#63BE7B", "#FFEB84", "#F8696B"],
  scaleRedWhiteBlue: ["#F8696B", "#FFFFFF", "#638EC6"],
  scaleBlueWhiteRed: ["#638EC6", "#FFFFFF", "#F8696B"],
  scaleWhiteRed: ["#FFFFFF", "#F8696B"],
  scaleRedWhite: ["#F8696B", "#FFFFFF"],
  scaleWhiteGreen: ["#FFFFFF", "#63BE7B"],
  scaleGreenWhite: ["#63BE7B", "#FFFFFF"],
  scaleWhiteBlue: ["#FFFFFF", "#638EC6"],
  scaleBlueWhite: ["#638EC6", "#FFFFFF"],
  scaleYellowRed: ["#FFEB84", "#F8696B"],
  scaleGreenYellow: ["#63BE7B", "#FFEB84"],
} as const satisfies Record<ScalePreset, readonly string[]>;

export const colorScalePresetTiles = Object.entries(SCALE_COLORS).map(([kind, colors]) => ({
  kind: kind as ScalePreset,
  colors,
}));

export const iconSetPresetTiles = [
  "threeArrows",
  "threeArrowsGray",
  "threeTriangles",
  "fourArrowsGray",
  "fourArrows",
  "fiveArrowsGray",
  "fiveArrows",
  "threeTrafficLights",
  "threeTrafficLightsRimmed",
  "threeSigns",
  "fourTrafficLights",
  "fourRedToBlack",
  "threeSymbolsCircled",
  "threeSymbols",
  "threeFlags",
  "threeStars",
  "fourRatings",
  "fiveQuarters",
  "fiveRatings",
  "fiveBoxes",
] as const satisfies readonly ConditionalFormatIconSet[];

/** Each call returns independent rule data so editing a preset never changes later drafts. */
export function getConditionalFormatPreset(kind: string): ConditionalFormatCondition | undefined {
  if (kind.startsWith("bar")) {
    const match = /^bar(Blue|Green|Red|Orange|LightBlue|Purple)(Solid)?$/u.exec(kind);
    if (!match) return undefined;
    return {
      kind: "dataBar",
      minimum: { kind: "autoMin" },
      maximum: { kind: "autoMax" },
      color: BAR_COLORS[match[1] as BarColor],
      gradient: !match[2],
      showValue: true,
    };
  }
  if (kind in SCALE_COLORS) {
    const colors = SCALE_COLORS[kind as ScalePreset];
    return {
      kind: "colorScale",
      stops:
        colors.length === 2
          ? [
              { threshold: { kind: "min" }, color: colors[0] },
              { threshold: { kind: "max" }, color: colors[1] },
            ]
          : [
              { threshold: { kind: "min" }, color: colors[0] },
              { threshold: { kind: "percentile", value: 50 }, color: colors[1] },
              { threshold: { kind: "max" }, color: colors[2] },
            ],
    } as ConditionalFormatCondition;
  }
  if (kind.startsWith("icons")) {
    const legacyIconSets: Record<string, ConditionalFormatIconSet> = {
      iconsArrows: "threeArrows",
      iconsTrafficLights: "threeTrafficLights",
      iconsFlags: "threeFlags",
      iconsSymbols: "threeSymbols",
    };
    const iconSet = legacyIconSets[kind] ?? (kind.slice(5) as ConditionalFormatIconSet);
    if (!iconSetPresetTiles.includes(iconSet)) return undefined;
    const count = iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
    return {
      kind: "iconSet",
      iconSet,
      thresholds: Array.from({ length: count }, (_, index) => ({
        kind: "percent" as const,
        value: Math.round((index * 100) / count),
      })),
      showValue: true,
    };
  }
}
