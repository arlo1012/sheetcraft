import { afterEach, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import type { PictureFormatIntent } from "../../../../modules/sheet-images/picture-format-pane-model";
import { cropOwnerFixture } from "./crop-owner-fixture";
const owners: ReturnType<typeof cropOwnerFixture>[] = [];
function owner(id = "framed", path: readonly string[] | null = null) {
  const f = cropOwnerFixture(id, path);
  owners.push(f);
  return f;
}
afterEach(() => owners.splice(0).forEach((f) => f.scope.stop()));
function intent(
  f: ReturnType<typeof cropOwnerFixture>,
  value: PictureCropShape | undefined,
): PictureFormatIntent {
  const snapshot = f.pane.snapshot.value!;
  return {
    type: "set-crop-shape",
    value,
    owner: snapshot.owner,
    baseRevision: snapshot.revision,
    intentId: `shape-${snapshot.revision}`,
  };
}
test.each(["legacy", "framed", "owned-group"])(
  "%s pane changes only actual leaf mask with atomic undo and stable geometry",
  (id) => {
    const path = id === "owned-group" ? [id, "owned-leaf"] : null,
      f = owner(id, path),
      before = serializeWorkbook(f.session.workbook);
    const originalValues = { ...f.pane.snapshot.value!.values };
    expect(f.pane.capabilities.value.cropShape?.enabled).toBe(true);
    expect(f.pane.onIntent(intent(f, { preset: "ellipse" }))).toBe(true);
    expect(f.pane.snapshot.value!.cropShape).toEqual({ preset: "ellipse" });
    const actualValues = { ...f.pane.snapshot.value!.values };
    // A legacy quarter-turn stores viewport dimensions; canonical frame fields use its own axes.
    if (id === "legacy") {
      delete actualValues.sizeWidthPt;
      delete actualValues.sizeHeightPt;
      delete originalValues.sizeWidthPt;
      delete originalValues.sizeHeightPt;
    }
    expect(actualValues).toEqual(originalValues);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(52);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  },
);
test.each(["reset-picture", "reset-crop"] as const)(
  "%s clears mask and leaves the angle intact",
  (type) => {
    const f = owner();
    expect(f.pane.onIntent(intent(f, { preset: "rightArrow", adjustments: { adj1: 60000 } }))).toBe(
      true,
    );
    const angle = f.resolved().angleDeg;
    expect(f.pane.onIntent(f.reset(type))).toBe(true);
    expect(f.pane.snapshot.value!.cropShape).toBeUndefined();
    expect(f.resolved().angleDeg).toBe(angle);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.pane.snapshot.value!.cropShape?.preset).toBe("rightArrow");
  },
);
test("failed/invalid/stale shape intents retain the workbook and history", () => {
  const f = owner(),
    before = serializeWorkbook(f.session.workbook),
    old = intent(f, { preset: "ellipse" });
  expect(f.pane.onIntent(intent(f, { preset: "line" }))).toBe(false);
  f.refuse();
  expect(f.pane.onIntent(old)).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.selectedIds.value = ["legacy"];
  expect(f.pane.onIntent(old)).toBe(false);
  expect(f.session.history.undoStack).toHaveLength(0);
});
test("source-free group and unavailable geometry never advertise a pixel mask", () => {
  const f = owner("owned-group");
  expect(f.pane.capabilities.value.cropShape?.enabled).not.toBe(true);
  expect(f.pane.onIntent(intent(f, { preset: "ellipse" }))).toBe(false);
});
