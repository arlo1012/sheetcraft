import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  movePictureGroupBy,
  resizePictureGroupBy,
  resizePictureGroupTo,
  rotatePictureGroupBy,
  rotatePictureGroupTo,
} from "../../picture-group-geometry.js";
import { group, metrics, anchorModes, directions, rotateVector, firstLeaf } from "./fixture.js";

describe("source-free root group edit planning", () => {
  test.each(anchorModes)("moves %s root without rewriting any normalized child fields", (mode) => {
    const original = group(mode),
      before = structuredClone(original);
    const next = movePictureGroupBy(original, { x: 42, y: -20 }, metrics)!;
    expect(resolvePictureGroup(next, metrics).layout.rect).toEqual({
      x: 142,
      y: 80,
      width: 516,
      height: 224,
    });
    expect(next.frame.anchor.mode).toBe(mode);
    expect(next.frame.angleDeg).toBe(37);
    expect(next.members).toEqual(before.members);
    expect(next.members).not.toBe(original.members);
    firstLeaf(next).frame.source.offsetXRatio = 0.7;
    firstLeaf(next).transform!.annotations![0]!.points[0]!.x = 0.9;
    expect(original).toEqual(before);
  });

  test.each([0, 37, 90].flatMap((angle) => directions.map((direction) => ({ angle, direction }))))(
    "$angle-degree $direction resize fixes the rotated opposite edge/corner",
    ({ angle, direction }) => {
      const original = group("fixed", angle),
        before = structuredClone(original);
      const horizontal = direction === "e" || direction === "w",
        vertical = direction === "n" || direction === "s";
      const west = direction.includes("w"),
        north = direction.includes("n");
      const next = resizePictureGroupBy(
        original,
        direction,
        rotateVector(vertical ? 0 : west ? -72 : 72, horizontal ? 0 : north ? -24 : 24, angle),
        metrics,
      )!;
      const old = resolvePictureGroup(original, metrics).layout.rect,
        rect = resolvePictureGroup(next, metrics).layout.rect;
      expect(rect.width).toBeCloseTo(vertical ? 516 : 588, 8);
      expect(rect.height).toBeCloseTo(horizontal ? 224 : 248, 8);
      const fixed = (value: typeof rect) =>
        pictureFrameLocalToWorld(value, angle, {
          x: vertical ? value.width / 2 : west ? value.width : 0,
          y: horizontal ? value.height / 2 : north ? value.height : 0,
        });
      expect(fixed(rect).x).toBeCloseTo(fixed(old).x, 8);
      expect(fixed(rect).y).toBeCloseTo(fixed(old).y, 8);
      expect(next.members).toEqual(before.members);
      expect(original).toEqual(before);
    },
  );

  test("F-like horizontal stretch scales unrotated child layout before its 37-degree rotation", () => {
    const original = group("fixed", 0),
      next = resizePictureGroupBy(original, "e", { x: 154.8, y: 0 }, metrics)!;
    const resolved = resolvePictureGroup(next, metrics);
    expect(resolved.layout.rect.width).toBeCloseTo(670.8);
    const a = resolved.members[0]!.layout!,
      b = resolved.members[1]!.layout!;
    expect(a.rect.x).toBeCloseTo(100);
    expect(a.rect.y).toBeCloseTo(100);
    expect(a.rect.width).toBeCloseTo(280.8);
    expect(a.rect.height).toBeCloseTo(144);
    expect(b.rect.x).toBeCloseTo(490);
    expect(b.rect.y).toBeCloseTo(180);
    expect(b.rect.width).toBeCloseTo(280.8);
    expect(b.rect.height).toBeCloseTo(144);
    expect(a.angleDeg).toBe(37);
    expect(b.angleDeg).toBe(0);
    const top = { x: a.corners[1]!.x - a.corners[0]!.x, y: a.corners[1]!.y - a.corners[0]!.y };
    const side = { x: a.corners[2]!.x - a.corners[1]!.x, y: a.corners[2]!.y - a.corners[1]!.y };
    expect(top.x * side.x + top.y * side.y).toBeCloseTo(0, 8);
    expect(next.members).toEqual(original.members);
  });

  test("corner lock is opt-in and sides stay independent even when locked", () => {
    const original = group("fixed", 0);
    expect(
      resolvePictureGroup(
        resizePictureGroupBy(original, "se", { x: 103.2, y: 22.4 }, metrics)!,
        metrics,
      ).layout.rect,
    ).toEqual({ x: 100, y: 100, width: 619.2, height: 246.4 });
    original.lockAspectRatio = true;
    const corner = resizePictureGroupBy(original, "se", { x: 103.2, y: 22.4 }, metrics)!;
    expect(resolvePictureGroup(corner, metrics).layout.rect.height).toBeCloseTo(268.8);
    expect(corner.lockAspectRatio).toBe(true);
    const side = resizePictureGroupBy(original, "e", { x: 103.2, y: 100 }, metrics)!;
    expect(resolvePictureGroup(side, metrics).layout.rect.height).toBe(224);
    const override = resizePictureGroupBy(original, "se", { x: 103.2, y: 22.4 }, metrics, {
      preserveCornerRatio: false,
    })!;
    expect(resolvePictureGroup(override, metrics).layout.rect.height).toBeCloseTo(246.4);
    expect(override.lockAspectRatio).toBe(true);
  });

  test.each(
    anchorModes.flatMap((mode) =>
      ["width", "height"].map((axis) => ({ mode, axis: axis as "width" | "height" })),
    ),
  )("numeric $axis keeps rotated local NW under $mode", ({ mode, axis }) => {
    const original = group(mode),
      before = structuredClone(original);
    const rect = resolvePictureGroup(original, metrics).layout.rect;
    const next = resizePictureGroupTo(original, { axis, value: rect[axis] * 1.2 }, metrics)!;
    const layout = resolvePictureGroup(next, metrics).layout;
    expect(layout.rect[axis]).toBeCloseTo(rect[axis] * 1.2);
    expect(layout.rect[axis === "width" ? "height" : "width"]).toBe(
      rect[axis === "width" ? "height" : "width"],
    );
    expect(layout.corners[0]!.x).toBeCloseTo(
      resolvePictureGroup(original, metrics).layout.corners[0]!.x,
      8,
    );
    expect(layout.corners[0]!.y).toBeCloseTo(
      resolvePictureGroup(original, metrics).layout.corners[0]!.y,
      8,
    );
    expect(next.members).toEqual(before.members);
    expect(next.frame.anchor.mode).toBe(mode);
    expect(original).toEqual(before);
  });

  test("numeric locked size scales the current root ratio, never a source/leaf ratio", () => {
    const original = group();
    original.lockAspectRatio = true;
    const next = resizePictureGroupTo(original, { axis: "width", value: 619.2 }, metrics)!;
    expect(resolvePictureGroup(next, metrics).layout.rect.height).toBeCloseTo(268.8);
    expect(next.members).toEqual(original.members);
  });

  test("rotation preserves root anchor/layout and composes relative angles around the root center", () => {
    const original = group("move-only", 0),
      before = structuredClone(original);
    const next = rotatePictureGroupBy(original, 37, metrics)!;
    const old = resolvePictureGroup(original, metrics),
      resolved = resolvePictureGroup(next, metrics);
    expect(resolved.layout.rect).toEqual(old.layout.rect);
    expect(next.frame.anchor).toEqual(before.frame.anchor);
    expect(resolved.members.map((member) => member.layout!.angleDeg)).toEqual([74, 37]);
    for (const [index, child] of old.members.entries()) {
      const center = {
        x: child.layout!.rect.x + child.layout!.rect.width / 2,
        y: child.layout!.rect.y + child.layout!.rect.height / 2,
      };
      const expected = pictureFrameLocalToWorld(old.layout.rect, 37, {
        x: center.x - old.layout.rect.x,
        y: center.y - old.layout.rect.y,
      });
      const after = resolved.members[index]!.layout!.rect;
      expect(after.x + after.width / 2).toBeCloseTo(expected.x, 8);
      expect(after.y + after.height / 2).toBeCloseTo(expected.y, 8);
    }
    expect(rotatePictureGroupTo(original, -323, metrics)).toEqual(next);
    expect(rotatePictureGroupBy(original, 1e20, metrics)!.frame.angleDeg).toBe(280);
    expect(next.members).toEqual(before.members);
    expect(original).toEqual(before);
    expect(Object.keys(next.frame).sort()).toEqual(["anchor", "angleDeg", "kind"]);
    expect("assetId" in next).toBe(false);
    expect("source" in next.frame).toBe(false);
  });

  test("ratio-locked minimum uses the framed planner's reciprocal rounding repair", () => {
    const original = group("fixed", 0);
    original.lockAspectRatio = true;
    original.frame.anchor = { mode: "fixed", x: 100, y: 100, size: { width: 360, height: 49 } };
    const next = resizePictureGroupBy(original, "se", { x: -1000, y: -1000 }, metrics)!;
    const rect = resolvePictureGroup(next, metrics).layout.rect;
    expect(rect.height).toBe(1);
    expect(rect.width / rect.height).toBeCloseTo(360 / 49, 12);
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(100);
    const numeric = resizePictureGroupTo(original, { axis: "height", value: 1 }, metrics)!;
    expect(resolvePictureGroup(numeric, metrics).layout.rect).toEqual(rect);
  });

  test("row/column-derived oversized roots shrink gradually without changing ownership", () => {
    const original = group("move-and-size", 0);
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 200, offset: 0 }, row: { index: 600, offset: 0 } },
    };
    const old = resolvePictureGroup(original, metrics).layout.rect;
    const next = resizePictureGroupBy(original, "e", { x: -10, y: 0 }, metrics)!;
    expect(resolvePictureGroup(next, metrics).layout.rect).toEqual({
      ...old,
      width: old.width - 10,
    });
    expect(next.members).toEqual(original.members);
    const moved = movePictureGroupBy(original, { x: 10, y: 5 }, metrics)!;
    expect(resolvePictureGroup(moved, metrics).layout.rect).toEqual({ ...old, x: 10, y: 5 });
  });

  test("group manual shrinking allows subpixel descendants without individual clamping", () => {
    const original = group("fixed", 0);
    const next = resizePictureGroupTo(original, { axis: "width", value: 1 }, metrics)!;
    expect(resolvePictureGroup(next, metrics).members[0]!.layout!.rect.width).toBeCloseTo(
      216 / 516,
    );
    expect(next.members).toEqual(original.members);
  });
});
