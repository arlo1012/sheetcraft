// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  PICTURE_TEXTURE_IDS,
  createPictureTexturePixels,
  pictureTextureAssetId,
  pictureTextureFromAssetId,
} from "../../../../modules/sheet-images/picture-texture";
test("24 named product-owned textures have distinct, deterministic opaque pixels", () => {
  const hashes = new Set<string>();
  expect(PICTURE_TEXTURE_IDS).toHaveLength(24);
  for (const id of PICTURE_TEXTURE_IDS) {
    const pixels = createPictureTexturePixels(id, 32);
    expect(pixels.width).toBe(32);
    expect(pixels.height).toBe(32);
    expect(pixels.data).toHaveLength(32 * 32 * 4);
    expect(createPictureTexturePixels(id, 32).data).toEqual(pixels.data);
    for (let n = 3; n < pixels.data.length; n += 4) expect(pixels.data[n]).toBe(255);
    hashes.add(createHash("sha256").update(pixels.data).digest("hex"));
  }
  expect(hashes.size).toBe(24);
});
test.each([-1, 0, 15, 257, 100000, NaN, Infinity, 16.5])(
  "invalid texture size %s rejects before allocating pixels",
  (side) => {
    expect(() => createPictureTexturePixels("paper", side)).toThrow();
  },
);
test("only known presets with genuine content-hash identity use the generated namespace", () => {
  const hash = "a".repeat(64);
  for (const id of PICTURE_TEXTURE_IDS) {
    const asset = pictureTextureAssetId(id, `image-${hash}`);
    expect(pictureTextureFromAssetId(asset)).toBe(id);
    expect(asset.length).toBeLessThanOrEqual(256);
  }
  expect(pictureTextureFromAssetId("image-texture-v1-paper-unknown")).toBeUndefined();
  expect(pictureTextureFromAssetId(`image-texture-v1-unknown-${hash}`)).toBeUndefined();
  expect(pictureTextureFromAssetId(`image-${hash}`)).toBeUndefined();
  expect(pictureTextureAssetId("paper", "image-unhashed-valid-random")).toBe(
    "image-unhashed-valid-random",
  );
  expect(() => pictureTextureAssetId("unknown" as never, `image-${hash}`)).toThrow();
  expect(() => createPictureTexturePixels("unknown" as never)).toThrow();
});
