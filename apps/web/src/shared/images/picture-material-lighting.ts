import type {
  PictureFormat3d,
  PictureLightingId,
  PictureMaterialId,
} from "@sheetcraft/core/picture-detailed-style";
import { createPictureRgbaSurface, type PictureRgbaSurface } from "./picture-effect-raster";
import type { PictureRgb } from "./picture-paint-color";

export type PictureVector3 = Readonly<{ x: number; y: number; z: number }>;
type Light = Readonly<{ direction: PictureVector3; color: PictureRgb; intensity: number }>;
type Material = Readonly<{
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
  tint: PictureRgb;
  alpha: number;
  rim: number;
  wireframe?: boolean;
}>;

/** Product-owned physical approximations. IDs match public DrawingML names;
 * numerical light rigs/materials do not claim desktop pixel equivalence. */
const materials: Record<PictureMaterialId, Material> = {
  matte: {
    ambient: 0.45,
    diffuse: 0.65,
    specular: 0.03,
    shininess: 4,
    tint: [1, 1, 1],
    alpha: 1,
    rim: 0,
  },
  "warm-matte": {
    ambient: 0.5,
    diffuse: 0.6,
    specular: 0.03,
    shininess: 4,
    tint: [1, 0.96, 0.9],
    alpha: 1,
    rim: 0,
  },
  plastic: {
    ambient: 0.3,
    diffuse: 0.65,
    specular: 0.45,
    shininess: 32,
    tint: [1, 1, 1],
    alpha: 1,
    rim: 0,
  },
  metal: {
    ambient: 0.2,
    diffuse: 0.5,
    specular: 0.8,
    shininess: 80,
    tint: [0.94, 0.96, 1],
    alpha: 1,
    rim: 0.18,
  },
  "dark-edge": {
    ambient: 0.5,
    diffuse: 0.5,
    specular: 0.12,
    shininess: 20,
    tint: [1, 1, 1],
    alpha: 1,
    rim: -0.55,
  },
  "soft-edge": {
    ambient: 0.6,
    diffuse: 0.4,
    specular: 0.12,
    shininess: 8,
    tint: [1, 1, 1],
    alpha: 1,
    rim: 0.4,
  },
  flat: { ambient: 1, diffuse: 0, specular: 0, shininess: 1, tint: [1, 1, 1], alpha: 1, rim: 0 },
  "wire-frame": {
    ambient: 1,
    diffuse: 0,
    specular: 0,
    shininess: 1,
    tint: [1, 1, 1],
    alpha: 0,
    rim: 0,
    wireframe: true,
  },
  powder: {
    ambient: 0.55,
    diffuse: 0.6,
    specular: 0.2,
    shininess: 3,
    tint: [1, 1, 1],
    alpha: 1,
    rim: 0.1,
  },
  "translucent-powder": {
    ambient: 0.6,
    diffuse: 0.55,
    specular: 0.22,
    shininess: 3,
    tint: [1, 1, 1],
    alpha: 0.65,
    rim: 0.16,
  },
  clear: {
    ambient: 0.7,
    diffuse: 0.15,
    specular: 0.75,
    shininess: 64,
    tint: [0.98, 1, 1],
    alpha: 0.28,
    rim: 0.55,
  },
};

const white: PictureRgb = [1, 1, 1],
  warm: PictureRgb = [1, 0.87, 0.72],
  cool: PictureRgb = [0.72, 0.86, 1];
function light(
  x: number,
  y: number,
  z: number,
  intensity: number,
  color: PictureRgb = white,
): Light {
  return { direction: { x, y, z }, intensity, color };
}
const lights: Record<PictureLightingId, readonly Light[]> = {
  "three-point": [light(-0.7, 0.8, 1, 0.65), light(0.8, 0.3, 1, 0.35), light(0, -0.7, 0.3, 0.2)],
  balanced: [light(-0.8, 0.8, 1, 0.5), light(0.8, 0.8, 1, 0.5)],
  soft: [light(-0.4, 0.5, 1, 0.45), light(0.5, 0.2, 1, 0.35), light(0, -0.5, 1, 0.25)],
  harsh: [light(-0.6, 0.8, 0.5, 1.35)],
  flood: [light(-0.4, 0.5, 1, 0.65), light(0.6, 0.6, 1, 0.65), light(0, -0.5, 1, 0.65)],
  contrasting: [light(-0.8, 0.7, 0.4, 0.9), light(0.8, -0.7, 0.4, 0.3, cool)],
  morning: [light(-0.8, 0.4, 0.7, 0.9, warm), light(0.5, 0.6, 1, 0.25)],
  sunrise: [light(-1, 0.2, 0.4, 1.15, [1, 0.68, 0.45]), light(0.4, 0.5, 1, 0.2, warm)],
  sunset: [light(1, 0.3, 0.35, 1, [1, 0.6, 0.4]), light(-0.6, 0.5, 1, 0.25, warm)],
  chilly: [light(-0.6, 0.8, 1, 0.85, cool), light(0.6, 0.3, 1, 0.3)],
  freezing: [light(-0.8, 0.6, 0.7, 1.1, [0.55, 0.75, 1]), light(0.5, -0.3, 1, 0.25, cool)],
  flat: [light(0, 0, 1, 1)],
  "two-point": [light(-0.8, 0.5, 0.7, 0.7), light(0.8, -0.5, 0.7, 0.7)],
  glow: [
    light(0, 0, 1, 0.65),
    light(1, 0.5, 0.2, 0.55, [1, 0.83, 0.63]),
    light(-1, -0.5, 0.2, 0.55, cool),
  ],
  "bright-room": [light(-1, 1, 1, 0.5), light(1, 1, 1, 0.5), light(0, -1, 1, 0.45)],
};

function unit(value: PictureVector3): PictureVector3 {
  if (![value.x, value.y, value.z].every(Number.isFinite))
    throw new RangeError("Picture lighting vectors must be finite.");
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-12) throw new RangeError("Picture lighting vectors must have a direction.");
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}
function dot(a: PictureVector3, b: PictureVector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export type ResolvedPictureMaterialLighting = Readonly<{
  multiply: PictureRgb;
  add: PictureRgb;
  alphaScale: number;
  wireframe: boolean;
}>;

/** One preparation per planar face, not one allocation per source pixel. */
export function resolvePictureMaterialLighting(
  format: Pick<PictureFormat3d, "material" | "lighting" | "lightingAngleDeg">,
  normal: PictureVector3,
  viewDirection: PictureVector3 = { x: 0, y: 0, z: 1 },
): ResolvedPictureMaterialLighting {
  const material = materials[format.material],
    rig = lights[format.lighting];
  if (!material || !rig) throw new TypeError("Unknown picture material or lighting rig.");
  if (!Number.isFinite(format.lightingAngleDeg) || Math.abs(format.lightingAngleDeg) > 3600)
    throw new RangeError("Picture lighting angle is out of range.");
  const n = unit(normal),
    view = unit(viewDirection);
  const radians = (format.lightingAngleDeg * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const diffuse = [0, 0, 0],
    specular = [0, 0, 0];
  for (const entry of rig) {
    const l = unit({
      x: entry.direction.x * c - entry.direction.y * s,
      y: entry.direction.x * s + entry.direction.y * c,
      z: entry.direction.z,
    });
    const incidence = Math.max(0, dot(n, l));
    const halfLength = Math.hypot(l.x + view.x, l.y + view.y, l.z + view.z);
    const highlight =
      halfLength > 1e-12 && incidence > 0
        ? Math.pow(
            Math.max(
              0,
              (n.x * (l.x + view.x) + n.y * (l.y + view.y) + n.z * (l.z + view.z)) / halfLength,
            ),
            material.shininess,
          )
        : 0;
    for (let channel = 0; channel < 3; channel++) {
      diffuse[channel]! += entry.color[channel]! * entry.intensity * incidence;
      specular[channel]! += entry.color[channel]! * entry.intensity * highlight;
    }
  }
  const rim = material.rim * Math.pow(1 - Math.max(0, dot(n, view)), 3);
  const multiply = diffuse.map((value, channel) =>
    Math.max(
      0,
      (material.ambient + value * material.diffuse + Math.min(0, rim)) * material.tint[channel]!,
    ),
  ) as unknown as PictureRgb;
  const add = specular.map(
    (value) => Math.max(0, value * material.specular + Math.max(0, rim)) * 255,
  ) as unknown as PictureRgb;
  return { multiply, add, alphaScale: material.alpha, wireframe: material.wireframe === true };
}

export function shadePictureMaterialColor(
  color: PictureRgb,
  lighting: ResolvedPictureMaterialLighting,
): PictureRgb {
  if (!color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255))
    throw new RangeError("Picture material RGB channels must be within 0–255.");
  return color.map((channel, index) =>
    Math.min(255, Math.max(0, channel * lighting.multiply[index]! + lighting.add[index]!)),
  ) as unknown as PictureRgb;
}

export function shadePictureMaterialSurface(
  surface: PictureRgbaSurface,
  lighting: ResolvedPictureMaterialLighting,
): PictureRgbaSurface {
  if (
    !(surface.data instanceof Uint8ClampedArray) ||
    surface.data.length !== surface.width * surface.height * 4
  )
    throw new TypeError("Picture material surface must have exact RGBA data.");
  const result = createPictureRgbaSurface(surface.width, surface.height);
  for (let index = 0; index < result.data.length; index += 4) {
    const alpha = surface.data[index + 3]! * lighting.alphaScale;
    if (alpha === 0) continue;
    result.data[index] = Math.min(
      255,
      surface.data[index]! * lighting.multiply[0] + lighting.add[0],
    );
    result.data[index + 1] = Math.min(
      255,
      surface.data[index + 1]! * lighting.multiply[1] + lighting.add[1],
    );
    result.data[index + 2] = Math.min(
      255,
      surface.data[index + 2]! * lighting.multiply[2] + lighting.add[2],
    );
    result.data[index + 3] = alpha;
  }
  return result;
}
