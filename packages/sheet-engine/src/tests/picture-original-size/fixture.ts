import { expect } from "vitest";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import {
  pictureFrameLocalToWorld,
  resolvePictureLayout,
  type PictureSourceFrame,
} from "@sheetcraft/core/picture-frame";

export function fixture(angleDeg = 37, source?: PictureSourceFrame): ResolvedPictureCrop {
  return {
    layout: resolvePictureLayout({ x: 144, y: 144, width: 192, height: 144 }, angleDeg),
    source: source ?? {
      widthRatio: 360 / 192,
      heightRatio: 240 / 144,
      offsetXRatio: 48 / 192,
      offsetYRatio: 28.8 / 144,
    },
  };
}

export function sourcePoint(crop: ResolvedPictureCrop, u: number, v: number) {
  const { rect, angleDeg } = crop.layout;
  return pictureFrameLocalToWorld(rect, angleDeg, {
    x:
      rect.width / 2 +
      rect.width * crop.source.offsetXRatio +
      (u - 0.5) * rect.width * crop.source.widthRatio,
    y:
      rect.height / 2 +
      rect.height * crop.source.offsetYRatio +
      (v - 0.5) * rect.height * crop.source.heightRatio,
  });
}

export function expectScaledSource(
  before: ResolvedPictureCrop,
  after: ResolvedPictureCrop,
  widthFactor: number,
  heightFactor: number,
) {
  const angle = (before.layout.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const origin = before.layout.corners[0];
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0.23, 0.61],
  ] as const) {
    const old = sourcePoint(before, u, v);
    const next = sourcePoint(after, u, v);
    const x = cos * (old.x - origin.x) + sin * (old.y - origin.y);
    const y = -sin * (old.x - origin.x) + cos * (old.y - origin.y);
    expect(next.x).toBeCloseTo(origin.x + cos * x * widthFactor - sin * y * heightFactor, 9);
    expect(next.y).toBeCloseTo(origin.y + sin * x * widthFactor + cos * y * heightFactor, 9);
  }
}
