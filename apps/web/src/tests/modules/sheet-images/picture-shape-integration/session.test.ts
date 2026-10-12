import { afterEach, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
} from "@sheetcraft/core/picture-frame";
import { evaluateShapePreset } from "@sheetcraft/core/shape-presets";
import { fixture, leafPath } from "../interactive-crop/fixture";
import { getPictureShapeSourceRect } from "../../../../modules/sheet-images/picture-crop-shape";
const owners: ReturnType<typeof fixture>[] = [];
function owner(id = "framed", path: readonly string[] | null = null) {
  const f = fixture(id, path);
  owners.push(f);
  return f;
}
afterEach(() => owners.splice(0).forEach((f) => f.scope.stop()));
function sourceWorld(
  crop: import("../../../../modules/sheet-images/usePictureCropSession").PictureCropGestureSnapshot["crop"],
) {
  const geometry = resolvePictureSourceLayout(crop.layout.rect, crop.layout.angleDeg, crop.source);
  const source = getPictureShapeSourceRect(
    geometry,
    evaluateShapePreset(crop.cropShape!, geometry.rect.width, geometry.rect.height),
  );
  return {
    center: pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    }),
    width: source.width,
    height: source.height,
  };
}
test.each(["legacy0", "legacy90", "framed", "owned-group"])(
  "%s repeated crop gestures accept the strict source contract and preserve shape through ratio/history",
  (id) => {
    const f = owner(id, id === "owned-group" ? leafPath : null),
      before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    expect(f.crop.setShape({ preset: "roundRect" })).toBe(true);
    f.gesture("source", { x: 10, y: 5 });
    f.gesture("e", { x: -3, y: 2 });
    expect(f.crop.setRatio(16 / 9)).toBe(true);
    expect(f.crop.view.value!.picture.frame.cropShape?.preset).toBe("roundRect");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.crop.apply()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(52);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  },
);
test.each(["arc", "wedgeRectCallout"] as const)(
  "%s visual source drag is exact and crop resize holds its actual world source",
  (preset) => {
    const f = owner();
    f.crop.start();
    expect(f.crop.setShape({ preset })).toBe(true);
    const before = sourceWorld(f.crop.captureGesture()!.crop);
    f.gesture("source", { x: 20, y: -7 });
    const moved = sourceWorld(f.crop.captureGesture()!.crop);
    expect(moved.center.x - before.center.x).toBeCloseTo(20, 8);
    expect(moved.center.y - before.center.y).toBeCloseTo(-7, 8);
    f.gesture("se", { x: 10, y: 5 });
    const resized = sourceWorld(f.crop.captureGesture()!.crop);
    expect(resized.center.x).toBeCloseTo(moved.center.x, 8);
    expect(resized.center.y).toBeCloseTo(moved.center.y, 8);
    expect(resized.width).toBeCloseTo(moved.width, 8);
    expect(resized.height).toBeCloseTo(moved.height, 8);
  },
);
test("shape adjustments share one draft, local undo, owner identity and failure-preserving apply", () => {
  const f = owner("owned-group", leafPath),
    before = serializeWorkbook(f.session.workbook);
  f.crop.start();
  f.crop.setShape({ preset: "rightArrow" });
  const snapshot = f.crop.captureGesture()!;
  expect(f.crop.previewShapeAdjustment(snapshot, 0, { x: 8, y: 7 })).toBe(true);
  f.crop.finishGesture(snapshot);
  const adjusted = f.crop.captureGesture()!.crop;
  expect(adjusted.cropShape).not.toEqual(snapshot.crop.cropShape);
  expect(f.crop.undoDraft()).toBe(true);
  expect(f.crop.captureGesture()!.crop).toEqual(snapshot.crop);
  expect(f.crop.redoDraft()).toBe(true);
  expect(f.crop.captureGesture()!.crop).toEqual(adjusted);
  f.execute.mockReturnValueOnce(false);
  expect(f.crop.apply()).toBe(false);
  expect(f.crop.captureGesture()!.crop).toEqual(adjusted);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.crop.apply()).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(f.crop.previewShapeAdjustment(snapshot, 0, { x: 1, y: 0 })).toBe(false);
});
test("mask/reset-only edits are dirty, reset clears shape but retains angle, and invalid shape never edits", () => {
  const f = owner();
  f.crop.start();
  const baseline = f.crop.captureGesture()!.crop;
  expect(f.crop.setShape({ preset: "ellipse" })).toBe(true);
  expect(f.crop.setShape({ preset: "line" })).toBe(false);
  expect(f.crop.view.value!.picture.frame.cropShape?.preset).toBe("ellipse");
  expect(f.crop.resetShapeAndCrop()).toBe(true);
  expect(f.crop.view.value!.picture.frame.cropShape).toBeUndefined();
  expect(f.crop.captureGesture()!.crop.layout.angleDeg).toBe(baseline.layout.angleDeg);
  expect(f.crop.undoDraft()).toBe(true);
  expect(f.crop.view.value!.picture.frame.cropShape?.preset).toBe("ellipse");
  expect(f.crop.apply()).toBe(true);
  expect(f.framed().frame.cropShape?.preset).toBe("ellipse");
});
test("selection/generation changes invalidate all captured shape and adjustment actions", () => {
  const f = owner();
  f.crop.start();
  f.crop.setShape({ preset: "roundRect" });
  const snapshot = f.crop.captureGesture()!;
  f.generation.value++;
  expect(f.crop.active.value).toBe(false);
  expect(f.crop.setShape({ preset: "ellipse" })).toBe(false);
  expect(f.crop.previewShapeAdjustment(snapshot, 0, { x: 8, y: 0 })).toBe(false);
  expect(f.execute).not.toHaveBeenCalled();
});
test("a mask exceeding actual paint bounds is refused before publishing a preview or command", () => {
  const f = owner();
  f.framed().frame.anchor = { mode: "fixed", x: 100, y: 100, size: { width: 1000, height: 1000 } };
  f.crop.start();
  const before = f.crop.captureGesture()!.crop;
  expect(
    f.crop.setShape({ preset: "wedgeRectCallout", adjustments: { adj1: 2147483647, adj2: 0 } }),
  ).toBe(false);
  expect(f.crop.captureGesture()!.crop).toBe(before);
  expect(f.crop.view.value!.picture.frame.cropShape).toBeUndefined();
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.session.history.undoStack).toHaveLength(0);
});
