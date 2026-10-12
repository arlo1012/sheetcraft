// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorPictureFrameRect,
  resolvePictureFrame,
  type PictureFrameAnchor,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import {
  findPictureGroupNode,
  isPictureGroup,
  type GroupedPicture,
  type PictureGroup,
} from "@sheetcraft/core/picture-group";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type PictureObjectAppearance,
} from "@sheetcraft/core/picture-object";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { restoreFloatingImage } from "@sheetcraft/sheet-engine/floating-image-transform";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { planPictureOriginalReset } from "../../../modules/sheet-images/picture-original-reset";
import { resolveOwnedPictureNode } from "../../../modules/sheet-images/picture-group-interaction";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

const fullSource = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
const original = { assetId: "asset", width: 360, height: 240 };
const leafPath = ["owned-group", "nested-owner", "owned-leaf"];
const modes: PictureFrameAnchor["mode"][] = ["fixed", "move-only", "move-and-size"];

function view(): PictureFrameLayoutContext {
  const sheet = createSheet("Synthetic", "s"),
    geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 }),
    rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  return {
    metrics: createPictureSheetMetrics(sheet),
    layout: createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 800, height: 600 },
    }),
  };
}

function presentation(): PictureObjectAppearance {
  return {
    appearance: {
      opacity: 0.6,
      brightness: 0.7,
      border: { color: "#123456", width: 2 },
      shadow: "hard",
      suppressThemeEffects: { bevel: true },
      detailedStyle: {
        fill: { kind: "none" },
        reflection: { kind: "value", value: { size: 0.6, opacity: 0.4, blurPt: 3, distancePt: 8 } },
        glow: {
          kind: "value",
          value: { color: { kind: "rgb", rgb: "#ABCDEF" }, opacity: 0.7, sizePt: 9 },
        },
        rotation3d: {
          kind: "value",
          value: {
            projection: "perspective",
            xDeg: 12,
            yDeg: 20,
            zDeg: 30,
            perspectiveDeg: 45,
            distanceFromGroundPt: -3,
          },
        },
      },
    },
    annotations: [{ kind: "pen", color: "#FF0000", width: 0.02, points: [{ x: 0.1, y: 0.2 }] }],
  };
}

function legacy(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "asset",
    altText: "Description",
    altTitle: "Title",
    groupId: "old-flat-group",
    lockAspectRatio: false,
    locked: false,
    printObject: false,
    anchor: { row: 8, column: 5 },
    offsetX: 12,
    offsetY: 18,
    width: 120,
    height: 80,
    transform: {
      ...presentation(),
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      rotation: 90,
      flipHorizontal: true,
      flipVertical: true,
    },
  };
}

function framed(mode: PictureFrameAnchor["mode"], context: PictureFrameLayoutContext) {
  const picture = framedPicture();
  picture.frame.anchor = anchorPictureFrameRect(
    mode,
    { x: 194, y: 174, width: 120, height: 80 },
    context.metrics,
  );
  picture.frame.source = { widthRatio: 3, heightRatio: 2, offsetXRatio: 0.3, offsetYRatio: -0.2 };
  picture.frame.flipHorizontal = true;
  picture.frame.flipVertical = true;
  picture.frame.cropShape = { preset: "ellipse" };
  picture.transform = presentation();
  picture.groupId = "old-flat-group";
  picture.altTitle = "Title";
  picture.lockAspectRatio = false;
  picture.locked = false;
  picture.printObject = false;
  return picture;
}

function nested(
  mode: PictureFrameAnchor["mode"],
  context: PictureFrameLayoutContext,
): PictureGroup {
  const root = pictureGroup(),
    leaf = root.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw Error("Expected source leaf");
  root.frame.anchor = anchorPictureFrameRect(
    mode,
    { x: 194, y: 174, width: 240, height: 160 },
    context.metrics,
  );
  root.locked = true;
  root.printObject = false;
  leaf.assetId = original.assetId;
  leaf.altTitle = "Leaf title";
  leaf.locked = false;
  leaf.printObject = false;
  leaf.lockAspectRatio = false;
  leaf.transform = presentation();
  leaf.frame.source = { widthRatio: 3, heightRatio: 2, offsetXRatio: -0.3, offsetYRatio: 0.2 };
  leaf.frame.flipHorizontal = true;
  leaf.frame.flipVertical = true;
  leaf.frame.cropShape = { preset: "ellipse" };
  const hidden = { ...structuredClone(leaf), id: "hidden-sibling", hidden: true };
  root.members = [
    {
      kind: "grouped-group-v1",
      id: "nested-owner",
      altText: "Nested owner",
      altTitle: "Owner title",
      lockAspectRatio: false,
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: -0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.4 },
        angleDeg: 18,
      },
      members: [leaf, hidden],
    },
    { ...structuredClone(hidden), id: "hidden-root-member" },
  ];
  return root;
}

function center(rect: PictureFrameRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function expectCenter(left: PictureFrameRect, right: PictureFrameRect) {
  expect(center(left).x).toBeCloseTo(center(right).x, 10);
  expect(center(left).y).toBeCloseTo(center(right).y, 10);
}

function leaf(root: PictureGroup): GroupedPicture {
  const target = findPictureGroupNode(root, leafPath)?.node;
  if (target?.kind !== "grouped-picture-v1") throw Error("Expected exact nested leaf");
  return target;
}

describe("Sheetcraft combined Restore Original planner", () => {
  test("legacy reset keeps exact existing restore semantics, presentation and all metadata", () => {
    const context = view(),
      target = legacy(),
      hidden = { ...legacy(), id: "unrelated", hidden: true },
      roots = [target, hidden],
      before = structuredClone(roots);
    const next = planPictureOriginalReset(roots, [target.id], original, context);
    expect(next).toEqual([restoreFloatingImage(target, context.layout, original), hidden]);
    const restored = next[0]!;
    if (isPictureGroup(restored) || isFramedPictureObject(restored)) throw Error("Expected legacy");
    expect(restored.transform).toEqual(presentation());
    expectCenter(
      getFloatingImageSheetRect(restored, context.layout)!,
      getFloatingImageSheetRect(target, context.layout)!,
    );
    expect([restored.width, restored.height]).toEqual([360, 240]);
    expect(roots).toEqual(before);
    expect(next[1]).not.toBe(hidden);
  });

  test.each(modes)(
    "framed reset retains %s anchor mode and center, clearing only source geometry",
    (mode) => {
      const context = view(),
        target = framed(mode, context),
        roots = [target],
        before = structuredClone(roots),
        old = resolvePictureFrame(target.frame, context.metrics);
      const next = planPictureOriginalReset(roots, [target.id], original, context),
        restored = next[0]!;
      if (!isFramedPictureObject(restored)) throw Error("Expected framed");
      const world = resolvePictureFrame(restored.frame, context.metrics);
      expectCenter(world.rect, old.rect);
      expect(world.rect.width).toBeCloseTo(360, 10);
      expect(world.rect.height).toBeCloseTo(240, 10);
      expect(restored.frame).toMatchObject({ anchor: { mode }, source: fullSource, angleDeg: 0 });
      expect(restored.frame).not.toHaveProperty("flipHorizontal");
      expect(restored.frame).not.toHaveProperty("flipVertical");
      expect(restored.frame).not.toHaveProperty("cropShape");
      const { frame: _oldFrame, ...metadata } = target;
      const { frame: _nextFrame, ...retained } = restored;
      expect(retained).toEqual(metadata);
      expect(restored.transform).toEqual(presentation());
      expect(roots).toEqual(before);
      restored.transform!.annotations![0]!.points[0]!.x = 0.9;
      expect(roots).toEqual(before);
    },
  );

  test.each(modes)(
    "nested leaf reset preserves %s root anchor, ancestors, hidden siblings and identity",
    (mode) => {
      const context = view(),
        root = nested(mode, context),
        unrelated = { ...framedPicture(), id: "unrelated", hidden: true },
        roots = [unrelated, root],
        before = structuredClone(roots),
        old = resolveOwnedPictureNode(roots, leafPath, context)!.layout!;
      const next = planPictureOriginalReset(roots, leafPath, original, context),
        restoredRoot = next[1]!;
      if (!isPictureGroup(restoredRoot)) throw Error("Expected retained root owner");
      const world = resolveOwnedPictureNode(next, leafPath, context)!.layout!,
        restored = leaf(restoredRoot),
        previous = leaf(root);
      expectCenter(world.rect, old.rect);
      expect(world.rect.width).toBeCloseTo(360, 10);
      expect(world.rect.height).toBeCloseTo(240, 10);
      expect(world.angleDeg).toBe(0);
      expect(restored.frame.source).toEqual(fullSource);
      expect(restored.frame).not.toHaveProperty("flipHorizontal");
      expect(restored.frame).not.toHaveProperty("flipVertical");
      expect(restored.frame).not.toHaveProperty("cropShape");
      expect(restoredRoot.frame).toEqual(root.frame);
      expect(restoredRoot.members.map((member) => member.id)).toEqual(
        root.members.map((member) => member.id),
      );
      const owner = restoredRoot.members[0]!,
        previousOwner = root.members[0]!;
      if (owner.kind !== "grouped-group-v1" || previousOwner.kind !== "grouped-group-v1")
        throw Error("Expected retained nested owner");
      expect(owner.frame).toEqual(previousOwner.frame);
      expect(owner.members[1]).toEqual(previousOwner.members[1]);
      expect(restoredRoot.members[1]).toEqual(root.members[1]);
      expect(next[0]).toEqual(unrelated);
      const { frame: _oldFrame, ...metadata } = previous;
      const { frame: _nextFrame, ...retained } = restored;
      expect(retained).toEqual(metadata);
      expect(roots).toEqual(before);
      expect(restored).not.toBe(previous);
      expect(owner.members[1]).not.toBe(previousOwner.members[1]);
    },
  );

  test.each([
    [20000, 10000, 10000, 5000],
    [0.25, 0.5, 1, 2],
    [20000, 0.25, 10000, 1],
  ])(
    "framed/owned fitting matches legacy MIN/MAX contract for %s × %s",
    (width, height, fittedWidth, fittedHeight) => {
      const context = view(),
        source = { ...original, width, height },
        old = legacy(),
        frame = framed("fixed", context),
        group = nested("fixed", context);
      const expected = restoreFloatingImage(old, context.layout, source)!;
      const restoredFrame = planPictureOriginalReset([frame], [frame.id], source, context)[0]!;
      if (!isFramedPictureObject(restoredFrame)) throw Error("Expected framed");
      const rect = resolvePictureFrame(restoredFrame.frame, context.metrics).rect;
      expect([rect.width, rect.height]).toEqual([expected.width, expected.height]);
      expect([rect.width, rect.height]).toEqual([fittedWidth, fittedHeight]);
      const restoredGroup = planPictureOriginalReset([group], leafPath, source, context);
      const groupedRect = resolveOwnedPictureNode(restoredGroup, leafPath, context)!.layout!.rect;
      expect(groupedRect.width).toBeCloseTo(expected.width, 10);
      expect(groupedRect.height).toBeCloseTo(expected.height, 10);
    },
  );

  test("already-original framed/owned targets remain value-identical and detached with unrelated hidden roots", () => {
    const context = view(),
      frame = framedPicture(),
      group = nested("move-and-size", context);
    frame.frame.angleDeg = 0;
    const target = leaf(group);
    target.frame.angleDeg = 305;
    target.frame.source = { ...fullSource };
    delete target.frame.flipHorizontal;
    delete target.frame.flipVertical;
    delete target.frame.cropShape;
    const hidden = { ...legacy(), id: "hidden", hidden: true },
      roots = normalizePictureObjectCollection([hidden, group, frame]),
      before = structuredClone(roots);
    const frameReset = planPictureOriginalReset(
      roots,
      [frame.id],
      { ...original, width: 120, height: 80 },
      context,
    );
    expect(frameReset).toEqual(before);
    const rect = resolveOwnedPictureNode(roots, leafPath, context)!.layout!.rect;
    const groupReset = planPictureOriginalReset(
      roots,
      leafPath,
      { ...original, width: rect.width, height: rect.height },
      context,
    );
    expect(groupReset).toEqual(before);
    expect(groupReset).not.toBe(roots);
    expect(groupReset[0]).not.toBe(roots[0]);
    expect(roots).toEqual(before);
  });

  test("refuses changed source IDs for legacy, framed and exact owned leaves atomically", () => {
    const context = view(),
      targets = [legacy(), framed("fixed", context), nested("fixed", context)],
      before = structuredClone(targets);
    for (const path of [["legacy"], ["framed"], leafPath])
      expect(() =>
        planPictureOriginalReset(targets, path, { ...original, assetId: "changed" }, context),
      ).toThrow(/source asset changed/);
    expect(targets).toEqual(before);
  });

  test("refuses absent, missing, incomplete or container paths without touching the forest", () => {
    const context = view(),
      roots = [legacy(), framed("fixed", context), nested("fixed", context)],
      before = structuredClone(roots);
    for (const path of [
      [],
      ["missing"],
      ["owned-group"],
      ["owned-group", "nested-owner"],
      ["owned-group", "owned-leaf"],
      ["owned-group", "nested-owner", "missing"],
      ["framed", "owned-leaf"],
    ])
      expect(() => planPictureOriginalReset(roots, path, original, context)).toThrow();
    expect(() =>
      planPictureOriginalReset(
        roots,
        ["framed"],
        original,
        undefined as unknown as PictureFrameLayoutContext,
      ),
    ).toThrow(/geometry/);
    expect(roots).toEqual(before);
  });

  test.each([0, -1, NaN, Infinity, -Infinity])(
    "refuses invalid intrinsic dimension %s on either axis",
    (size) => {
      const context = view(),
        roots = [framed("fixed", context)],
        before = structuredClone(roots);
      for (const source of [
        { ...original, width: size },
        { ...original, height: size },
      ])
        expect(() => planPictureOriginalReset(roots, ["framed"], source, context)).toThrow(
          /finite and positive/,
        );
      expect(roots).toEqual(before);
    },
  );

  test("refuses unavailable or incomplete original source instead of inferring cropped dimensions", () => {
    const context = view(),
      roots = [legacy()],
      before = structuredClone(roots);
    for (const source of [
      undefined,
      null,
      {},
      { width: 360, height: 240 },
      { assetId: "asset", width: 360 },
    ])
      expect(() =>
        planPictureOriginalReset(roots, ["legacy"], source as unknown as typeof original, context),
      ).toThrow();
    expect(roots).toEqual(before);
  });

  test("refuses collapsed framed roots/owned ancestors and hidden targets while retaining unrelated collapse", () => {
    const context = view(),
      sheet = createSheet("Collapsed", "collapsed");
    sheet.hiddenColumns!.add(0);
    sheet.hiddenRows!.add(0);
    context.metrics = createPictureSheetMetrics(sheet);
    const anchor: PictureFrameAnchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const frame = framedPicture(),
      group = nested("fixed", context),
      hidden = { ...legacy(), hidden: true };
    frame.frame.anchor = anchor;
    group.frame.anchor = structuredClone(anchor);
    const roots = [frame, group, hidden],
      before = structuredClone(roots);
    for (const path of [[frame.id], leafPath, [hidden.id]])
      expect(() => planPictureOriginalReset(roots, path, original, context)).toThrow();
    const visible = framed("fixed", context);
    visible.id = "visible";
    const next = planPictureOriginalReset([...roots, visible], [visible.id], original, context);
    expect(next.slice(0, 3)).toEqual(normalizePictureObjectCollection(before));
    expect(roots).toEqual(before);
    const hiddenOwner = nested("fixed", context);
    hiddenOwner.members[0]!.hidden = true;
    expect(() => planPictureOriginalReset([hiddenOwner], leafPath, original, context)).toThrow();
  });
});
