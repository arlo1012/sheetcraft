import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeThemeColorReference, type ThemeColorReference } from "./workbook-theme.js";

/** Explicit category removal is different from an absent, inherited category. */
export type Choice<T> = { kind: "none" } | { kind: "value"; value: T };
export type PictureChoice<T> = Choice<T>;
export type PictureColor =
  | { kind: "rgb"; rgb: string }
  | { kind: "theme"; reference: ThemeColorReference }
  | { kind: "automatic" };
export type PicturePaintStop = {
  offset: number;
  color: PictureColor;
  opacity: number;
  /** Signed color brightness adjustment, before opacity, in [-1, 1]. */
  brightness: number;
};
export type PictureGradientPaint = {
  opacity: number;
  rotateWithShape: boolean;
  /** Ordered stops; coincident offsets deliberately retain hard color transitions. */
  stops: readonly PicturePaintStop[];
} & (
  | { kind: "linear"; angleDeg: number }
  | { kind: "radial"; centerX: number; centerY: number; radiusX: number; radiusY: number }
  | { kind: "rectangular"; centerX: number; centerY: number; radiusX: number; radiusY: number }
);

/** Standard DrawingML identifiers, not a claim about the WPS gallery/order.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetpatternvalues
 */
export const PICTURE_PATTERN_PRESETS = [
  "pct5",
  "pct10",
  "pct20",
  "pct25",
  "pct30",
  "pct40",
  "pct50",
  "pct60",
  "pct70",
  "pct75",
  "pct80",
  "pct90",
  "horz",
  "vert",
  "ltHorz",
  "ltVert",
  "dkHorz",
  "dkVert",
  "narHorz",
  "narVert",
  "dashHorz",
  "dashVert",
  "cross",
  "dnDiag",
  "upDiag",
  "ltDnDiag",
  "ltUpDiag",
  "dkDnDiag",
  "dkUpDiag",
  "wdDnDiag",
  "wdUpDiag",
  "dashDnDiag",
  "dashUpDiag",
  "diagCross",
  "smCheck",
  "lgCheck",
  "smGrid",
  "lgGrid",
  "dotGrid",
  "smConfetti",
  "lgConfetti",
  "horzBrick",
  "diagBrick",
  "solidDmnd",
  "openDmnd",
  "dotDmnd",
  "plaid",
  "sphere",
  "weave",
  "divot",
  "shingle",
  "wave",
  "trellis",
  "zigZag",
] as const;
export type PicturePatternPreset = (typeof PICTURE_PATTERN_PRESETS)[number];
export type PictureAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";
export type PictureShadowAnchor = PictureAnchor;
export type PictureImageFillLayout =
  | {
      kind: "stretch";
      offsetXRatio: number;
      offsetYRatio: number;
      widthRatio: number;
      heightRatio: number;
    }
  | {
      kind: "tile";
      scaleX: number;
      scaleY: number;
      offsetXPt: number;
      offsetYPt: number;
      flip: "none" | "x" | "y" | "xy";
      anchor: PictureAnchor;
    };
export type PicturePaint =
  | { kind: "solid"; color: PictureColor; opacity: number }
  | PictureGradientPaint
  | {
      kind: "pattern";
      preset: PicturePatternPreset;
      foreground: PictureColor;
      background: PictureColor;
      opacity: number;
      rotateWithShape: boolean;
    }
  | {
      /** A document-owned image asset; tile layout supplies texture semantics. */
      kind: "picture";
      assetId: string;
      opacity: number;
      rotateWithShape: boolean;
      layout: PictureImageFillLayout;
    };
export type PictureDashId =
  | "solid"
  | "round-dot"
  | "square-dot"
  | "dash"
  | "short-dash"
  | "long-dash"
  | "long-dash-dot"
  | "long-dash-dot-dot";
export type PictureLine = {
  paint: PicturePaint;
  widthPt: number;
  compound: "single" | "double" | "thick-thin" | "thin-thick" | "triple";
  dash: PictureDashId;
  cap: "butt" | "round" | "square";
  join: "round" | "bevel" | "miter";
  miterLimit: number;
};
type PictureShadowParameters = {
  color: PictureColor;
  opacity: number;
  scale: number;
  blurPt: number;
  distancePt: number;
  angleDeg: number;
  anchor: PictureShadowAnchor;
};
export type PictureShadow = PictureShadowParameters &
  (
    | { kind: "outer" }
    | { kind: "inner" }
    | {
        kind: "perspective";
        scaleX: number;
        scaleY: number;
        skewXDeg: number;
        originX: number;
        originY: number;
      }
  );
export type PictureReflection = {
  /** Visible reflection coverage as a fraction of the object height. */
  size: number;
  opacity: number;
  blurPt: number;
  distancePt: number;
};
export type PictureGlow = { color: PictureColor; opacity: number; sizePt: number };
export type PictureSoftEdges = { sizePt: number };
/** Complete observed material palette and nonlegacy DrawingML rigs, with product-owned spelling.
 * Wire Frame corresponds to DrawingML legacyWireframe; no unobserved bevel controls.
 * Their identifiers do not certify WPS gallery mapping or rendering parity.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetmaterialtypevalues
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.lightrigvalues
 */
export const PICTURE_MATERIAL_IDS = [
  "matte",
  "plastic",
  "metal",
  "warm-matte",
  "dark-edge",
  "soft-edge",
  "flat",
  "wire-frame",
  "clear",
  "powder",
  "translucent-powder",
] as const;
export const PICTURE_LIGHTING_IDS = [
  "three-point",
  "balanced",
  "soft",
  "harsh",
  "flood",
  "contrasting",
  "morning",
  "sunrise",
  "sunset",
  "chilly",
  "freezing",
  "flat",
  "two-point",
  "glow",
  "bright-room",
] as const;
export type PictureMaterialId = (typeof PICTURE_MATERIAL_IDS)[number];
export type PictureLightingId = (typeof PICTURE_LIGHTING_IDS)[number];
export type PictureFormat3d = {
  depthPt: number;
  depthColor: PictureColor;
  contourPt: number;
  contourColor: PictureColor;
  material: PictureMaterialId;
  lighting: PictureLightingId;
  lightingAngleDeg: number;
};
type PictureRotation3dParameters = {
  /** Picture-pane X is screen yaw, Y is pitch, and Z is negative clockwise.
   * These are appearance values, never the durable 2D frame angle.
   */
  xDeg: number;
  yDeg: number;
  zDeg: number;
  distanceFromGroundPt: number;
};
export type PictureRotation3d = PictureRotation3dParameters &
  (
    | { projection: "parallel" }
    | { projection: "perspective"; perspectiveDeg: number }
    | { projection: "oblique"; shearX: number; shearY: number }
  );
export type PictureDetailedStyle = {
  fill?: Choice<PicturePaint>;
  /** Replaces the local legacy border only. V49 outline suppression stays authoritative. */
  line?: Choice<PictureLine>;
  shadow?: Choice<PictureShadow>;
  reflection?: Choice<PictureReflection>;
  glow?: Choice<PictureGlow>;
  softEdges?: Choice<PictureSoftEdges>;
  format3d?: Choice<PictureFormat3d>;
  rotation3d?: Choice<PictureRotation3d>;
};

/** Storage/engineering limits, not measured desktop application control ranges.
 * Renderers must independently enforce their geometry, pixel and resource budgets.
 */
export const PICTURE_DETAILED_STYLE_LIMITS = {
  gradientStops: 16,
  lengthPt: 4096,
  scale: 16,
  angleDeg: 3600,
  perspectiveDeg: 120,
  skewDeg: 80,
  miterLimit: 1000,
  assetIdLength: 256,
} as const;

type DataRecord = Record<string, unknown>;
function record(value: unknown, keys: readonly string[], name: string): DataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid picture ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`Picture ${name} must be an ordinary data record.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown or conflicting picture ${name} field.`);
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError(`Picture ${name} must contain own data fields, not accessors.`);
  }
  return value as DataRecord;
}
function required(value: DataRecord, key: string): unknown {
  if (!Object.hasOwn(value, key)) throw new TypeError(`Picture ${key} must be an own data field.`);
  return value[key];
}
function bounded(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`Picture ${name} must be finite and between ${min} and ${max}.`);
  return value === 0 ? 0 : value;
}
function fraction(value: unknown, name: string): number {
  return bounded(value, 0, 1, name);
}
function lengthPt(value: unknown, name: string): number {
  return bounded(value, 0, PICTURE_DETAILED_STYLE_LIMITS.lengthPt, name);
}
function angle(value: unknown, name: string): number {
  const degrees = bounded(
    value,
    -PICTURE_DETAILED_STYLE_LIMITS.angleDeg,
    PICTURE_DETAILED_STYLE_LIMITS.angleDeg,
    name,
  );
  return ((degrees % 360) + 360) % 360;
}
function positiveScale(value: unknown, name: string): number {
  const scale = bounded(value, 0, PICTURE_DETAILED_STYLE_LIMITS.scale, name);
  if (scale === 0) throw new RangeError(`Picture ${name} must be positive.`);
  return scale;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`Invalid picture ${name}.`);
  return value;
}
function enumeration<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new TypeError(`Invalid picture ${name}.`);
  return value as T;
}
const ANCHORS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;
function color(value: unknown): PictureColor {
  const source = record(value, ["kind", "rgb", "reference"], "color");
  const kind = required(source, "kind");
  if (kind === "automatic") {
    record(source, ["kind"], "automatic color");
    return { kind };
  }
  if (kind === "rgb") {
    record(source, ["kind", "rgb"], "RGB color");
    const rgb = required(source, "rgb");
    if (typeof rgb !== "string" || !/^#[\da-f]{6}$/i.test(rgb))
      throw new TypeError("Invalid picture RGB color.");
    return { kind, rgb: rgb.toUpperCase() };
  }
  if (kind === "theme") {
    record(source, ["kind", "reference"], "theme color");
    // Validate every descriptor before the existing theme normalizer reads values.
    const reference = record(required(source, "reference"), ["slot", "tint"], "theme reference");
    const slot = required(reference, "slot") as ThemeColorReference["slot"];
    const tint = Object.getOwnPropertyDescriptor(reference, "tint")?.value;
    return {
      kind,
      reference: normalizeThemeColorReference({
        slot,
        ...(tint === undefined ? {} : { tint: tint as number }),
      }),
    };
  }
  throw new TypeError("Invalid picture color kind.");
}
function gradientStops(value: unknown): PicturePaintStop[] {
  const stops = readPictureDataArray(
    value as readonly unknown[],
    "picture gradient stops",
    PICTURE_DETAILED_STYLE_LIMITS.gradientStops,
  );
  if (stops.length < 2) throw new RangeError("Picture gradients require at least two stops.");
  let previous = -1;
  return stops.map((stop) => {
    const source = record(stop, ["offset", "color", "opacity", "brightness"], "gradient stop");
    const offset = fraction(required(source, "offset"), "gradient stop offset");
    if (offset < previous) throw new RangeError("Picture gradient stops must be ordered.");
    previous = offset;
    return {
      offset,
      color: color(required(source, "color")),
      opacity: fraction(required(source, "opacity"), "gradient stop opacity"),
      brightness: bounded(required(source, "brightness"), -1, 1, "gradient stop brightness"),
    };
  });
}
function imageFillLayout(value: unknown): PictureImageFillLayout {
  const source = record(
    value,
    [
      "kind",
      "offsetXRatio",
      "offsetYRatio",
      "offsetXPt",
      "offsetYPt",
      "widthRatio",
      "heightRatio",
      "scaleX",
      "scaleY",
      "flip",
      "anchor",
    ],
    "image fill layout",
  );
  const kind = required(source, "kind");
  if (kind === "stretch") {
    record(
      source,
      ["kind", "offsetXRatio", "offsetYRatio", "widthRatio", "heightRatio"],
      "stretch fill layout",
    );
    return {
      kind,
      offsetXRatio: bounded(required(source, "offsetXRatio"), -16, 16, "fill X offset ratio"),
      offsetYRatio: bounded(required(source, "offsetYRatio"), -16, 16, "fill Y offset ratio"),
      widthRatio: positiveScale(required(source, "widthRatio"), "fill width ratio"),
      heightRatio: positiveScale(required(source, "heightRatio"), "fill height ratio"),
    };
  }
  if (kind === "tile") {
    record(
      source,
      ["kind", "offsetXPt", "offsetYPt", "scaleX", "scaleY", "flip", "anchor"],
      "tile fill layout",
    );
    return {
      kind,
      scaleX: positiveScale(required(source, "scaleX"), "tile X scale"),
      scaleY: positiveScale(required(source, "scaleY"), "tile Y scale"),
      offsetXPt: bounded(required(source, "offsetXPt"), -4096, 4096, "tile X offset points"),
      offsetYPt: bounded(required(source, "offsetYPt"), -4096, 4096, "tile Y offset points"),
      flip: enumeration(required(source, "flip"), ["none", "x", "y", "xy"], "tile flip"),
      anchor: enumeration(required(source, "anchor"), ANCHORS, "tile anchor"),
    };
  }
  throw new TypeError("Invalid picture image fill layout kind.");
}
function paint(value: unknown): PicturePaint {
  const source = record(
    value,
    [
      "kind",
      "color",
      "opacity",
      "rotateWithShape",
      "stops",
      "angleDeg",
      "centerX",
      "centerY",
      "radiusX",
      "radiusY",
      "preset",
      "foreground",
      "background",
      "assetId",
      "layout",
    ],
    "paint",
  );
  const kind = required(source, "kind");
  const opacity = fraction(required(source, "opacity"), "paint opacity");
  if (kind === "solid") {
    record(source, ["kind", "color", "opacity"], "solid paint");
    return { kind, color: color(required(source, "color")), opacity };
  }
  if (kind === "linear" || kind === "radial" || kind === "rectangular") {
    const base = {
      opacity,
      rotateWithShape: boolean(required(source, "rotateWithShape"), "gradient rotation"),
      stops: gradientStops(required(source, "stops")),
    };
    if (kind === "linear") {
      record(source, ["kind", "opacity", "rotateWithShape", "stops", "angleDeg"], "linear paint");
      return { kind, ...base, angleDeg: angle(required(source, "angleDeg"), "gradient angle") };
    }
    record(
      source,
      ["kind", "opacity", "rotateWithShape", "stops", "centerX", "centerY", "radiusX", "radiusY"],
      `${kind} paint`,
    );
    return {
      kind,
      ...base,
      centerX: fraction(required(source, "centerX"), "gradient X center"),
      centerY: fraction(required(source, "centerY"), "gradient Y center"),
      radiusX: positiveScale(required(source, "radiusX"), "gradient X radius"),
      radiusY: positiveScale(required(source, "radiusY"), "gradient Y radius"),
    };
  }
  if (kind === "pattern") {
    record(
      source,
      ["kind", "preset", "foreground", "background", "opacity", "rotateWithShape"],
      "pattern paint",
    );
    return {
      kind,
      preset: enumeration(required(source, "preset"), PICTURE_PATTERN_PRESETS, "pattern preset"),
      foreground: color(required(source, "foreground")),
      background: color(required(source, "background")),
      opacity,
      rotateWithShape: boolean(required(source, "rotateWithShape"), "pattern rotation"),
    };
  }
  if (kind === "picture") {
    record(source, ["kind", "assetId", "opacity", "rotateWithShape", "layout"], "picture paint");
    const assetId = required(source, "assetId");
    if (
      typeof assetId !== "string" ||
      !assetId ||
      assetId.length > PICTURE_DETAILED_STYLE_LIMITS.assetIdLength ||
      !/^[^\s:/\\?#]+$/u.test(assetId)
    )
      throw new TypeError("Picture fill requires a bounded document asset ID, never a URL.");
    return {
      kind,
      assetId,
      opacity,
      rotateWithShape: boolean(required(source, "rotateWithShape"), "picture fill rotation"),
      layout: imageFillLayout(required(source, "layout")),
    };
  }
  throw new TypeError("Invalid picture paint kind.");
}
function line(value: unknown): PictureLine {
  const source = record(
    value,
    ["paint", "widthPt", "compound", "dash", "cap", "join", "miterLimit"],
    "line",
  );
  return {
    paint: paint(required(source, "paint")),
    widthPt: lengthPt(required(source, "widthPt"), "line width"),
    compound: enumeration(
      required(source, "compound"),
      ["single", "double", "thick-thin", "thin-thick", "triple"],
      "line compound",
    ),
    dash: enumeration(
      required(source, "dash"),
      [
        "solid",
        "round-dot",
        "square-dot",
        "dash",
        "short-dash",
        "long-dash",
        "long-dash-dot",
        "long-dash-dot-dot",
      ],
      "line dash",
    ),
    cap: enumeration(required(source, "cap"), ["butt", "round", "square"], "line cap"),
    join: enumeration(required(source, "join"), ["round", "bevel", "miter"], "line join"),
    miterLimit: bounded(
      required(source, "miterLimit"),
      1,
      PICTURE_DETAILED_STYLE_LIMITS.miterLimit,
      "line miter limit",
    ),
  };
}
function shadow(value: unknown): PictureShadow {
  const baseKeys = [
    "kind",
    "color",
    "opacity",
    "scale",
    "blurPt",
    "distancePt",
    "angleDeg",
    "anchor",
  ];
  const affineKeys = ["scaleX", "scaleY", "skewXDeg", "originX", "originY"];
  const source = record(value, [...baseKeys, ...affineKeys], "shadow");
  const kind = enumeration(
    required(source, "kind"),
    ["outer", "inner", "perspective"],
    "shadow kind",
  );
  record(
    source,
    kind === "perspective" ? [...baseKeys, ...affineKeys] : baseKeys,
    `${kind} shadow`,
  );
  const base = {
    color: color(required(source, "color")),
    opacity: fraction(required(source, "opacity"), "shadow opacity"),
    scale: bounded(required(source, "scale"), 0, 16, "shadow scale"),
    blurPt: lengthPt(required(source, "blurPt"), "shadow blur"),
    distancePt: lengthPt(required(source, "distancePt"), "shadow distance"),
    angleDeg: angle(required(source, "angleDeg"), "shadow angle"),
    anchor: enumeration(required(source, "anchor"), ANCHORS, "shadow anchor"),
  };
  if (kind !== "perspective") return { kind, ...base };
  return {
    kind,
    ...base,
    scaleX: bounded(required(source, "scaleX"), -16, 16, "shadow affine X scale"),
    scaleY: bounded(required(source, "scaleY"), -16, 16, "shadow affine Y scale"),
    skewXDeg: bounded(required(source, "skewXDeg"), -80, 80, "shadow skew"),
    originX: fraction(required(source, "originX"), "shadow X origin"),
    originY: fraction(required(source, "originY"), "shadow Y origin"),
  };
}
function reflection(value: unknown): PictureReflection {
  const source = record(value, ["size", "opacity", "blurPt", "distancePt"], "reflection");
  return {
    size: fraction(required(source, "size"), "reflection size"),
    opacity: fraction(required(source, "opacity"), "reflection opacity"),
    blurPt: lengthPt(required(source, "blurPt"), "reflection blur"),
    distancePt: lengthPt(required(source, "distancePt"), "reflection distance"),
  };
}
function glow(value: unknown): PictureGlow {
  const source = record(value, ["color", "opacity", "sizePt"], "glow");
  return {
    color: color(required(source, "color")),
    opacity: fraction(required(source, "opacity"), "glow opacity"),
    sizePt: lengthPt(required(source, "sizePt"), "glow size"),
  };
}
function softEdges(value: unknown): PictureSoftEdges {
  const source = record(value, ["sizePt"], "soft edges");
  return { sizePt: lengthPt(required(source, "sizePt"), "soft edge size") };
}
function format3d(value: unknown): PictureFormat3d {
  const source = record(
    value,
    [
      "depthPt",
      "depthColor",
      "contourPt",
      "contourColor",
      "material",
      "lighting",
      "lightingAngleDeg",
    ],
    "3D format",
  );
  return {
    depthPt: lengthPt(required(source, "depthPt"), "3D depth"),
    depthColor: color(required(source, "depthColor")),
    contourPt: lengthPt(required(source, "contourPt"), "3D contour"),
    contourColor: color(required(source, "contourColor")),
    material: enumeration(required(source, "material"), PICTURE_MATERIAL_IDS, "3D material"),
    lighting: enumeration(required(source, "lighting"), PICTURE_LIGHTING_IDS, "3D lighting"),
    lightingAngleDeg: angle(required(source, "lightingAngleDeg"), "lighting angle"),
  };
}
function rotation3d(value: unknown): PictureRotation3d {
  const commonKeys = ["projection", "xDeg", "yDeg", "zDeg", "distanceFromGroundPt"];
  const source = record(
    value,
    [...commonKeys, "perspectiveDeg", "shearX", "shearY"],
    "3D rotation",
  );
  const projection = enumeration(
    required(source, "projection"),
    ["parallel", "perspective", "oblique"],
    "3D projection",
  );
  record(
    source,
    projection === "parallel"
      ? commonKeys
      : projection === "perspective"
        ? [...commonKeys, "perspectiveDeg"]
        : [...commonKeys, "shearX", "shearY"],
    `${projection} rotation`,
  );
  const base = {
    xDeg: angle(required(source, "xDeg"), "3D X rotation"),
    yDeg: angle(required(source, "yDeg"), "3D Y rotation"),
    zDeg: angle(required(source, "zDeg"), "3D Z rotation"),
    distanceFromGroundPt: bounded(
      required(source, "distanceFromGroundPt"),
      -PICTURE_DETAILED_STYLE_LIMITS.lengthPt,
      PICTURE_DETAILED_STYLE_LIMITS.lengthPt,
      "3D ground distance",
    ),
  };
  if (projection === "parallel") return { projection, ...base };
  if (projection === "perspective")
    return {
      projection,
      ...base,
      perspectiveDeg: bounded(
        required(source, "perspectiveDeg"),
        0,
        PICTURE_DETAILED_STYLE_LIMITS.perspectiveDeg,
        "3D perspective",
      ),
    };
  return {
    projection,
    ...base,
    shearX: bounded(required(source, "shearX"), -16, 16, "oblique X shear"),
    shearY: bounded(required(source, "shearY"), -16, 16, "oblique Y shear"),
  };
}
function choice<T>(value: unknown, normalize: (input: unknown) => T): Choice<T> {
  const source = record(value, ["kind", "value"], "effect choice");
  const kind = required(source, "kind");
  if (kind === "none") {
    record(source, ["kind"], "None choice");
    return { kind };
  }
  if (kind === "value") return { kind, value: normalize(required(source, "value")) };
  throw new TypeError("Invalid picture effect choice kind.");
}

/** Canonicalize and deeply detach strict, ordinary own-data style records. */
export function normalizeDetailedPictureStyle(value: unknown): PictureDetailedStyle | undefined {
  if (value === undefined) return undefined;
  const source = record(
    value,
    ["fill", "line", "shadow", "reflection", "glow", "softEdges", "format3d", "rotation3d"],
    "detailed style",
  );
  const result: PictureDetailedStyle = {};
  if (Object.hasOwn(source, "fill")) result.fill = choice(source.fill, paint);
  if (Object.hasOwn(source, "line")) result.line = choice(source.line, line);
  if (Object.hasOwn(source, "shadow")) result.shadow = choice(source.shadow, shadow);
  if (Object.hasOwn(source, "reflection"))
    result.reflection = choice(source.reflection, reflection);
  if (Object.hasOwn(source, "glow")) result.glow = choice(source.glow, glow);
  if (Object.hasOwn(source, "softEdges")) result.softEdges = choice(source.softEdges, softEdges);
  if (Object.hasOwn(source, "format3d")) result.format3d = choice(source.format3d, format3d);
  if (Object.hasOwn(source, "rotation3d"))
    result.rotation3d = choice(source.rotation3d, rotation3d);
  return Object.keys(result).length ? result : undefined;
}

/** The normalizer already creates fresh records/arrays at every level. */
export function cloneDetailedPictureStyle(
  value: PictureDetailedStyle | undefined,
): PictureDetailedStyle | undefined {
  return normalizeDetailedPictureStyle(value);
}

/** Auxiliary document-owned fill assets, in stable fill-then-line order. */
export function getDetailedPictureStyleAssetIds(value: PictureDetailedStyle | undefined): string[] {
  const style = normalizeDetailedPictureStyle(value);
  const assetIds = new Set<string>();
  if (style?.fill?.kind === "value" && style.fill.value.kind === "picture")
    assetIds.add(style.fill.value.assetId);
  if (style?.line?.kind === "value" && style.line.value.paint.kind === "picture")
    assetIds.add(style.line.value.paint.assetId);
  return [...assetIds];
}
