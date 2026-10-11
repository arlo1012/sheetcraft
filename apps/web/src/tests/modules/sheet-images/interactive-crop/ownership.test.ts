import { afterEach, describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { fixture, leafPath, metadata, physicalSource } from "./fixture";

const fixtures: ReturnType<typeof fixture>[] = [];
function owner(id?: string, path: readonly string[] | null = null) {
  const value = fixture(id, path);
  fixtures.push(value);
  return value;
}
afterEach(() => fixtures.splice(0).forEach((value) => value.scope.stop()));

describe("interactive crop real source ownership", () => {
  test.each(["legacy0", "legacy90", "framed"])(
    "%s view uses its actual asset, alt text and style while preview remains detached",
    (id) => {
      const f = owner(id),
        before = serializeWorkbook(f.session.workbook);
      const original = f.root();
      if (isPictureGroup(original)) throw new Error("Expected real standalone source.");
      expect(f.crop.canStart.value).toBe(true);
      expect(f.crop.start()).toBe(true);
      expect(f.crop.view.value!.picture).toMatchObject({
        id,
        assetId: original.assetId,
        altText: original.altText,
        transform: metadata,
      });
      const snapshot = f.crop.captureGesture()!;
      expect(snapshot).toBeDefined();
      expect(snapshot.crop.layout).not.toHaveProperty("sourceRect");
      f.gesture("source", { x: 16, y: -11 });
      expect(f.crop.previewRoots.value!.map((root) => root.id)).toEqual(
        f.sheet.floatingImages.map((root) => root.id),
      );
      expect(f.crop.previewRoots.value!.find((root) => root.id === "hidden")).toEqual(
        f.root("hidden"),
      );
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("a rotated owned source keeps the exact parent, hidden siblings, asset and style", () => {
    const f = owner("owned-group", leafPath);
    const before = serializeWorkbook(f.session.workbook),
      original = structuredClone(f.owned());
    expect(f.crop.start()).toBe(true);
    expect(f.crop.view.value!.picture).toMatchObject({
      kind: "grouped-picture-v1",
      id: "owned-leaf",
      assetId: "synthetic-asset",
      altText: "Synthetic leaf",
      transform: metadata,
    });
    expect(f.crop.captureGesture()!.crop.layout.angleDeg).toBe(37);
    const initial = physicalSource(f.crop.captureGesture()!.crop);
    f.gesture("nw", { x: 14, y: 9 });
    const draft = f.crop.captureGesture()!.crop,
      next = physicalSource(draft);
    expect(next.center.x).toBeCloseTo(initial.center.x);
    expect(next.center.y).toBeCloseTo(initial.center.y);
    expect(next.width).toBeCloseTo(initial.width);
    expect(next.height).toBeCloseTo(initial.height);
    const roots = f.crop.previewRoots.value!;
    const group = roots.find((root) => root.id === "owned-group")!;
    if (!isPictureGroup(group)) throw new Error("Expected exact owner.");
    expect(group.frame).toEqual(original.frame);
    expect(group.members[1]).toEqual(original.members[1]);
    expect(group).not.toHaveProperty("assetId");
    expect(group.frame).not.toHaveProperty("source");
    expect(group.members[0]).toMatchObject({
      assetId: "synthetic-asset",
      altText: "Synthetic leaf",
      transform: metadata,
      frame: { flipHorizontal: true, flipVertical: true },
    });
    expect(roots.map((root) => root.id)).toEqual(f.sheet.floatingImages.map((root) => root.id));
    for (const root of roots.filter((root) => root.id !== "owned-group"))
      expect(root).toEqual(f.root(root.id));
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.crop.apply()).toBe(true);
    expect(f.owned().frame).toEqual(original.frame);
    expect(f.owned().members[1]).toEqual(original.members[1]);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each(["source", "n", "s", "e", "w", "nw", "ne", "sw", "se"] as const)(
    "the real 37-degree framed %s gesture keeps the crop's actual flips and content",
    (direction) => {
      const f = owner();
      expect(f.crop.start()).toBe(true);
      const original = f.crop.captureGesture()!.crop;
      const initialSource = physicalSource(original);
      f.gesture(direction, { x: 13, y: -9 });
      const current = f.crop.captureGesture()!.crop;
      const draftSource = physicalSource(current);
      expect(current.layout.angleDeg).toBe(37);
      if (direction === "source") {
        expect(current.layout).toEqual(original.layout);
        expect(draftSource.center.x).toBeCloseTo(initialSource.center.x + 13);
        expect(draftSource.center.y).toBeCloseTo(initialSource.center.y - 9);
      } else {
        expect(draftSource.center.x).toBeCloseTo(initialSource.center.x);
        expect(draftSource.center.y).toBeCloseTo(initialSource.center.y);
      }
      expect(draftSource.width).toBeCloseTo(initialSource.width);
      expect(draftSource.height).toBeCloseTo(initialSource.height);
      expect(f.crop.apply()).toBe(true);
      expect(f.framed()).toMatchObject({
        assetId: "asset",
        altText: "Synthetic",
        groupId: "plain-metadata",
        lockAspectRatio: false,
        transform: metadata,
        frame: { angleDeg: 37, flipHorizontal: true, flipVertical: true },
      });
    },
  );

  test.each(["legacy0", "legacy90"])(
    "%s promotes only after a real edit and retains ordinary group metadata",
    (id) => {
      const f = owner(id),
        original = structuredClone(f.root());
      if (isPictureGroup(original)) throw new Error("Expected legacy source.");
      expect(isFramedPictureObject(original)).toBe(false);
      expect(f.crop.start()).toBe(true);
      expect(f.crop.previewGesture(f.crop.captureGesture()!, "source", { x: 0, y: 0 })).toBe(true);
      expect(f.crop.apply()).toBe(true);
      expect(f.root()).toEqual(original);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.crop.start()).toBe(true);
      f.gesture();
      expect(isFramedPictureObject(f.root())).toBe(false);
      expect(f.crop.apply()).toBe(true);
      const promoted = f.framed(id);
      expect(promoted).toMatchObject({
        id,
        assetId: original.assetId,
        altText: original.altText,
        groupId: "plain-metadata",
        lockAspectRatio: false,
        transform: metadata,
        frame: { angleDeg: id === "legacy90" ? 90 : 0, flipHorizontal: true, flipVertical: true },
      });
      expect(promoted.transform).not.toHaveProperty("crop");
      expect(promoted.transform).not.toHaveProperty("rotation");
      expect(promoted).not.toHaveProperty("members");
      expect(f.session.history.undoStack).toHaveLength(1);
    },
  );
});
