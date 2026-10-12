// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createSheet,
  type FloatingImage,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorPictureFrameRect, type PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  planEqualPictureDimensions,
  type EqualPictureDimensionsAction,
} from "../../../modules/sheet-images/picture-equal-dimensions";
import { getPictureViewRect } from "../../../modules/sheet-images/picture-view-operations";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";

function view() {
  const sheet = createSheet("Synthetic", "s");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 800, height: 600 },
  });
  return { layout, metrics: createPictureSheetMetrics(sheet) };
}

function legacy(id = "legacy", width = 288, height = 96): LegacyFloatingImage {
  return {
    id,
    assetId: `source-${id}`,
    altText: id,
    anchor: { row: 0, column: 0 },
    offsetX: 132,
    offsetY: 308,
    width,
    height,
  };
}

function snapshot(roots: readonly FloatingImage[]): string {
  return JSON.stringify(normalizePictureObjectCollection(roots));
}

const actions: EqualPictureDimensionsAction[] = ["equal-height", "equal-width", "equal-size"];

describe("last-selected equal picture dimensions", () => {
  test.each([
    ["equal-height", "second", [576, 192], [144, 192]],
    ["equal-width", "second", [144, 48], [144, 192]],
    ["equal-size", "second", [144, 192], [144, 192]],
    ["equal-height", "first", [288, 96], [72, 96]],
    ["equal-width", "first", [288, 96], [288, 384]],
    ["equal-size", "first", [288, 96], [288, 96]],
  ] as const)(
    "%s uses actual active root %s rather than forest or ID-list order",
    (action, activeId, firstSize, secondSize) => {
      const context = view();
      const first = legacy("first"),
        second = legacy("second", 144, 192);
      second.offsetX = 445;
      second.offsetY = 521;
      first.lockAspectRatio = second.lockAspectRatio = true;
      const roots = [second, first],
        before = snapshot(roots);
      const next = planEqualPictureDimensions(
        roots,
        [first.id, second.id],
        activeId,
        action,
        context.layout,
        context,
      );
      expect(next.map((image) => image.id)).toEqual([second.id, first.id]);
      expect(
        next.map((image) => {
          const rect = getPictureViewRect(image, context.layout, context)!;
          return [rect.width, rect.height];
        }),
      ).toEqual([secondSize, firstSize]);
      for (let index = 0; index < roots.length; index++) {
        const old = getPictureViewRect(roots[index]!, context.layout, context)!;
        expect(getPictureViewRect(next[index]!, context.layout, context)).toMatchObject({
          x: old.x,
          y: old.y,
        });
        expect(next[index]!.lockAspectRatio).toBe(true);
      }
      expect(snapshot(roots)).toBe(before);
    },
  );

  test.each(["equal-height", "equal-width"] as const)(
    "%s respects mixed per-member locks instead of a selection-wide lock",
    (action) => {
      const context = view();
      const reference = legacy("reference", 120, 80);
      const locked = legacy("locked", 240, 120);
      const unlocked = { ...legacy("unlocked", 240, 120), lockAspectRatio: false };
      const next = planEqualPictureDimensions(
        [locked, reference, unlocked],
        [locked.id, unlocked.id, reference.id],
        reference.id,
        action,
        context.layout,
        context,
      );
      expect(getPictureViewRect(next[0]!, context.layout, context)).toMatchObject(
        action === "equal-width" ? { width: 120, height: 60 } : { width: 160, height: 80 },
      );
      expect(getPictureViewRect(next[2]!, context.layout, context)).toMatchObject(
        action === "equal-width" ? { width: 120, height: 120 } : { width: 240, height: 80 },
      );
      expect(next[0]).not.toHaveProperty("lockAspectRatio");
      expect(next[2]!.lockAspectRatio).toBe(false);
    },
  );

  test.each(actions)(
    "%s uses a group's local root box while keeping its complete hidden tree and source metadata",
    (action) => {
      const context = view(),
        group = pictureGroup(),
        frame = framedPicture();
      const leaf = group.members[0]!;
      leaf.frame.rect = { xRatio: -1, yRatio: 1.5, widthRatio: 3, heightRatio: 2 };
      leaf.hidden = true;
      group.frame.anchor = { mode: "fixed", x: 40, y: 10, size: { width: 180, height: 90 } };
      group.lockAspectRatio = true;
      frame.lockAspectRatio = false;
      frame.frame.source = { widthRatio: 2, heightRatio: 3, offsetXRatio: 0.1, offsetYRatio: -0.2 };
      frame.frame.flipHorizontal = true;
      frame.frame.cropShape = { preset: "ellipse" };
      const old = legacy();
      old.transform = {
        rotation: 90,
        crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
        flipVertical: true,
      };
      const sibling = { ...legacy("hidden-sibling", 20, 30), hidden: true };
      const roots = [old, sibling, frame, group],
        before = snapshot(roots);
      const next = planEqualPictureDimensions(
        roots,
        [frame.id, group.id, old.id],
        group.id,
        action,
        context.layout,
        context,
      );
      expect(next[1]).toEqual(sibling);
      expect(next[3]).toEqual(group);
      expect(isPictureGroup(next[3]!) && next[3].members).toEqual(group.members);
      const nextLegacy = next[0]!;
      if (isPictureGroup(nextLegacy)) throw new Error("Expected a real picture.");
      expect(nextLegacy.assetId).toBe(old.assetId);
      expect(nextLegacy.transform).toEqual(old.transform);
      const nextFrame = next[2]!;
      if (!isFramedPictureObject(nextFrame)) throw new Error("Expected framed root.");
      expect(nextFrame.frame.source).toEqual(frame.frame.source);
      expect(nextFrame.frame.cropShape).toEqual(frame.frame.cropShape);
      expect(nextFrame.frame.angleDeg).toBe(frame.frame.angleDeg);
      expect(nextFrame.frame.flipHorizontal).toBe(true);
      expect(nextFrame.assetId).toBe(frame.assetId);
      const rect = getPictureViewRect(nextFrame, context.layout, context)!;
      expect(rect.width).toBeCloseTo(action === "equal-height" ? 120 : 180);
      expect(rect.height).toBeCloseTo(action === "equal-width" ? 80 : 90);
      for (let index = 0; index < roots.length; index++) {
        const originalRect = getPictureViewRect(roots[index]!, context.layout, context)!;
        const resultRect = getPictureViewRect(next[index]!, context.layout, context)!;
        expect(resultRect.x).toBeCloseTo(originalRect.x, 10);
        expect(resultRect.y).toBeCloseTo(originalRect.y, 10);
      }
      expect(snapshot(roots)).toBe(before);
    },
  );

  test.each(["fixed", "move-only", "move-and-size"] as PictureFrameAnchor["mode"][])(
    "equal size distorts locked rotated framed/group targets and preserves %s anchor modes",
    (mode) => {
      const context = view(),
        group = pictureGroup(),
        frame = framedPicture();
      group.lockAspectRatio = frame.lockAspectRatio = true;
      group.frame.anchor = anchorPictureFrameRect(
        mode,
        { x: 40, y: 10, width: 240, height: 120 },
        context.metrics,
      );
      frame.frame.anchor = anchorPictureFrameRect(
        mode,
        { x: 194, y: 74, width: 240, height: 120 },
        context.metrics,
      );
      const reference = legacy("reference", 120, 90);
      const roots = [group, frame, reference],
        before = snapshot(roots);
      const next = planEqualPictureDimensions(
        roots,
        roots.map((root) => root.id),
        reference.id,
        "equal-size",
        context.layout,
        context,
      );
      expect(isPictureGroup(next[0]!) && next[0].members).toEqual(group.members);
      for (let index = 0; index < 2; index++) {
        const rect = getPictureViewRect(next[index]!, context.layout, context)!;
        const old = getPictureViewRect(roots[index]!, context.layout, context)!;
        expect(rect.width).toBeCloseTo(120, 10);
        expect(rect.height).toBeCloseTo(90, 10);
        expect(rect.x).toBeCloseTo(old.x, 10);
        expect(rect.y).toBeCloseTo(old.y, 10);
        expect(next[index]!.lockAspectRatio).toBe(true);
        const root = next[index]!;
        if (!isPictureGroup(root) && !isFramedPictureObject(root))
          throw new Error("Expected frame.");
        expect(root.frame.angleDeg).toBe(37);
        expect(root.frame.anchor.mode).toBe(mode);
      }
      expect(snapshot(roots)).toBe(before);
    },
  );

  test.each(actions)("%s no-ops preserve absent locks and free anchors", (action) => {
    const context = view(),
      group = pictureGroup(),
      frame = framedPicture();
    const old = legacy("legacy", 120, 80);
    const roots = [group, old, frame];
    const next = planEqualPictureDimensions(
      roots,
      roots.map((root) => root.id),
      old.id,
      action,
      context.layout,
      context,
    );
    expect(next).toEqual(roots);
    expect(next).not.toBe(roots);
    expect(next[0]).not.toBe(group);
    expect(isPictureGroup(next[0]!) && next[0].members[0]).not.toBe(group.members[0]);
    expect(next[1]).not.toBe(old);
  });

  test.each([undefined, false, true])(
    "equal height/width honor a target group's own lock %s",
    (lockAspectRatio) => {
      const context = view(),
        group = pictureGroup(),
        reference = legacy("reference", 320, 120);
      if (lockAspectRatio !== undefined) group.lockAspectRatio = lockAspectRatio;
      const roots = [group, reference],
        before = snapshot(roots);
      for (const action of ["equal-height", "equal-width"] as const) {
        const next = planEqualPictureDimensions(
          roots,
          [group.id, reference.id],
          reference.id,
          action,
          context.layout,
          context,
        );
        const rect = getPictureViewRect(next[0]!, context.layout, context)!;
        expect(rect.width).toBeCloseTo(
          action === "equal-width" ? 320 : lockAspectRatio ? 180 : 120,
        );
        expect(rect.height).toBeCloseTo(
          action === "equal-height" ? 120 : lockAspectRatio ? 640 / 3 : 80,
        );
        expect(next[0]!.lockAspectRatio).toBe(lockAspectRatio);
        expect(isPictureGroup(next[0]!) && next[0].members).toEqual(group.members);
      }
      expect(snapshot(roots)).toBe(before);
    },
  );

  test("equal size restores absent lock properties after real dual-axis edits", () => {
    const context = view(),
      group = pictureGroup(),
      frame = framedPicture();
    const reference = legacy("reference", 123, 45),
      old = legacy();
    const roots = [group, frame, old, reference],
      before = snapshot(roots);
    const next = planEqualPictureDimensions(
      roots,
      roots.map((root) => root.id),
      reference.id,
      "equal-size",
      context.layout,
      context,
    );
    for (const root of next) {
      expect(root).not.toHaveProperty("lockAspectRatio");
      const rect = getPictureViewRect(root, context.layout, context)!;
      expect(rect.width).toBeCloseTo(123);
      expect(rect.height).toBeCloseTo(45);
    }
    expect(snapshot(roots)).toBe(before);
  });

  test.each([
    [["legacy"], "legacy"],
    [["legacy", "legacy"], "legacy"],
    [["legacy", "missing"], "legacy"],
    [["legacy", "framed"], undefined],
    [["legacy", "framed"], "missing"],
    [["legacy", "owned-leaf"], "legacy"],
  ] as const)("rejects invalid target/reference selection %j atomically", (ids, activeId) => {
    const context = view(),
      roots = [legacy(), framedPicture(), pictureGroup()];
    const before = snapshot(roots);
    expect(() =>
      planEqualPictureDimensions(roots, ids, activeId, "equal-size", context.layout, context),
    ).toThrow();
    expect(snapshot(roots)).toBe(before);
  });

  test("rejects locked overflow and derived hidden-child overflow atomically", () => {
    const context = view(),
      group = pictureGroup();
    const first = legacy("first", 2, 10000),
      reference = legacy("reference", 4, 100);
    const roots = [first, reference, group],
      before = snapshot(roots);
    expect(() =>
      planEqualPictureDimensions(
        roots,
        [first.id, reference.id],
        reference.id,
        "equal-width",
        context.layout,
        context,
      ),
    ).toThrow(RangeError);
    expect(snapshot(roots)).toBe(before);

    group.frame.angleDeg = 0;
    group.members[0]!.hidden = true;
    group.members[0]!.frame.rect.widthRatio = 1e306;
    const grow = legacy("grow", 10000, 80);
    const hiddenRoots = [grow, group],
      hiddenBefore = snapshot(hiddenRoots);
    resolvePictureGroup(group, context.metrics);
    expect(() =>
      planEqualPictureDimensions(
        hiddenRoots,
        [grow.id, group.id],
        grow.id,
        "equal-width",
        context.layout,
        context,
      ),
    ).toThrow(RangeError);
    expect(snapshot(hiddenRoots)).toBe(hiddenBefore);
  });

  test("retains valid unselected collapsed and hidden siblings without resolving their geometry", () => {
    const context = view(),
      sheet = createSheet("Collapsed", "collapsed");
    sheet.hiddenColumns!.add(0);
    sheet.hiddenRows!.add(0);
    const collapsed = framedPicture(),
      group = pictureGroup();
    const anchor: PictureFrameAnchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    collapsed.frame.anchor = anchor;
    group.frame.anchor = structuredClone(anchor);
    const hidden = { ...legacy("hidden", 30, 20), hidden: true };
    const target = legacy("target"),
      reference = legacy("reference", 120, 80);
    const roots = [collapsed, target, group, hidden, reference],
      before = snapshot(roots);
    const next = planEqualPictureDimensions(
      roots,
      [target.id, reference.id],
      reference.id,
      "equal-size",
      context.layout,
      { ...context, metrics: createPictureSheetMetrics(sheet) },
    );
    expect(next[0]).toEqual(collapsed);
    expect(next[2]).toEqual(group);
    expect(next[3]).toEqual(hidden);
    expect(getPictureViewRect(next[1]!, context.layout, context)).toMatchObject({
      width: 120,
      height: 80,
    });
    expect(snapshot(roots)).toBe(before);
    // Legacy-only selections do not acquire a geometry-context dependency from
    // an unrelated framed/group sibling.
    expect(
      planEqualPictureDimensions(
        roots,
        [target.id, reference.id],
        reference.id,
        "equal-size",
        context.layout,
      ),
    ).toEqual(next);
  });

  test("rejects collapsed, stale/missing geometry, duplicate forest IDs and unrepresentable LT", () => {
    const context = view(),
      sheet = createSheet("Collapsed", "collapsed");
    sheet.hiddenColumns!.add(0);
    sheet.hiddenRows!.add(0);
    const collapsed = framedPicture();
    collapsed.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const roots = [legacy(), collapsed],
      before = snapshot(roots);
    expect(() =>
      planEqualPictureDimensions(
        roots,
        roots.map((root) => root.id),
        collapsed.id,
        "equal-size",
        context.layout,
        { ...context, metrics: createPictureSheetMetrics(sheet) },
      ),
    ).toThrow();
    expect(snapshot(roots)).toBe(before);
    expect(() =>
      planEqualPictureDimensions(
        roots,
        roots.map((root) => root.id),
        collapsed.id,
        "equal-size",
        context.layout,
      ),
    ).toThrow();
    expect(() =>
      planEqualPictureDimensions(
        roots,
        roots.map((root) => root.id),
        collapsed.id,
        "equal-size",
        context.layout,
        { ...context, layout: view().layout },
      ),
    ).toThrow();
    const duplicate = [legacy(), legacy()];
    expect(() =>
      planEqualPictureDimensions(
        duplicate,
        ["legacy", "other"],
        "legacy",
        "equal-size",
        context.layout,
        context,
      ),
    ).toThrow();
    const hugePosition = legacy("huge-position");
    hugePosition.offsetX = Number.MAX_VALUE;
    expect(() =>
      planEqualPictureDimensions(
        [legacy(), hugePosition],
        ["legacy", hugePosition.id],
        "legacy",
        "equal-size",
        context.layout,
        context,
      ),
    ).toThrow(RangeError);
  });

  test("rejects sparse/accessor selections without executing caller code", () => {
    const context = view(),
      roots = [legacy(), framedPicture()];
    const before = snapshot(roots),
      sparse: string[] = [];
    sparse.length = 2;
    sparse[1] = "legacy";
    let calls = 0;
    const accessor = ["legacy", "framed"];
    Object.defineProperty(accessor, "0", {
      get: () => {
        calls++;
        return "legacy";
      },
    });
    for (const ids of [sparse, accessor]) {
      expect(() =>
        planEqualPictureDimensions(roots, ids, "legacy", "equal-size", context.layout, context),
      ).toThrow(TypeError);
    }
    expect(calls).toBe(0);
    expect(snapshot(roots)).toBe(before);
  });
});
