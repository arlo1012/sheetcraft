import { expect, test } from "vitest";
import { normalizeDetailedPictureStyle } from "@sheetcraft/core/picture-detailed-style";
import {
  createPictureGradientPaint,
  changePictureGradientKind,
  editPictureGradientStop,
  addPictureGradientStop,
  removePictureGradientStop,
  picturePaintColorFromSelection,
  getPictureStretchOffsets,
  editPictureStretchOffset,
} from "../../../../modules/sheet-images/picture-paint-edit";
import {
  createPictureLine,
  createPictureShadow,
  createPictureReflection,
  createPictureGlow,
  createPictureSoftEdges,
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../../modules/sheet-images/picture-effect-edit";
test("gradient insertion and stable stop edits preserve live references and selection", () => {
  const value = createPictureGradientPaint(),
    original = structuredClone(value);
  const added = addPictureGradientStop(value);
  expect(added.selectedIndex).toBe(1);
  expect(added.gradient.stops).toHaveLength(3);
  expect(added.gradient.stops[1]!.color).toEqual(value.stops[0]!.color);
  const edited = editPictureGradientStop(added.gradient, 1, { offset: 1, brightness: -0.5 });
  expect(edited.selectedIndex).toBe(1);
  expect(edited.gradient.stops[1]!.brightness).toBe(-0.5);
  expect(edited.gradient.stops[2]).toEqual(original.stops[1]);
  expect(removePictureGradientStop(edited.gradient, 1).gradient).toEqual(value);
  expect(value).toEqual(original);
});
test("all gradient modes retain exact stop brightness, opacity and identities", () => {
  const value = createPictureGradientPaint();
  let next = changePictureGradientKind(value, "radial");
  expect(next.stops).toEqual(value.stops);
  expect(next).toMatchObject({ centerX: 0.5, centerY: 0.5, radiusX: 0.5, radiusY: 0.5 });
  next = changePictureGradientKind(next, "rectangular");
  expect(next.stops).toEqual(value.stops);
  expect(changePictureGradientKind(next, "linear")).toEqual(value);
});
test("minimum/maximum stops, stale indices and invalid parameters fail without mutation", () => {
  let gradient = createPictureGradientPaint();
  expect(() => removePictureGradientStop(gradient, 0)).toThrow();
  expect(() => editPictureGradientStop(gradient, -1, { offset: 0 })).toThrow();
  expect(() => editPictureGradientStop(gradient, 0, { brightness: 2 })).toThrow();
  for (let n = 2; n < 16; n++) gradient = addPictureGradientStop(gradient).gradient;
  const before = structuredClone(gradient);
  expect(() => addPictureGradientStop(gradient)).toThrow();
  expect(gradient).toEqual(before);
});
test("theme palette's second argument remains a real color identity", () => {
  expect(picturePaintColorFromSelection("#010203", { slot: "accent2", tint: 0.2 })).toEqual({
    kind: "theme",
    reference: { slot: "accent2", tint: 0.2 },
  });
  expect(picturePaintColorFromSelection("#abcdef")).toEqual({ kind: "rgb", rgb: "#ABCDEF" });
  expect(picturePaintColorFromSelection(null)).toEqual({ kind: "automatic" });
});
test("four stretch offsets are true source placement, not crop or whole-picture changes", () => {
  const paint = {
    kind: "picture" as const,
    assetId: "test",
    opacity: 0.7,
    rotateWithShape: false,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0.1,
      offsetYRatio: 0.2,
      widthRatio: 0.7,
      heightRatio: 0.5,
    },
  };
  expect(getPictureStretchOffsets(paint.layout)).toMatchObject({ left: 10, top: 20 });
  expect(getPictureStretchOffsets(paint.layout).right).toBeCloseTo(20);
  expect(getPictureStretchOffsets(paint.layout).bottom).toBeCloseTo(30);
  const changed = editPictureStretchOffset(paint, "right", 40);
  expect(changed.layout).toMatchObject({
    offsetXRatio: 0.1,
    offsetYRatio: 0.2,
    widthRatio: 0.5,
    heightRatio: 0.5,
  });
  expect(changed.opacity).toBe(0.7);
  expect(() => editPictureStretchOffset(paint, "left", 90)).toThrow();
  expect(paint.layout.widthRatio).toBe(0.7);
});
test("all independent effect defaults and projections pass the real strict contract", () => {
  expect(
    normalizeDetailedPictureStyle({
      line: { kind: "value", value: createPictureLine() },
      shadow: { kind: "value", value: createPictureShadow() },
      reflection: { kind: "value", value: createPictureReflection() },
      glow: { kind: "value", value: createPictureGlow() },
      softEdges: { kind: "value", value: createPictureSoftEdges() },
      format3d: { kind: "value", value: createPictureFormat3d() },
      rotation3d: { kind: "value", value: createPictureRotation3d() },
    }),
  ).toBeDefined();
  for (const kind of ["outer", "inner", "perspective"] as const) {
    const shadow = createPictureShadow(kind);
    expect(
      normalizeDetailedPictureStyle({ shadow: { kind: "value", value: shadow } })?.shadow,
    ).toEqual({ kind: "value", value: shadow });
  }
  for (const kind of ["parallel", "perspective", "oblique"] as const) {
    const rotation = createPictureRotation3d(kind);
    expect(
      normalizeDetailedPictureStyle({ rotation3d: { kind: "value", value: rotation } })?.rotation3d,
    ).toEqual({ kind: "value", value: rotation });
  }
});
test("changing shadow/projection kind removes branch-only parameters but preserves real common values", () => {
  const perspective = createPictureShadow("perspective");
  const inner = createPictureShadow("inner", {
    ...perspective,
    blurPt: 12,
    color: { kind: "rgb", rgb: "#123456" },
  });
  expect(inner).not.toHaveProperty("skewXDeg");
  expect(inner).toMatchObject({ blurPt: 12, color: { kind: "rgb", rgb: "#123456" } });
  const rotation = createPictureRotation3d("oblique", { ...createPictureRotation3d(), xDeg: 37 });
  expect(createPictureRotation3d("parallel", rotation)).toEqual({
    projection: "parallel",
    xDeg: 37,
    yDeg: 0,
    zDeg: 0,
    distanceFromGroundPt: 0,
  });
});
