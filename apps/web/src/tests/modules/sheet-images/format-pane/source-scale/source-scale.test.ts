import { describe, expect, test } from "vitest";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import {
  expectPreservedNestedOwners,
  nestedRoot,
  ownerKinds,
  selectedNode,
  sourceOwnerFixture,
  sourceState,
} from "./owner-fixture";

describe("actual selected source percentage scale", () => {
  test.each(ownerKinds)(
    "%s displays source extents over the actual asset's natural axes",
    (kind) => {
      const f = sourceOwnerFixture(kind),
        snapshot = f.pane.snapshot.value!;
      expect(snapshot.values.relativeToOriginalSize).toBe(true);
      expect(snapshot.values.scaleWidthPercent).toBeCloseTo(50);
      expect(snapshot.values.scaleHeightPercent).toBeCloseTo(kind === "nested-leaf" ? 25 : 50);
      expect(snapshot.originalSizePt).toEqual({
        width: f.intrinsic.value!.width * 0.75,
        height: f.intrinsic.value!.height * 0.75,
      });
      expect(f.pane.capabilities.value.fields.scaleWidthPercent?.enabled).toBe(true);
      expect(f.pane.capabilities.value.fields.scaleHeightPercent?.enabled).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(ownerKinds)(
    "%s locked scale couples physical source axes and keeps the rotated NW in one exact undo",
    (kind) => {
      const f = sourceOwnerFixture(kind),
        before = serializeWorkbook(f.session.workbook),
        originalNode = structuredClone(selectedNode(f)),
        originalGroup = kind === "nested-leaf" ? structuredClone(nestedRoot(f)) : undefined,
        old = sourceState(f),
        sessionId = f.pane.snapshot.value!.owner.sessionId,
        intent = f.field("scaleWidthPercent", 125);
      expect(f.pane.onIntent(intent)).toBe(true);
      const after = sourceState(f),
        node = selectedNode(f);
      expect(after.layout.rect.width).toBeCloseTo(old.layout.rect.width * 2.5);
      expect(after.layout.rect.height).toBeCloseTo(old.layout.rect.height * 2.5);
      expect(after.layout.corners[0].x).toBeCloseTo(old.layout.corners[0].x);
      expect(after.layout.corners[0].y).toBeCloseTo(old.layout.corners[0].y);
      expect(after.layout.angleDeg).toBe(old.layout.angleDeg);
      expect(after.source).toEqual(old.source);
      expect(node.assetId).toBe(originalNode.assetId);
      expect(node.altText).toBe(originalNode.altText);
      expect(node.lockAspectRatio).toBe(originalNode.lockAspectRatio);
      if (kind === "legacy") {
        expect(!isGroupedPicture(node) && isFramedPictureObject(node)).toBe(true);
        expect(node.transform).toEqual({ appearance: originalNode.transform!.appearance });
        expect(node).toMatchObject({ frame: { flipVertical: true } });
      } else expect(node.transform).toEqual(originalNode.transform);
      if (originalGroup) expectPreservedNestedOwners(f, originalGroup);
      expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBeCloseTo(125);
      expect(f.pane.snapshot.value!.values.scaleHeightPercent).toBeCloseTo(
        kind === "nested-leaf" ? 62.5 : 125,
      );
      expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBe(intent.intentId);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
      const written = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(written);
    },
  );

  test.each(ownerKinds)("%s unlocked scale changes only the submitted physical axis", (kind) => {
    const f = sourceOwnerFixture(kind, false),
      old = sourceState(f);
    expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(true);
    const widthEdit = sourceState(f);
    expect(widthEdit.layout.rect.width).toBeCloseTo(old.layout.rect.width * 2.5);
    expect(widthEdit.layout.rect.height).toBeCloseTo(old.layout.rect.height);
    expect(widthEdit.source).toEqual(old.source);
    expect(f.pane.snapshot.value!.values.scaleHeightPercent).toBeCloseTo(
      kind === "nested-leaf" ? 25 : 50,
    );
    expect(f.pane.onIntent(f.field("scaleHeightPercent", 125))).toBe(true);
    const heightEdit = sourceState(f);
    expect(heightEdit.layout.rect.width).toBeCloseTo(widthEdit.layout.rect.width);
    expect(heightEdit.layout.rect.height).toBeCloseTo(
      old.layout.rect.height * (kind === "nested-leaf" ? 5 : 2.5),
    );
    expect(heightEdit.source).toEqual(old.source);
    expect(f.session.history.undoStack).toHaveLength(2);
  });

  test.each(ownerKinds)(
    "%s relative OFF applies successive 125 percent operations to the current extent",
    (kind) => {
      const f = sourceOwnerFixture(kind),
        old = sourceState(f),
        before = serializeWorkbook(f.session.workbook),
        oldIntent = f.field("scaleWidthPercent", 125),
        revision = f.revision.value;
      expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
      expect(f.pane.snapshot.value!.values).toMatchObject({
        relativeToOriginalSize: false,
        scaleWidthPercent: 100,
        scaleHeightPercent: 100,
      });
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.revision.value).toBe(revision);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.pane.onIntent(oldIntent)).toBe(false);
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(true);
      expect(sourceState(f).layout.rect.width).toBeCloseTo(old.layout.rect.width * 1.25);
      expect(f.pane.snapshot.value!.values.scaleWidthPercent).toBe(100);
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(true);
      const after = sourceState(f);
      expect(after.layout.rect.width).toBeCloseTo(old.layout.rect.width * 1.25 * 1.25);
      expect(after.layout.rect.height).toBeCloseTo(old.layout.rect.height * 1.25 * 1.25);
      expect(after.source).toEqual(old.source);
      expect(f.execute).toHaveBeenCalledTimes(2);
      expect(f.session.history.undoStack).toHaveLength(2);
    },
  );

  test("relative mode is local state and resets on owner boundaries while source refresh and own edits retain it", () => {
    const f = sourceOwnerFixture();
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    f.intrinsic.value = { ...f.intrinsic.value!, url: "blob:refreshed-source" };
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(false);
    expect(f.pane.onIntent(f.field("scaleHeightPercent", 125))).toBe(true);
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(false);
    f.selectedIds.value = ["legacy"];
    f.selectedIds.value = ["framed"];
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(true);
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    f.generation.value++;
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(true);
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    f.open.value = false;
    f.open.value = true;
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("nested leaf relative mode resets on the exact selected path boundary", () => {
    const f = sourceOwnerFixture("nested-leaf");
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    f.selectedPath.value = ["owned-group", "branch"];
    expect(f.pane.snapshot.value!.values).not.toHaveProperty("relativeToOriginalSize");
    f.selectedPath.value = ["owned-group", "branch", "owned-leaf"];
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
