import { expect, test } from "vitest";
import {
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
} from "@sheetcraft/core/picture-frame";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  isPointInShapePreset,
} from "@sheetcraft/core/shape-presets";
import { fixture } from "../picture-crop-overlay/fixture";
import { hitPictureViewportPoint } from "../../../../modules/sheet-images/picture-hit-testing";
import { getPictureShapeSourceRect } from "../../../../modules/sheet-images/picture-crop-shape";
import {
  preparePictureCropPreview,
  getPictureCropViewportFragments,
} from "../../../../modules/sheet-images/picture-crop-preview";
function owner(preset: "ellipse" | "donut" | "arc" | "wedgeRectCallout", angle = 0) {
  const f = fixture();
  f.picture.frame.angleDeg = angle;
  f.picture.frame.cropShape = { preset };
  f.picture.frame.anchor = { mode: "fixed", x: 100, y: 100, size: { width: 180, height: 120 } };
  f.picture.frame.source = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
  return f;
}
test.each(["ellipse", "donut", "arc"] as const)(
  "%s routes only actual filled geometry, not its rectangular frame",
  (preset) => {
    const f = owner(preset, 37),
      geometry = f.resolved();
    const context = { layout: f.layout, metrics: f.metrics };
    const shape = evaluateShapePreset({ preset }, 180, 120);
    for (const local of [
      { x: 1, y: 1 },
      { x: 90, y: 60 },
      { x: 140, y: 60 },
      { x: 120, y: 20 },
    ]) {
      const point = pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, local);
      expect(!!hitPictureViewportPoint([f.picture], point, f.layout, context)).toBe(
        isPointInShapePreset(shape, local),
      );
    }
  },
);
test("default Arc maps the complete source into its true quarter-sector extent without changing durable source fields", () => {
  const f = owner("arc"),
    before = structuredClone(f.picture),
    geometry = f.resolved();
  const shape = evaluateShapePreset({ preset: "arc" }, 180, 120),
    bounds = getShapePresetFillBounds(shape)!;
  for (const [key, value] of Object.entries({ left: 90, top: 0, width: 90, height: 60 }))
    expect(bounds[key as keyof typeof bounds]).toBeCloseTo(value, 10);
  const mapped = getPictureShapeSourceRect(geometry, shape);
  for (const [key, value] of Object.entries({ x: 90, y: 0, width: 90, height: 60 }))
    expect(mapped[key as keyof typeof mapped]).toBeCloseTo(value, 10);
  const preview = preparePictureCropPreview(f.picture, geometry);
  for (const [key, value] of Object.entries({ x: 190, y: 100, width: 90, height: 60 }))
    expect(preview.ghostGeometry.rect[key as keyof typeof preview.ghostGeometry.rect]).toBeCloseTo(
      value,
      10,
    );
  expect(preview.ghostPicture.frame.cropShape).toBeUndefined();
  expect(f.picture).toEqual(before);
});
test("callout tail remains selectable and in crop controls beyond the original rectangle", () => {
  const f = owner("wedgeRectCallout"),
    geometry = f.resolved(),
    shape = evaluateShapePreset({ preset: "wedgeRectCallout" }, 180, 120);
  let tail: { x: number; y: number } | undefined;
  const bounds = getShapePresetFillBounds(shape)!;
  for (let y = 122; y < bounds.top + bounds.height && !tail; y += 2)
    for (let x = 1; x < 180; x += 2)
      if (isPointInShapePreset(shape, { x, y })) {
        tail = { x, y };
        break;
      }
  expect(tail).toBeDefined();
  const point = pictureFrameLocalToWorld(geometry.rect, 0, tail!);
  expect(
    hitPictureViewportPoint([f.picture], point, f.layout, { layout: f.layout, metrics: f.metrics })
      ?.image.id,
  ).toBe(f.picture.id);
  const fragments = getPictureCropViewportFragments(
    preparePictureCropPreview(f.picture, geometry),
    f.layout,
  );
  expect(fragments).toHaveLength(1);
  expect(fragments[0]!.clippedBounds.height).toBeGreaterThan(geometry.bounds.height);
  expect(fragments[0]!.geometry.bounds).toEqual(geometry.bounds);
});
test("shape preview maps off-center flipped and rotated source by the same filled bounds contract", () => {
  const f = owner("arc", 37);
  f.picture.frame.flipHorizontal = true;
  f.picture.frame.flipVertical = true;
  f.picture.frame.source = {
    widthRatio: 2,
    heightRatio: 1.5,
    offsetXRatio: 0.3,
    offsetYRatio: -0.2,
  };
  const geometry = f.resolved(),
    shape = evaluateShapePreset({ preset: "arc" }, 180, 120),
    source = getPictureShapeSourceRect(geometry, shape);
  const preview = preparePictureCropPreview(f.picture, geometry),
    center = pictureFrameLocalToWorld(geometry.rect, 37, {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    });
  expect(preview.ghostGeometry.rect.x + source.width / 2).toBeCloseTo(center.x, 10);
  expect(preview.ghostGeometry.rect.y + source.height / 2).toBeCloseTo(center.y, 10);
  expect(preview.ghostPicture.frame).toMatchObject({ flipHorizontal: true, flipVertical: true });
  expect(preview.ghostGeometry).toEqual(
    resolvePictureSourceLayout(preview.ghostGeometry.rect, 37, {
      widthRatio: 1,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    }),
  );
});
