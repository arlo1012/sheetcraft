import { expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { planPictureBatchSize } from "../../../modules/sheet-images/picture-batch-size";
import { resolveOwnedPictureNode } from "../../../modules/sheet-images/picture-group-interaction";
import { fixture } from "./useSheetImageActions/replacement-fixture";
const settings = { width: 240, height: 90, locked: false, all: false };
test.each([false, true])(
  "mixed root batch size uses existing geometry without changing ratio-lock metadata (keep ratio=%s)",
  (locked) => {
    const f = fixture(),
      roots = f.sheet.floatingImages,
      context = f.getContext()!;
    const before = serializeWorkbook(f.session.workbook);
    const next = planPictureBatchSize(
      roots,
      roots.map((root) => root.id),
      null,
      { ...settings, locked },
      context,
    );
    const framed = next[0]!;
    if (!isFramedPictureObject(framed)) throw Error("Expected framed fixture");
    const frame = resolvePictureFrame(framed.frame, context.metrics);
    expect(frame.rect.width).toBeCloseTo(240);
    if (!locked) expect(frame.rect.height).toBeCloseTo(90);
    expect(next.map((root) => root.lockAspectRatio)).toEqual(
      roots.map((root) => root.lockAspectRatio),
    );
    expect(framed.frame.source).toEqual(f.currentFramed().frame.source);
    expect(framed.transform).toEqual(f.currentFramed().transform);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next)),
    ).toBe(true);
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    f.scope.stop();
  },
);
test("internal leaf batch keeps its rotated top-left, sibling, container and actual source unchanged", () => {
  const f = fixture(),
    context = f.getContext()!;
  f.currentGroup().frame.angleDeg = 37;
  const old = resolveOwnedPictureNode(f.sheet.floatingImages, f.leafPath, context)!.layout!;
  const next = planPictureBatchSize(
    f.sheet.floatingImages,
    [f.leafPath[0]!],
    f.leafPath,
    settings,
    context,
  );
  const current = resolveOwnedPictureNode(next, f.leafPath, context)!.layout!;
  expect(current.rect.width).toBeCloseTo(240);
  expect(current.rect.height).toBeCloseTo(90);
  expect(current.corners[0]!.x).toBeCloseTo(old.corners[0]!.x);
  expect(current.corners[0]!.y).toBeCloseTo(old.corners[0]!.y);
  const root = next.find((root) => root.id === f.leafPath[0])!;
  if (!isPictureGroup(root)) throw Error("Expected group");
  expect(root.frame).toEqual(f.currentGroup().frame);
  expect(root.members[1]).toEqual(f.currentGroup().members[1]);
  expect(root.members[0]).toMatchObject({
    assetId: f.currentLeaf().assetId,
    transform: f.currentLeaf().transform,
  });
  f.scope.stop();
});
test("invalid or collapsed mixed batches fail without partial changes", () => {
  const f = fixture(),
    before = serializeWorkbook(f.session.workbook);
  expect(() =>
    planPictureBatchSize(
      f.sheet.floatingImages,
      ["framed", "legacy"],
      null,
      { ...settings, width: 10001 },
      f.getContext(),
    ),
  ).toThrow();
  expect(() =>
    planPictureBatchSize(f.sheet.floatingImages, ["framed", "legacy"], null, settings),
  ).toThrow();
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  f.scope.stop();
});
