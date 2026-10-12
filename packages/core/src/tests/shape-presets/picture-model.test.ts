import { expect, test, vi } from "vitest";
import { normalizePictureFrame } from "../../picture-frame.js";
import {
  normalizePictureGroupMemberFrame,
  isPictureGroup,
  findPictureGroupNode,
} from "../../picture-group.js";
import { isFramedPictureObject } from "../../picture-object.js";
import { groupPictureRoots, ungroupPictureRoot } from "../../picture-group-planning.js";
import { clonePictureRootsForClipboard } from "../../picture-group-copy.js";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  createSetSheetFloatingImagesCommand,
  createInsertSheetAxisCommand,
} from "../../commands/index.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { fixture, picture } from "../picture-group-planning/fixture.js";
import { fixture as nestedFixture } from "../picture-group-edit/fixture.js";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet } from "../../workbook.js";
const mask = { preset: "rightArrow", adjustments: { adj1: 40000, adj2: 70000 } } as const;

test("frame normalization detaches sparse shape metadata and rejects empty or unknown masks", () => {
  const frame = { ...picture("a", 0).frame, cropShape: mask };
  const normalized = normalizePictureFrame(frame);
  expect(normalized.cropShape).toEqual(mask);
  expect(normalized.cropShape).not.toBe(mask);
  expect(normalized.cropShape!.adjustments).not.toBe(mask.adjustments);
  expect(
    normalizePictureFrame({ ...frame, cropShape: { preset: "rect" } }).cropShape,
  ).toBeUndefined();
  for (const preset of ["line", "bentConnector3", "not-a-preset"])
    expect(() => normalizePictureFrame({ ...frame, cropShape: { preset } as never })).toThrow();
  expect(() =>
    normalizePictureFrame({
      ...frame,
      cropShape: { preset: "rightArrow", adjustments: { bad: 1 } },
    }),
  ).toThrow();
  const getter = vi.fn(() => mask);
  Object.defineProperty(frame, "cropShape", { get: getter });
  expect(() => normalizePictureFrame(frame)).toThrow(/accessor/);
  expect(getter).not.toHaveBeenCalled();
});
test("grouping and ungrouping retain editable masks, exact source/frame and angle", () => {
  const f = fixture(),
    a = f.sheet.floatingImages[0]!;
  if (!isFramedPictureObject(a)) throw Error("fixture");
  a.frame.cropShape = mask;
  const before = structuredClone(a.frame);
  const roots = groupPictureRoots(
    f.sheet.floatingImages,
    ["a", "b"],
    { id: "g", altText: "group" },
    f.metrics,
  );
  const g = roots.find(isPictureGroup)!;
  const child = findPictureGroupNode(g, ["g", "a"])!.node;
  if (child.kind !== "grouped-picture-v1") throw Error("leaf");
  expect(child.frame.cropShape).toEqual(mask);
  expect(child.frame.cropShape).not.toBe(mask);
  const released = ungroupPictureRoot(roots, "g", f.metrics).find((p) => p.id === "a")!;
  if (!isFramedPictureObject(released)) throw Error("frame");
  expect(released.frame.cropShape).toEqual(mask);
  expect(released.frame.source).toEqual(before.source);
  expect(released.frame.angleDeg).toBe(before.angleDeg);
  const copy = clonePictureRootsForClipboard(roots, {
    createId: (() => {
      let i = 0;
      return () => `copy-${++i}`;
    })(),
  });
  const copied = copy.find(isPictureGroup)!;
  expect(copied.members[0]!.frame).toEqual(g.members[0]!.frame);
  expect(copied.members[0]!.frame).not.toBe(g.members[0]!.frame);
});
test("singleton delete collapse retains the survivor mask and snapshot history", () => {
  const f = fixture(),
    a = f.sheet.floatingImages[0]!;
  if (!isFramedPictureObject(a)) throw Error("fixture");
  a.frame.cropShape = mask;
  const grouped = groupPictureRoots(
    f.sheet.floatingImages,
    ["a", "b"],
    { id: "g", altText: "group" },
    f.metrics,
  );
  const next = planDeletePictureGroupNodes(grouped, [["g", "b"]], f.metrics);
  const survivor = next.find((p) => p.id === "a")!;
  if (!isFramedPictureObject(survivor)) throw Error("frame");
  expect(survivor.frame.cropShape).toEqual(mask);
  const before = serializeWorkbook(f.session.workbook);
  expect(
    executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, grouped)),
  ).toBe(true);
  const after = serializeWorkbook(f.session.workbook);
  expect(after.version).toBe(52);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(after);
});
test("standalone and hidden nested masks select only version52 and persist through sheet inference", () => {
  for (const nested of [false, true]) {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    if (nested) {
      const f = nestedFixture();
      f.picture.frame.cropShape = mask;
      sheet.floatingImages = [f.root];
    } else
      sheet.floatingImages = [
        { ...picture("p", 0), frame: { ...picture("p", 0).frame, cropShape: mask } },
      ];
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(52);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(() => deserializeWorkbook({ ...snapshot, version: 51 })).toThrow(/version 52/);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 0, 1)),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook).version).toBe(52);
  }
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  expect(serializeWorkbook(session.workbook).version).toBe(43);
  sheet.floatingImages = [picture("p", 0)];
  expect(serializeWorkbook(session.workbook).version).toBe(47);
  Object.assign(sheet.floatingImages[0]!, { locked: false });
  expect(serializeWorkbook(session.workbook).version).toBe(51);
});
test("default or accessor mask fields cannot disappear through an old protocol", () => {
  const f = fixture(),
    snapshot = serializeWorkbook(f.session.workbook),
    root = snapshot.sheets[0]!.floatingImages[0]!;
  if (!isFramedPictureObject(root)) throw Error("fixture");
  for (const cropShape of [undefined, { preset: "rect" }]) {
    Object.assign(root.frame, { cropShape });
    expect(() => deserializeWorkbook({ ...snapshot, version: 51 })).toThrow(/version 52/);
  }
  const getter = vi.fn(() => mask);
  Object.defineProperty(root.frame, "cropShape", { get: getter });
  expect(() => deserializeWorkbook({ ...snapshot, version: 51 })).toThrow(/accessor/);
  expect(getter).not.toHaveBeenCalled();
  const nested = nestedFixture();
  expect(
    normalizePictureGroupMemberFrame({ ...nested.picture.frame, cropShape: mask }).cropShape,
  ).toEqual(mask);
});
