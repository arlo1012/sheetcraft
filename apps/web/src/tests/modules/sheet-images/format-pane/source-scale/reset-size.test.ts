import { describe, expect, test } from "vitest";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import {
  expectPreservedNestedOwners,
  intrinsicSize,
  nestedRoot,
  ownerKinds,
  selectedNode,
  sourceOwnerFixture,
  sourceState,
} from "./owner-fixture";

describe("actual selected source Reset Size", () => {
  test.each(ownerKinds)(
    "%s resets the replacement asset's actual dimensions and retains metadata, appearance and flips",
    (kind) => {
      const f = sourceOwnerFixture(kind);
      selectedNode(f).assetId = "replacement-asset";
      f.revision.value++;
      f.intrinsic.value = intrinsicSize("replacement-asset", 321, 123, "blob:replacement-source");
      const before = serializeWorkbook(f.session.workbook),
        old = sourceState(f),
        originalNode = structuredClone(selectedNode(f)),
        originalGroup = kind === "nested-leaf" ? structuredClone(nestedRoot(f)) : undefined;
      expect(f.pane.snapshot.value!.owner.assetId).toBe("replacement-asset");
      expect(f.pane.snapshot.value!.originalSizePt).toEqual({ width: 240.75, height: 92.25 });
      expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(true);
      expect(f.pane.onIntent(f.reset("reset-size"))).toBe(true);
      const after = sourceState(f),
        node = selectedNode(f);
      expect(after.layout.rect.width).toBeCloseTo(321);
      expect(after.layout.rect.height).toBeCloseTo(123);
      expect(after.layout.rect.x).toBeCloseTo(old.layout.rect.x);
      expect(after.layout.rect.y).toBeCloseTo(old.layout.rect.y);
      expect(after.layout.angleDeg).toBeCloseTo(0);
      expect(after.source).toEqual({
        widthRatio: 1,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
      expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(100);
      expect(f.pane.snapshot.value!.values.scaleHeightPercent).toBeCloseTo(100);
      expect(node.assetId).toBe(originalNode.assetId);
      expect(node.id).toBe(originalNode.id);
      expect(node.altText).toBe(originalNode.altText);
      expect(node.lockAspectRatio).toBe(originalNode.lockAspectRatio);
      if (kind === "legacy") {
        expect(!isGroupedPicture(node) && isFramedPictureObject(node)).toBe(true);
        expect(node.transform).toEqual({ appearance: originalNode.transform!.appearance });
        expect(node).toMatchObject({ frame: { flipVertical: true } });
        expect(node.transform).not.toHaveProperty("crop");
        expect(node.transform).not.toHaveProperty("rotation");
      } else {
        expect(node.transform).toEqual(originalNode.transform);
        expect(node).toMatchObject({ frame: { flipHorizontal: true } });
        if (kind === "nested-leaf") expect(node).toMatchObject({ frame: { flipVertical: true } });
      }
      if (originalGroup) expectPreservedNestedOwners(f, originalGroup);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
      const written = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(written);
    },
  );

  test("Reset Size remains the actual original-size operation while relative percentage mode is OFF", () => {
    const f = sourceOwnerFixture();
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    expect(f.pane.onIntent(f.reset("reset-size"))).toBe(true);
    expect(sourceState(f).layout.rect).toMatchObject({ width: 360, height: 320 });
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(false);
    expect(f.pane.onIntent(f.reset("reset-size"))).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("exact no-op Reset Size and both Scale bases never promote a canonical legacy picture", () => {
    const f = sourceOwnerFixture("legacy"),
      node = selectedNode(f);
    if (isGroupedPicture(node) || isFramedPictureObject(node))
      throw new TypeError("Expected legacy.");
    node.transform = { flipVertical: true, appearance: { opacity: 0.8 } };
    f.sheet.floatingImages = normalizePictureObjectCollection(f.sheet.floatingImages);
    f.intrinsic.value = intrinsicSize("old", 240, 120);
    f.pane.clear();
    const before = serializeWorkbook(f.session.workbook),
      original = structuredClone(selectedNode(f));
    expect(f.pane.snapshot.value!.values).toMatchObject({
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
    });
    expect(f.pane.onIntent(f.reset("reset-size"))).toBe(true);
    expect(f.pane.onIntent(f.field("scaleWidthPercent", 100))).toBe(true);
    expect(f.pane.onIntent(f.field("scaleHeightPercent", 100))).toBe(true);
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    expect(f.pane.onIntent(f.field("scaleWidthPercent", 100))).toBe(true);
    expect(f.pane.onIntent(f.reset("reset-size"))).toBe(true);
    expect(selectedNode(f)).toEqual(original);
    const unchanged = selectedNode(f);
    expect(!isGroupedPicture(unchanged) && isFramedPictureObject(unchanged)).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(ownerKinds)(
    "%s unchanged displayed source Scale does not add history or promote",
    (kind) => {
      const f = sourceOwnerFixture(kind),
        before = serializeWorkbook(f.session.workbook),
        values = f.pane.snapshot.value!.values;
      expect(f.pane.onIntent(f.field("scaleWidthPercent", values.scaleWidthPercent!))).toBe(true);
      expect(f.pane.onIntent(f.field("scaleHeightPercent", values.scaleHeightPercent!))).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
});
