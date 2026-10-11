import { expect } from "vitest";
import {
  pictureFrameLocalToWorld,
  resolvePictureLayout,
  type PictureSourceFrame,
} from "../../picture-frame.js";
import type { ResolvedPictureCrop } from "../../picture-crop-edit.js";

export function fixture(angleDeg = 0, source?: PictureSourceFrame): ResolvedPictureCrop {
  return {
    layout: resolvePictureLayout({ x: 176.64, y: 80.64, width: 360, height: 240 }, angleDeg),
    source: source ?? { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  };
}
export function sourcePoint(
  crop: ResolvedPictureCrop,
  u: number,
  v: number,
  flipHorizontal = false,
  flipVertical = false,
) {
  const { rect, angleDeg } = crop.layout;
  const source = crop.source;
  return pictureFrameLocalToWorld(rect, angleDeg, {
    x:
      rect.width / 2 +
      rect.width * source.offsetXRatio +
      ((flipHorizontal ? 1 - u : u) - 0.5) * rect.width * source.widthRatio,
    y:
      rect.height / 2 +
      rect.height * source.offsetYRatio +
      ((flipVertical ? 1 - v : v) - 0.5) * rect.height * source.heightRatio,
  });
}
export function expectSourcePreserved(before: ResolvedPictureCrop, after: ResolvedPictureCrop) {
  for (const flipHorizontal of [false, true])
    for (const flipVertical of [false, true])
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0.3, 0.4],
        [0.5, 0.5],
      ]) {
        const old = sourcePoint(before, u!, v!, flipHorizontal, flipVertical);
        const next = sourcePoint(after, u!, v!, flipHorizontal, flipVertical);
        expect(next.x).toBeCloseTo(old.x, 9);
        expect(next.y).toBeCloseTo(old.y, 9);
      }
  expect(after.layout.rect.width * after.source.widthRatio).toBeCloseTo(
    before.layout.rect.width * before.source.widthRatio,
    10,
  );
  expect(after.layout.rect.height * after.source.heightRatio).toBeCloseTo(
    before.layout.rect.height * before.source.heightRatio,
    10,
  );
  expect(after.layout.angleDeg).toBe(before.layout.angleDeg);
}
