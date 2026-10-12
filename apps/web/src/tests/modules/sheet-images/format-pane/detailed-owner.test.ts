import { expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureFormatDetailedIntent } from "../../../../modules/sheet-images/picture-format-pane-model";
import {
  appearanceCheckpoint,
  appearanceOwnerFixture,
  expectAppearanceUnchanged,
} from "./appearance-owner-fixture";
import { ownerKinds, selectedNode } from "./source-scale/owner-fixture";

const gradient = {
  kind: "value" as const,
  value: {
    kind: "linear" as const,
    opacity: 1,
    rotateWithShape: true,
    angleDeg: 90,
    stops: [
      {
        offset: 0,
        color: { kind: "theme" as const, reference: { slot: "accent1" as const } },
        opacity: 1,
        brightness: 0.8,
      },
      {
        offset: 1,
        color: { kind: "theme" as const, reference: { slot: "accent1" as const } },
        opacity: 1,
        brightness: 0,
      },
    ],
  },
};
function intent(f: ReturnType<typeof appearanceOwnerFixture>) {
  return createPictureFormatDetailedIntent(
    f.pane.snapshot.value!,
    "fill",
    gradient,
    "synthetic-gradient",
  );
}
test.each(ownerKinds)(
  "a genuine %s owner applies one typed fill transaction and restores exact snapshots with Undo/Redo",
  (kind) => {
    const f = appearanceOwnerFixture(kind),
      before = serializeWorkbook(f.session.workbook),
      description = selectedNode(f).altText;
    expect(f.pane.onIntent(intent(f))).toBe(true);
    expect(selectedNode(f).transform?.appearance?.detailedStyle?.fill).toEqual(gradient);
    expect(f.pane.snapshot.value?.appearance?.detailedStyle?.fill).toEqual(gradient);
    expect(selectedNode(f).altText).toBe(description);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(50);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  },
);
test.each(["refused", "thrown"] as const)(
  "%s detailed edits keep document, snapshot and redo history intact",
  (failure) => {
    const f = appearanceOwnerFixture();
    expect(f.pane.onIntent(intent(f))).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    if (failure === "refused") f.refuse();
    else f.throw();
    const before = appearanceCheckpoint(f);
    expect(f.pane.onIntent(intent(f))).toBe(false);
    expectAppearanceUnchanged(f, before);
  },
);
test("unknown paint assets and unsafe camera planes reject before any command", () => {
  const f = appearanceOwnerFixture(),
    before = appearanceCheckpoint(f);
  const texture = createPictureFormatDetailedIntent(
    f.pane.snapshot.value!,
    "fill",
    {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "unknown",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
    "unknown-resource",
  );
  const camera = createPictureFormatDetailedIntent(
    f.pane.snapshot.value!,
    "rotation3d",
    {
      kind: "value",
      value: {
        projection: "perspective",
        perspectiveDeg: 45,
        xDeg: 0,
        yDeg: 0,
        zDeg: 0,
        distanceFromGroundPt: 2000,
      },
    },
    "unsafe-camera",
  );
  expect(f.pane.onIntent(texture)).toBe(false);
  expect(f.pane.onIntent(camera)).toBe(false);
  expect(f.execute).not.toHaveBeenCalled();
  expectAppearanceUnchanged(f, before);
});
test("the same literal choice is accepted without inventing a second history entry", () => {
  const f = appearanceOwnerFixture();
  expect(f.pane.onIntent(intent(f))).toBe(true);
  f.execute.mockClear();
  expect(f.pane.onIntent(intent(f))).toBe(true);
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.session.history.undoStack).toHaveLength(1);
});
test("old owner, revision and cancelled session cannot deliver a structured edit", () => {
  const f = appearanceOwnerFixture(),
    old = intent(f);
  expect(f.pane.onIntent(old)).toBe(true);
  const before = appearanceCheckpoint(f);
  expect(f.pane.onIntent(old)).toBe(false);
  expectAppearanceUnchanged(f, before);
  const cancelled = intent(f);
  f.pane.close();
  const after = appearanceCheckpoint(f);
  expect(f.pane.onIntent(cancelled)).toBe(false);
  expectAppearanceUnchanged(f, after);
});
