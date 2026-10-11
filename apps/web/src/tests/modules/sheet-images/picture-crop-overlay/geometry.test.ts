import { describe, expect, test } from "vitest";
import {
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
} from "@sheetcraft/core/picture-frame";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  getPictureCropCanvasSize,
  getPictureCropHandlePoint,
  getPictureCropViewportFragments,
  preparePictureCropPreview,
} from "../../../../modules/sheet-images/picture-crop-preview";
import { isPictureHandleOwnedByPane } from "../../../../modules/sheet-images/picture-selection-handle";
import { fixture } from "./fixture";

describe("full-source crop preview geometry", () => {
  test.each([0, 37, 90, 173, 270])("keeps all four source world corners at %s degrees", (angle) => {
    const f = fixture();
    f.picture.frame.angleDeg = angle;
    const before = structuredClone(f.picture);
    const original = f.resolved();
    const preview = preparePictureCropPreview(f.picture, original);
    const source = original.sourceRect!;
    const sourcePoints = [
      { x: source.x, y: source.y },
      { x: source.x + source.width, y: source.y },
      { x: source.x + source.width, y: source.y + source.height },
      { x: source.x, y: source.y + source.height },
    ];
    for (let index = 0; index < 4; index++) {
      const expected = pictureFrameLocalToWorld(original.rect, original.angleDeg, {
        x: sourcePoints[index]!.x - original.rect.x,
        y: sourcePoints[index]!.y - original.rect.y,
      });
      expect(preview.ghostGeometry.corners[index]!.x).toBeCloseTo(expected.x, 10);
      expect(preview.ghostGeometry.corners[index]!.y).toBeCloseTo(expected.y, 10);
    }
    expect(preview.ghostGeometry.angleDeg).toBe(angle);
    expect(preview.ghostPicture.assetId).toBe(f.picture.assetId);
    expect(preview.ghostPicture.frame.source).toEqual({
      widthRatio: 1,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    expect(f.picture).toEqual(before);
  });

  test("genuine grouped leaf retains parent-local frame and source metadata", () => {
    const f = fixture();
    const member: GroupedPicture = {
      kind: "grouped-picture-v1",
      id: "owned-source",
      assetId: "actual-source",
      altText: "Grouped source",
      frame: {
        kind: "group-member-frame-v1",
        rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.4, heightRatio: 0.7 },
        angleDeg: 12,
        source: { ...f.picture.frame.source },
        flipHorizontal: true,
        flipVertical: true,
      },
    };
    const preview = preparePictureCropPreview(member, f.resolved());
    expect(preview.ghostPicture).toMatchObject({
      kind: "grouped-picture-v1",
      assetId: "actual-source",
      frame: { rect: member.frame.rect, angleDeg: 12, flipHorizontal: true, flipVertical: true },
    });
    expect(preview.ghostPicture.frame).not.toHaveProperty("anchor");
    expect(preview.ghostGeometry.angleDeg).toBe(37);
  });

  test.each([0.5, 2])("handles signed padding with source ratio %s", (ratio) => {
    const f = fixture();
    f.picture.frame.source = {
      widthRatio: ratio,
      heightRatio: ratio,
      offsetXRatio: -2,
      offsetYRatio: 3,
    };
    const preview = preparePictureCropPreview(f.picture, f.resolved());
    expect(preview.ghostGeometry.rect.width).toBe(160 * ratio);
    expect(preview.ghostGeometry.rect.height).toBe(100 * ratio);
    expect(preview.ghostGeometry.sourceRect).toEqual(preview.ghostGeometry.rect);
  });

  test("rejects stale or invalid geometry and content before painting resources", () => {
    const f = fixture();
    const stale = f.resolved();
    stale.corners[0].x++;
    expect(() => preparePictureCropPreview(f.picture, stale)).toThrow("canonical");
    const absentSource = { ...f.resolved(), sourceRect: null };
    expect(() => preparePictureCropPreview(f.picture, absentSource)).toThrow("source geometry");
    f.picture.transform = { appearance: { reflection: true } };
    expect(() => preparePictureCropPreview(f.picture, f.resolved())).toThrow("reflection");
    delete f.picture.transform;
    f.picture.frame.source.widthRatio = 0;
    expect(() => preparePictureCropPreview(f.picture, stale)).toThrow("positive");
  });

  test("refuses group containers and collapsed frames", () => {
    const f = fixture();
    const geometry = resolvePictureSourceLayout(
      { x: 0, y: 0, width: 0, height: 10 },
      0,
      f.picture.frame.source,
    );
    expect(() => preparePictureCropPreview(f.picture, geometry)).toThrow("collapsed");
    const invalid = { kind: "picture-group-v1", id: "container", members: [] };
    expect(() =>
      preparePictureCropPreview(invalid as unknown as typeof f.picture, f.resolved()),
    ).toThrow("source-bearing");
  });

  test("pixel allocation is bounded by viewport, zoom and actual DPR", () => {
    expect(getPictureCropCanvasSize({ width: 500, height: 400 }, 2, 0.75)).toEqual({
      width: 750,
      height: 600,
      scaleX: 1.5,
      scaleY: 1.5,
    });
    expect(getPictureCropCanvasSize({ width: 500, height: 400 }, 4, 2)).toEqual({
      width: 1000,
      height: 800,
      scaleX: 2,
      scaleY: 2,
    });
    const bigViewport = getPictureCropCanvasSize({ width: 20_000, height: 20_000 }, 2);
    expect(bigViewport.width).toBeLessThanOrEqual(8192);
    expect(bigViewport.width * bigViewport.height).toBeLessThanOrEqual(16_777_216);
    expect(() => getPictureCropCanvasSize({ width: Infinity, height: 400 }, 2)).toThrow();
  });
});

describe("crop controls in frozen panes", () => {
  const directions: FloatingImageResizeDirection[] = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];
  test("four projected fragments own every exact seam handle once", () => {
    const f = fixture(true);
    f.picture.frame.angleDeg = 0;
    f.picture.frame.anchor = {
      mode: "fixed",
      x: f.layout.frozenSize.width / 2,
      y: f.layout.frozenSize.height / 2,
      size: { width: f.layout.frozenSize.width, height: f.layout.frozenSize.height },
    };
    const fragments = getPictureCropViewportFragments(
      preparePictureCropPreview(f.picture, f.resolved()),
      f.layout,
    );
    expect(fragments.map((fragment) => fragment.paneId)).toEqual([
      "topLeft",
      "top",
      "left",
      "body",
    ]);
    for (const direction of directions) {
      const owners = fragments.filter((fragment) =>
        isPictureHandleOwnedByPane(
          fragment,
          f.layout,
          getPictureCropHandlePoint(fragment.geometry, direction),
        ),
      );
      expect(owners, direction).toHaveLength(1);
    }
  });

  test("rotation and scroll keep clipping pane-local with no duplicated directions", () => {
    const f = fixture(true, { x: 13, y: 7 });
    f.picture.frame.anchor = { mode: "fixed", x: 40, y: 32, size: { width: 100, height: 50 } };
    const preview = preparePictureCropPreview(f.picture, f.resolved());
    const fragments = getPictureCropViewportFragments(preview, f.layout);
    expect(fragments).toHaveLength(4);
    for (const fragment of fragments) {
      const clip = f.layout.panes[fragment.paneId].clip;
      expect(fragment.clippedBounds.x).toBeGreaterThanOrEqual(clip.x);
      expect(fragment.clippedBounds.y).toBeGreaterThanOrEqual(clip.y);
      expect(fragment.clippedBounds.x + fragment.clippedBounds.width).toBeLessThanOrEqual(
        clip.x + clip.width,
      );
      expect(fragment.clippedBounds.y + fragment.clippedBounds.height).toBeLessThanOrEqual(
        clip.y + clip.height,
      );
    }
    for (const direction of directions) {
      const owners = fragments.filter((fragment) =>
        isPictureHandleOwnedByPane(
          fragment,
          f.layout,
          getPictureCropHandlePoint(fragment.geometry, direction),
        ),
      );
      // Scrolling can hide a handle in the sheet-space interval between frozen
      // and body panes. Visible controls must never be duplicated across panes.
      expect(owners.length, direction).toBeLessThanOrEqual(1);
    }
    f.picture.hidden = true;
    expect(
      getPictureCropViewportFragments(preparePictureCropPreview(f.picture, f.resolved()), f.layout),
    ).toEqual([]);
  });
});

test("crop ghost removes every decoration while retaining source corrections and the stored appearance", () => {
  const f = fixture();
  f.picture.transform = {
    appearance: {
      brightness: 1.2,
      opacity: 0.6,
      shadow: "soft",
      reflection: true,
      border: { color: "#FF0000", width: 2 },
      detailedStyle: {
        reflection: { kind: "none" },
        fill: { kind: "none" },
        rotation3d: {
          kind: "value",
          value: { projection: "parallel", xDeg: 37, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
        },
      },
    },
  };
  const before = structuredClone(f.picture);
  const preview = preparePictureCropPreview(f.picture, f.resolved());
  expect(preview.ghostPicture.transform?.appearance).toEqual({ brightness: 1.2, opacity: 0.6 });
  expect(preview.picture.transform?.appearance).toEqual(before.transform?.appearance);
  expect(f.picture).toEqual(before);
});
