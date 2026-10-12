import { expect, test, vi } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet, type FloatingImage } from "../../workbook.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSetSheetProtectionCommand,
  createSetSheetFloatingImagesCommand,
  createSetFloatingImageCommand,
  createDeleteFloatingImageCommand,
  createSetCellContentCommand,
} from "../../commands/index.js";
import {
  canEditPictureRoot,
  canEditPictureSelection,
  canEditPictureForest,
  canChangePictureLock,
} from "../../picture-protection.js";
import { isPictureGroup } from "../../picture-group.js";
import { ungroupPictureRoot } from "../../picture-group-planning.js";
import { fixture as ownedFixture, resolvedNodes } from "../picture-group-edit/fixture.js";
import {
  leasePictureGroupNode,
  applyPictureGroupChildWorldEdit,
} from "../../picture-group-edit.js";
import { picture } from "../picture-group-planning/fixture.js";

function fixture(kind: "legacy" | "frame" | "group" = "legacy", unlocked = true) {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook),
    owned = ownedFixture();
  const root: FloatingImage =
    kind === "legacy"
      ? {
          id: "p",
          assetId: "synthetic",
          altText: "",
          anchor: { row: 0, column: 0 },
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 80,
        }
      : kind === "frame"
        ? picture("p", 20)
        : owned.root;
  if (unlocked) root.locked = false;
  sheet.floatingImages = [root];
  const run = (command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command);
  run(createSetSheetProtectionCommand(sheet.id, true, { editableRanges: [] }));
  return { session, sheet, root, owned, run };
}
test.each(["legacy", "frame", "group"] as const)(
  "existing unlocked %s can edit and delete in a protected sheet without Edit objects; history is exact",
  (kind) => {
    const f = fixture(kind),
      before = serializeWorkbook(f.session.workbook);
    expect(canEditPictureRoot(f.sheet, f.root)).toBe(true);
    expect(canChangePictureLock(f.sheet)).toBe(false);
    expect(canEditPictureSelection(f.sheet, [f.root.id])).toBe(true);
    expect(
      f.run(
        createSetFloatingImageCommand(f.sheet.id, {
          ...f.root,
          altTitle: "Edited",
          printObject: false,
        }),
      ),
    ).toBe(true);
    const edited = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(edited);
    expect(f.run(createDeleteFloatingImageCommand(f.sheet.id, f.root.id))).toBe(true);
    expect(f.sheet.floatingImages).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(edited);
  },
);
test.each(["legacy", "frame", "group"] as const)(
  "locked %s rejects edits and deletion atomically",
  (kind) => {
    const f = fixture(kind, false),
      before = serializeWorkbook(f.session.workbook),
      history = JSON.stringify(f.session.history);
    expect(canEditPictureRoot(f.sheet, f.root)).toBe(false);
    expect(() =>
      f.run(createSetFloatingImageCommand(f.sheet.id, { ...f.root, altTitle: "Refused" })),
    ).toThrow(/protected/);
    expect(() => f.run(createDeleteFloatingImageCommand(f.sheet.id, f.root.id))).toThrow(
      /protected/,
    );
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(JSON.stringify(f.session.history)).toBe(history);
  },
);
test("root behavior controls internal leaves, including nested old own values and release", () => {
  const f = fixture("group");
  f.owned.picture.locked = true;
  const group = f.sheet.floatingImages[0]!;
  if (!isPictureGroup(group)) throw Error("Bad fixture");
  const world = resolvedNodes(group, f.owned.metrics).picture.layout!;
  const edited = applyPictureGroupChildWorldEdit(
    group,
    leasePictureGroupNode(group, f.owned.path),
    { ...world, angleDeg: world.angleDeg + 15 },
    f.owned.metrics,
  );
  expect(f.run(createSetSheetFloatingImagesCommand(f.sheet.id, [edited]))).toBe(true);
  const released = ungroupPictureRoot(f.sheet.floatingImages, group.id, f.owned.metrics);
  expect(released.every((root) => root.locked === false)).toBe(true);
  expect(f.run(createSetSheetFloatingImagesCommand(f.sheet.id, released))).toBe(true);
  const locked = fixture("group", false);
  locked.owned.picture.locked = false;
  expect(
    canEditPictureForest(locked.sheet, [{ ...locked.root, altTitle: "Cannot bypass root" }]),
  ).toBe(false);
});
test("unknown IDs and changes to an effective lock are refused; Edit objects explicitly enables them", () => {
  const f = fixture(),
    before = serializeWorkbook(f.session.workbook),
    history = JSON.stringify(f.session.history);
  expect(() =>
    f.run(createSetFloatingImageCommand(f.sheet.id, { ...f.root, id: "new", locked: false })),
  ).toThrow(/protected/);
  expect(() =>
    f.run(createSetFloatingImageCommand(f.sheet.id, { ...f.root, locked: true })),
  ).toThrow(/protected/);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(JSON.stringify(f.session.history)).toBe(history);
  f.run(
    createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], editObjects: true }),
  );
  expect(canChangePictureLock(f.sheet)).toBe(true);
  expect(f.run(createSetFloatingImageCommand(f.sheet.id, { ...f.root, locked: true }))).toBe(true);
});
test("mixed batches cannot alter a locked root or borrow its owned member identity", () => {
  const f = fixture(),
    locked = picture("locked", 400);
  f.sheet.floatingImages.push(locked);
  const before = serializeWorkbook(f.session.workbook),
    history = JSON.stringify(f.session.history);
  expect(() =>
    f.run(
      createSetSheetFloatingImagesCommand(f.sheet.id, [
        { ...f.root, altTitle: "Uncommitted" },
        { ...locked, altTitle: "Refused" },
      ]),
    ),
  ).toThrow(/protected/);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(JSON.stringify(f.session.history)).toBe(history);
  const owner = ownedFixture();
  f.sheet.floatingImages.push(owner.root);
  const released = ungroupPictureRoot([owner.root], owner.root.id, owner.metrics).map((root) => ({
    ...root,
    locked: false,
  }));
  expect(canEditPictureForest(f.sheet, [f.root, ...released])).toBe(false);
  expect(canEditPictureSelection(f.sheet, [f.root.id, "locked"])).toBe(false);
  expect(canEditPictureSelection(f.sheet, [f.root.id, f.root.id])).toBe(false);
  expect(canEditPictureSelection(f.sheet, ["missing"])).toBe(false);
});
test("picture permissions never unlock a cell or enable the drawing collection", () => {
  const f = fixture(),
    before = serializeWorkbook(f.session.workbook);
  expect(() =>
    f.run(
      createSetCellContentCommand(
        f.sheet.id,
        { row: 0, column: 0 },
        { kind: "image", image: { assetId: "a", altText: "", locked: false } },
      ),
    ),
  ).toThrow(/protected/);
  expect(() => f.run({ type: "setSheetDrawings", sheetId: f.sheet.id, drawings: [] })).toThrow(
    /protected/,
  );
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
});
test("invalid lock accessors and inherited flags cannot unlock protected objects", () => {
  const f = fixture(),
    getter = vi.fn(() => false),
    bad = Object.defineProperty({ ...f.root }, "locked", { get: getter });
  expect(canEditPictureRoot(f.sheet, bad)).toBe(false);
  expect(canEditPictureForest(f.sheet, [bad])).toBe(false);
  expect(getter).not.toHaveBeenCalled();
  const inherited = Object.assign(Object.create({ locked: false }), f.root);
  delete inherited.locked;
  expect(canEditPictureRoot(f.sheet, inherited)).toBe(false);
  expect(canEditPictureForest(f.sheet, [inherited])).toBe(false);
});

test("permission selections reject accessor arrays without reading them", () => {
  const f = fixture(),
    getter = vi.fn(() => f.root.id),
    ids = [f.root.id];
  Object.defineProperty(ids, "0", { get: getter });
  expect(canEditPictureSelection(f.sheet, ids)).toBe(false);
  expect(getter).not.toHaveBeenCalled();
  expect(canEditPictureSelection(f.sheet, [])).toBe(false);
});
