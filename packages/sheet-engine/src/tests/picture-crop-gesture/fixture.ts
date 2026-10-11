import { expect } from "vitest";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import {
  pictureFrameLocalToWorld,
  resolvePictureLayout,
  type PictureSourceFrame,
} from "@sheetcraft/core/picture-frame";
import type { Point } from "../../geometry.js";

export function fixture(angleDeg = 0, source?: PictureSourceFrame): ResolvedPictureCrop {
  return {
    layout: resolvePictureLayout({ x: 144, y: 144, width: 360, height: 240 }, angleDeg),
    source: source ?? { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  };
}

export function vector(x: number, y: number, angleDeg: number): Point {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(angle) * x - Math.sin(angle) * y,
    y: Math.sin(angle) * x + Math.cos(angle) * y,
  };
}

export function sourcePoint(
  crop: ResolvedPictureCrop,
  u: number,
  v: number,
  flipHorizontal = false,
  flipVertical = false,
): Point {
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
        [0.23, 0.61],
      ] as const) {
        const old = sourcePoint(before, u, v, flipHorizontal, flipVertical);
        const next = sourcePoint(after, u, v, flipHorizontal, flipVertical);
        expect(next.x).toBeCloseTo(old.x, 9);
        expect(next.y).toBeCloseTo(old.y, 9);
      }
  expect(after.layout.rect.width * after.source.widthRatio).toBeCloseTo(
    before.layout.rect.width * before.source.widthRatio,
    9,
  );
  expect(after.layout.rect.height * after.source.heightRatio).toBeCloseTo(
    before.layout.rect.height * before.source.heightRatio,
    9,
  );
}
