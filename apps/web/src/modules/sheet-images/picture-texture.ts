/** Product-owned procedural textures. No third-party texture pixels, names or resources are copied. */
export const PICTURE_TEXTURE_IDS = [
  "paper",
  "parchment",
  "linen",
  "canvas",
  "denim",
  "burlap",
  "white-marble",
  "green-marble",
  "granite",
  "sand",
  "cork",
  "oak",
  "walnut",
  "pine",
  "bamboo",
  "brushed-steel",
  "copper",
  "pebbles",
  "water",
  "ripple",
  "mist",
  "slate",
  "brick",
  "terrazzo",
] as const;
export type PictureTextureId = (typeof PICTURE_TEXTURE_IDS)[number];
const palettes: Record<
  PictureTextureId,
  readonly [readonly [number, number, number], readonly [number, number, number]]
> = {
  paper: [
    [246, 244, 237],
    [211, 209, 199],
  ],
  parchment: [
    [242, 216, 165],
    [156, 115, 66],
  ],
  linen: [
    [230, 225, 208],
    [163, 158, 138],
  ],
  canvas: [
    [235, 225, 205],
    [175, 159, 133],
  ],
  denim: [
    [57, 95, 135],
    [20, 48, 83],
  ],
  burlap: [
    [198, 172, 123],
    [107, 77, 35],
  ],
  "white-marble": [
    [243, 243, 239],
    [152, 157, 156],
  ],
  "green-marble": [
    [73, 120, 105],
    [17, 59, 50],
  ],
  granite: [
    [191, 185, 172],
    [86, 85, 84],
  ],
  sand: [
    [226, 201, 151],
    [163, 131, 82],
  ],
  cork: [
    [200, 153, 100],
    [120, 79, 41],
  ],
  oak: [
    [211, 167, 104],
    [129, 77, 32],
  ],
  walnut: [
    [143, 91, 54],
    [60, 29, 16],
  ],
  pine: [
    [233, 199, 136],
    [179, 126, 65],
  ],
  bamboo: [
    [212, 191, 112],
    [135, 112, 47],
  ],
  "brushed-steel": [
    [220, 227, 233],
    [111, 124, 135],
  ],
  copper: [
    [222, 139, 78],
    [101, 50, 22],
  ],
  pebbles: [
    [181, 187, 184],
    [83, 100, 103],
  ],
  water: [
    [104, 185, 210],
    [22, 91, 136],
  ],
  ripple: [
    [122, 187, 219],
    [44, 103, 153],
  ],
  mist: [
    [225, 233, 239],
    [147, 164, 183],
  ],
  slate: [
    [141, 158, 170],
    [47, 67, 86],
  ],
  brick: [
    [182, 90, 66],
    [107, 45, 32],
  ],
  terrazzo: [
    [232, 229, 220],
    [149, 145, 132],
  ],
};
function random(x: number, y: number, seed: number) {
  let n = Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x27d4eb2d) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 0xffffffff;
}
function smooth(value: number) {
  return value * value * (3 - 2 * value);
}
function noise(u: number, v: number, frequency: number, seed: number) {
  const x = u * frequency,
    y = v * frequency,
    ix = Math.floor(x),
    iy = Math.floor(y),
    sx = smooth(x - ix),
    sy = smooth(y - iy),
    wrap = (n: number) => ((n % frequency) + frequency) % frequency;
  const a = random(wrap(ix), wrap(iy), seed),
    b = random(wrap(ix + 1), wrap(iy), seed),
    c = random(wrap(ix), wrap(iy + 1), seed),
    d = random(wrap(ix + 1), wrap(iy + 1), seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
const tau = Math.PI * 2;
/** Seamless periodic fields, deterministic grain; bounded before the first allocation. */
export function createPictureTexturePixels(
  id: PictureTextureId,
  side = 128,
): { width: number; height: number; data: Uint8ClampedArray } {
  if (!PICTURE_TEXTURE_IDS.includes(id) || !Number.isSafeInteger(side) || side < 16 || side > 256)
    throw new RangeError("Picture textures support known presets and a 16–256 pixel side.");
  const data = new Uint8ClampedArray(side * side * 4),
    palette = palettes[id],
    seed = (PICTURE_TEXTURE_IDS.indexOf(id) + 1) * 9176;
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const u = (x + 0.5) / side,
        v = (y + 0.5) / side,
        low = noise(u, v, 4, seed),
        mid = noise(u, v, 8, seed + 1),
        grain = random(x, y, seed + 2);
      let mix = 0.15 + 0.35 * mid + 0.12 * (grain - 0.5);
      switch (id) {
        case "paper":
          mix = 0.04 + 0.15 * grain + 0.08 * low;
          break;
        case "parchment":
          mix = 0.08 + 0.55 * low + 0.15 * mid;
          break;
        case "linen":
        case "canvas":
        case "denim":
        case "burlap": {
          const count = id === "denim" ? 24 : id === "canvas" ? 16 : id === "burlap" ? 12 : 20;
          const warp = 0.5 + 0.5 * Math.sin(u * tau * count),
            weft = 0.5 + 0.5 * Math.sin(v * tau * count);
          mix = 0.1 + 0.3 * warp + 0.3 * weft + 0.12 * grain;
          if (id === "denim")
            mix = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin((u + v) * tau * 24)) + 0.12 * grain;
          break;
        }
        case "white-marble":
        case "green-marble":
          mix =
            0.08 +
            0.7 *
              Math.pow(
                0.5 + 0.5 * Math.sin((u * 5 + v * 2) * tau + Math.sin(v * tau) * 2 + low * 5),
                12,
              ) +
            0.1 * mid;
          break;
        case "granite":
          mix = 0.05 + 0.7 * grain + 0.2 * mid;
          break;
        case "sand":
          mix = 0.08 + 0.42 * grain + 0.25 * low;
          break;
        case "cork":
          mix = 0.08 + 0.6 * noise(u, v, 32, seed) + 0.2 * grain;
          break;
        case "oak":
        case "walnut":
        case "pine":
          mix =
            0.1 +
            0.65 *
              Math.pow(0.5 + 0.5 * Math.sin(u * tau * 8 + Math.sin(v * tau) * 2 + low * 4), 5) +
            0.12 * grain;
          break;
        case "bamboo":
          mix = 0.1 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(u * tau * 8), 8) + 0.2 * mid;
          break;
        case "brushed-steel":
        case "copper":
          mix = 0.15 + 0.48 * random(x, 0, seed) + 0.08 * grain;
          break;
        case "pebbles": {
          const a = 0.5 + 0.5 * Math.sin(u * tau * 8),
            b = 0.5 + 0.5 * Math.sin(v * tau * 8);
          mix = 0.12 + 0.65 * Math.pow(1 - a * b, 3) + 0.1 * grain;
          break;
        }
        case "water":
          mix =
            0.15 +
            0.45 * (0.5 + 0.5 * Math.sin((u * 4 + v * 3) * tau + Math.sin(v * tau * 2) * 1.5)) +
            0.12 * mid;
          break;
        case "ripple":
          mix =
            0.12 +
            0.6 * Math.pow(0.5 + 0.5 * Math.sin(v * tau * 12 + Math.sin(u * tau * 2) * 2), 4) +
            0.08 * grain;
          break;
        case "mist":
          mix = 0.05 + 0.65 * low + 0.08 * mid;
          break;
        case "slate":
          mix =
            0.2 + 0.35 * low + 0.25 * (0.5 + 0.5 * Math.sin(v * tau * 6 + Math.sin(u * tau) * 0.8));
          break;
        case "brick": {
          const row = Math.floor(v * 8),
            xx = (u * 8 + (row % 2) * 0.5) % 1,
            yy = (v * 8) % 1;
          mix = xx < 0.055 || yy < 0.08 ? -0.5 : 0.12 + 0.36 * mid + 0.18 * grain;
          break;
        }
        case "terrazzo":
          mix = grain > 0.89 ? 0.75 + 0.25 * mid : 0.08 + 0.15 * low;
          break;
      }
      const i = (y * side + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const a = palette[0][channel]!,
          b = palette[1][channel]!;
        data[i + channel] = mix < 0 ? 225 : Math.round(a + (b - a) * Math.max(0, Math.min(1, mix)));
      }
      data[i + 3] = 255;
    }
  return { width: side, height: side, data };
}
/** Local PNG encoding only, using an owned canvas until the asynchronous encoder is finished. */
export async function createPictureTextureBlob(id: PictureTextureId): Promise<Blob> {
  const pixels = createPictureTexturePixels(id),
    canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw Error("Picture texture canvas is unavailable.");
    context.putImageData(
      new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height),
      0,
      0,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("Picture texture encoding failed."))),
        "image/png",
      ),
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** The namespace records an explicitly generated preset, never infers one from arbitrary pixels. */
export function pictureTextureAssetId(id: PictureTextureId, hashedId: string): string {
  if (!PICTURE_TEXTURE_IDS.includes(id)) throw new TypeError("Unknown picture texture.");
  return /^image-[a-f\d]{64}$/i.test(hashedId)
    ? `image-texture-v1-${id}-${hashedId.slice(6)}`
    : hashedId;
}
export function pictureTextureFromAssetId(assetId: string): PictureTextureId | undefined {
  return PICTURE_TEXTURE_IDS.find(
    (id) =>
      assetId.startsWith(`image-texture-v1-${id}-`) &&
      /^[a-f\d]{64}$/i.test(assetId.slice(`image-texture-v1-${id}-`.length)),
  );
}
