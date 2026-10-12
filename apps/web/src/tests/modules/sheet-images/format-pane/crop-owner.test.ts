import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  resolvePictureSourceLayout,
  pictureFrameLocalToWorld,
} from "@sheetcraft/core/picture-frame";
import { cropOwnerFixture } from "./crop-owner-fixture";

describe("actual source and crop pane owner", () => {
  test("legacy-to-frame crop promotion retains title, lock and print properties in undo/redo", () => {
    const f = cropOwnerFixture("legacy"),
      image = f.sheet.floatingImages[2]!;
    Object.assign(image, { altTitle: "Title", locked: false, printObject: false });
    const before = serializeWorkbook(f.session.workbook);
    expect(f.pane.onIntent(f.field("cropWidthPt", 60))).toBe(true);
    expect(f.sheet.floatingImages[2]).toMatchObject({
      altTitle: "Title",
      locked: false,
      printObject: false,
    });
    expect(isFramedPictureObject(f.sheet.floatingImages[2]!)).toBe(true);
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    f.scope.stop();
  });
  test("displays eight real fields and enables independent source axes plus signed offsets", () => {
    const f = cropOwnerFixture();
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sourceWidthPt: 135,
      sourceHeightPt: 120,
      sourceOffsetXPt: 22.5,
      sourceOffsetYPt: -6,
      cropWidthPt: 90,
      cropHeightPt: 60,
      cropLeftPt: 145.5,
      cropTopPt: 55.5,
    });
    for (const key of [
      "sourceWidthPt",
      "sourceHeightPt",
      "sourceOffsetXPt",
      "sourceOffsetYPt",
      "cropWidthPt",
      "cropHeightPt",
      "cropLeftPt",
      "cropTopPt",
    ] as const)
      expect(f.pane.capabilities.value.fields[key]?.enabled).toBe(true);
    expect(f.pane.capabilities.value.fields.sourceWidthPt).not.toHaveProperty("max");
    expect(f.pane.onIntent(f.field("sourceWidthPt", 15000))).toBe(true);
    expect(f.pane.snapshot.value!.values.sourceHeightPt).toBe(120);
    expect(f.pane.snapshot.value!.values.cropWidthPt).toBe(90);
    expect(f.pane.snapshot.value!.values.sourceOffsetXPt).toBe(22.5);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("crop edge preserves the rotated source center, angle, flips, metadata and all siblings in one undo", () => {
    const f = cropOwnerFixture(),
      before = serializeWorkbook(f.session.workbook),
      image = f.sheet.floatingImages[1]!;
    if (!isFramedPictureObject(image)) throw new Error("Expected framed");
    const old = f.resolved(),
      oldCenter = pictureFrameLocalToWorld(old.rect, old.angleDeg, {
        x: old.rect.width / 2 + old.rect.width * image.frame.source.offsetXRatio,
        y: old.rect.height / 2 + old.rect.height * image.frame.source.offsetYRatio,
      });
    const owner = f.pane.snapshot.value!.owner.sessionId;
    expect(f.pane.onIntent(f.field("cropWidthPt", 67.5))).toBe(true);
    const next = f.sheet.floatingImages[1]!;
    if (!isFramedPictureObject(next)) throw new Error("Expected frame");
    const layout = f.resolved(),
      center = pictureFrameLocalToWorld(layout.rect, layout.angleDeg, {
        x: layout.rect.width / 2 + layout.rect.width * next.frame.source.offsetXRatio,
        y: layout.rect.height / 2 + layout.rect.height * next.frame.source.offsetYRatio,
      });
    expect(center.x).toBeCloseTo(oldCenter.x);
    expect(center.y).toBeCloseTo(oldCenter.y);
    expect(next.transform).toEqual(image.transform);
    expect(next.frame.flipHorizontal).toBe(true);
    expect(next.assetId).toBe(image.assetId);
    expect(f.pane.snapshot.value!.owner.sessionId).toBe(owner);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("absolute crop Left and Top are worksheet layout coordinates, while source stays in place", () => {
    const f = cropOwnerFixture();
    expect(f.pane.onIntent(f.field("cropLeftPt", 180))).toBe(true);
    expect(f.resolved().rect.x).toBeCloseTo(240);
    expect(f.pane.onIntent(f.field("cropTopPt", 30))).toBe(true);
    expect(f.resolved().rect.y).toBeCloseTo(40);
    expect(f.resolved().angleDeg).toBe(37);
  });
  test("Crop Reset restores current source extent and preserves effective style, angle and asset", () => {
    const f = cropOwnerFixture(),
      original = structuredClone(f.sheet.floatingImages[1]);
    expect(f.pane.onIntent(f.reset("reset-crop"))).toBe(true);
    expect(f.pane.snapshot.value!.values).toMatchObject({
      cropLeftPt: 145.5,
      cropTopPt: 19.5,
      sourceWidthPt: 135,
      sourceHeightPt: 120,
      cropWidthPt: 135,
      cropHeightPt: 120,
      sourceOffsetXPt: 0,
      sourceOffsetYPt: 0,
      rotationDeg: 37,
    });
    const next = f.sheet.floatingImages[1]!;
    if (!original || !isFramedPictureObject(original) || !isFramedPictureObject(next))
      throw new Error("Expected frame");
    expect(next.assetId).toBe(original.assetId);
    expect(next.transform).toEqual(original.transform);
    expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(false);
    expect(f.pane.onIntent(f.reset("reset-crop"))).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("legacy crop no-op does not promote; real edit upgrades canonical geometry while preserving content", () => {
    const f = cropOwnerFixture("legacy");
    const original = structuredClone(f.sheet.floatingImages[2]!);
    expect(
      f.pane.onIntent(f.field("cropWidthPt", f.pane.snapshot.value!.values.cropWidthPt!)),
    ).toBe(true);
    expect(f.sheet.floatingImages[2]).toEqual(original);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.pane.onIntent(f.field("sourceOffsetXPt", -9))).toBe(true);
    const next = f.sheet.floatingImages[2]!;
    if (!isFramedPictureObject(next)) throw new Error("Expected promoted");
    expect(next).toMatchObject({
      id: "legacy",
      assetId: "old",
      altText: "Keep description",
      frame: { angleDeg: 90, flipVertical: true },
      transform: { appearance: { opacity: 0.8 } },
    });
    expect(next.transform).not.toHaveProperty("crop");
    expect(next.transform).not.toHaveProperty("rotation");
    expect(deserializeWorkbook(serializeWorkbook(f.session.workbook)).sheets.size).toBe(1);
  });
  test("owned leaf changes real source inside its exact owner without inventing root geometry", () => {
    const f = cropOwnerFixture("owned-group", ["owned-group", "owned-leaf"]),
      original = structuredClone(f.sheet.floatingImages[0]!);
    expect(f.pane.onIntent(f.field("sourceOffsetXPt", 15))).toBe(true);
    const root = f.sheet.floatingImages[0]!;
    if (!isPictureGroup(root) || !isPictureGroup(original)) throw new Error("Expected group");
    expect(root.frame).toEqual(original.frame);
    expect(root.members[1]).toEqual(original.members[1]);
    const leaf = root.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected leaf");
    const layout = f.resolved(),
      source = resolvePictureSourceLayout(layout.rect, layout.angleDeg, leaf.frame.source);
    expect(
      (source.sourceRect!.x +
        source.sourceRect!.width / 2 -
        layout.rect.x -
        layout.rect.width / 2) *
        0.75,
    ).toBeCloseTo(15);
    expect(root).not.toHaveProperty("assetId");
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("unchanged fractional point values do not round-trip into a source edit or history", () => {
    const f = cropOwnerFixture();
    const frame = f.sheet.floatingImages[1]!;
    if (!isFramedPictureObject(frame)) throw new Error("Expected frame");
    frame.frame.source.offsetXRatio = 0.1 / 120;
    if (frame.frame.anchor.mode !== "fixed") throw new Error("Expected fixed frame.");
    frame.frame.anchor.x = 0.1;
    f.pane.clear();
    const before = serializeWorkbook(f.session.workbook),
      value = f.pane.snapshot.value!.values.sourceOffsetXPt!;
    expect(f.pane.onIntent(f.field("sourceOffsetXPt", value))).toBe(true);
    expect(f.pane.onIntent(f.field("cropLeftPt", f.pane.snapshot.value!.values.cropLeftPt!))).toBe(
      true,
    );
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("legacy reflection is displayed but cannot be silently stripped or promoted by crop", () => {
    const f = cropOwnerFixture("legacy"),
      image = f.sheet.floatingImages[2]!;
    if (isPictureGroup(image) || isFramedPictureObject(image)) throw new Error("Expected legacy");
    image.transform = { ...image.transform, appearance: { reflection: true } };
    f.pane.clear();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.pane.snapshot.value!.values).toHaveProperty("sourceWidthPt");
    for (const key of [
      "sourceWidthPt",
      "sourceHeightPt",
      "sourceOffsetXPt",
      "sourceOffsetYPt",
      "cropWidthPt",
      "cropHeightPt",
      "cropLeftPt",
      "cropTopPt",
    ] as const)
      expect(f.pane.capabilities.value.fields[key]?.enabled).toBe(false);
    expect(f.pane.capabilities.value.resets!["reset-crop"]?.enabled).toBe(false);
    expect(f.pane.onIntent(f.field("cropWidthPt", 45))).toBe(false);
    expect(f.pane.onIntent(f.reset("reset-crop"))).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("source-free containers have no enabled crop or reset and cannot apply a forged intent", () => {
    const f = cropOwnerFixture("owned-group");
    expect(f.pane.snapshot.value!.values).not.toHaveProperty("sourceWidthPt");
    expect(f.pane.onIntent(f.field("sourceWidthPt", 200))).toBe(false);
    expect(f.pane.onIntent(f.reset("reset-crop"))).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each([0, -1, NaN, Infinity, "12"])("invalid source width %s is atomic", (value) => {
    const f = cropOwnerFixture(),
      before = serializeWorkbook(f.session.workbook);
    expect(f.pane.onIntent({ ...f.field("sourceWidthPt", 10), value } as never)).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("refusal and stale crop/reset intents retain document/history; own successful edits remain current", () => {
    const f = cropOwnerFixture(),
      old = f.field("cropHeightPt", 45),
      reset = f.reset("reset-crop"),
      before = serializeWorkbook(f.session.workbook);
    f.refuse();
    expect(f.pane.onIntent(old)).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.selectedIds.value = ["legacy"];
    expect(f.pane.onIntent(old)).toBe(false);
    expect(f.pane.onIntent(reset)).toBe(false);
    f.selectedIds.value = ["framed"];
    expect(f.pane.onIntent(old)).toBe(false);
  });
});
