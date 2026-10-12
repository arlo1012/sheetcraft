import { describe, expect, test } from "vitest";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  isPictureGroup,
  traversePictureGroup,
  type GroupedGroup,
} from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { canEditPictureForest } from "@sheetcraft/core/picture-protection";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { fixture, forestLayouts } from "./fixture";

describe("owned picture member Cut plans", () => {
  test("cuts a leaf with its original identity, source state and effective owner behavior", () => {
    const f = fixture();
    const owner = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(owner)) throw Error("Expected owner");
    Object.assign(owner, { locked: false, printObject: false });
    const nested = owner.members[1]! as GroupedGroup;
    Object.assign(nested.members[0]!, { altTitle: "叶标题", locked: true, printObject: true });
    const before = structuredClone(f.sheet.floatingImages);
    const oldLayouts = forestLayouts(before, f.metrics);
    const captured = f.capture("cut", ["nested-leaf"]);
    const plan = f.paste();
    expect(plan.roots.map((root) => root.id)).toEqual(["nested-leaf"]);
    expect(plan.nextForest.map((root) => root.id)).toEqual([
      "framed",
      "first-leaf",
      "nested-leaf",
      "legacy",
    ]);
    const moved = plan.roots[0]!;
    if (!isFramedPictureObject(moved)) throw Error("Expected extracted framed leaf");
    expect(moved).toMatchObject({
      id: "nested-leaf",
      assetId: "synthetic-asset",
      altTitle: "叶标题",
      hidden: true,
      locked: false,
      printObject: false,
      lockAspectRatio: true,
      transform: { appearance: { opacity: 0.65 } },
    });
    const original = captured.roots[0]!;
    if (!isFramedPictureObject(original)) throw Error("Expected captured framed leaf");
    expect(moved.frame.source).toEqual(original.frame.source);
    expect(moved.frame.flipHorizontal).toBe(true);
    expect(moved.frame.flipVertical).toBe(true);
    const nextLayouts = forestLayouts(plan.nextForest, f.metrics);
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(nextLayouts.get("first-leaf")!.rect[key]).toBeCloseTo(
        oldLayouts.get("first-leaf")!.rect[key],
        9,
      );
      expect(nextLayouts.get("nested-leaf")!.rect[key]).toBeCloseTo(
        oldLayouts.get("nested-leaf")!.rect[key] + (key === "x" ? 12 : key === "y" ? 18 : 0),
        9,
      );
    }
    expect(nextLayouts.get("nested-leaf")!.angleDeg).toBe(oldLayouts.get("nested-leaf")!.angleDeg);
    expect(plan.nextForest[0]).toEqual(before[0]);
    expect(plan.nextForest.at(-1)).toEqual(before.at(-1));
    expect(f.sheet.floatingImages).toEqual(before);
    expect(f.clipboard.getCurrent()).toEqual(captured);
  });

  test.each([false, true])(
    "nested singleton collapse preserves surviving world geometry (outer singleton %s)",
    (outerSingleton) => {
      const f = fixture();
      const owner = f.sheet.floatingImages[1]!;
      if (!isPictureGroup(owner)) throw Error("Expected owner");
      Object.assign(owner, { locked: false, printObject: false });
      const nested = owner.members[1]! as GroupedGroup;
      nested.hidden = true;
      const survivor = structuredClone(nested.members[0]!);
      survivor.id = "nested-survivor";
      survivor.hidden = false;
      survivor.frame.rect.xRatio += 0.3;
      nested.members.push(survivor);
      if (outerSingleton) owner.members = [nested];
      const before = structuredClone(f.sheet.floatingImages);
      const oldLayouts = forestLayouts(before, f.metrics);
      f.capture("cut", ["nested-leaf"]);
      const plan = f.paste();
      expect(plan.nextForest.map((root) => root.id)).toEqual([
        "framed",
        outerSingleton ? "nested-survivor" : "owned-group",
        "nested-leaf",
        "legacy",
      ]);
      const remaining = plan.nextForest[1]!;
      if (outerSingleton)
        expect(remaining).toMatchObject({
          id: "nested-survivor",
          hidden: true,
          locked: false,
          printObject: false,
        });
      else {
        if (!isPictureGroup(remaining)) throw Error("Expected contracted owner");
        expect(remaining.members.map((member) => member.id)).toEqual([
          "first-leaf",
          "nested-survivor",
        ]);
        expect(remaining.members[1]!.hidden).toBe(true);
      }
      const nextLayouts = forestLayouts(plan.nextForest, f.metrics);
      expect(nextLayouts.has("nested-group")).toBe(false);
      for (const id of outerSingleton ? ["nested-survivor"] : ["first-leaf", "nested-survivor"]) {
        for (const key of ["x", "y", "width", "height"] as const)
          expect(nextLayouts.get(id)!.rect[key]).toBeCloseTo(oldLayouts.get(id)!.rect[key], 9);
        expect(nextLayouts.get(id)!.angleDeg).toBeCloseTo(oldLayouts.get(id)!.angleDeg, 9);
      }
      expect(f.sheet.floatingImages).toEqual(before);
    },
  );

  test("cuts a subgroup as a complete source-free tree, preserving owned order and world geometry", () => {
    const f = fixture();
    const owner = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(owner)) throw Error("Expected owner");
    owner.hidden = true;
    const before = structuredClone(f.sheet.floatingImages);
    const oldLayouts = forestLayouts(before, f.metrics);
    const captured = f.capture("cut", ["nested-leaf", "nested-group"]);
    const plan = f.paste();
    const moved = plan.roots[0]!;
    if (!isPictureGroup(moved)) throw Error("Expected extracted subgroup");
    expect(captured.selectedPaths).toEqual([["owned-group", "nested-group"]]);
    expect(moved.id).toBe("nested-group");
    expect(moved).not.toHaveProperty("assetId");
    expect(moved.hidden).toBe(true);
    expect(moved.members).toEqual((owner.members[1]! as GroupedGroup).members);
    const nextLayouts = forestLayouts(plan.nextForest, f.metrics);
    for (const id of ["nested-group", "nested-leaf"]) {
      for (const key of ["x", "y", "width", "height"] as const)
        expect(nextLayouts.get(id)!.rect[key]).toBeCloseTo(
          oldLayouts.get(id)!.rect[key] + (key === "x" ? 12 : key === "y" ? 18 : 0),
          9,
        );
      expect(nextLayouts.get(id)!.angleDeg).toBeCloseTo(oldLayouts.get(id)!.angleDeg, 9);
    }
    expect(plan.nextForest[1]).toMatchObject({ id: "first-leaf", hidden: true });
    expect(f.sheet.floatingImages).toEqual(before);
  });

  test.each([
    { selectedIds: ["legacy", "nested-leaf"] },
    { selectedIds: ["nested-leaf", "first-leaf"] },
    { selectedIds: ["legacy", "nested-leaf", "owned-group"] },
  ])(
    "mixed selection $selectedIds keeps root slots and validated ancestor deduplication",
    ({ selectedIds }) => {
      const f = fixture();
      const before = structuredClone(f.sheet.floatingImages);
      const captured = f.capture("cut", selectedIds);
      const plan = f.paste();
      expect(plan.roots.map((root) => root.id)).toEqual(captured.roots.map((root) => root.id));
      expect(plan.nextForest.map((root) => root.id)).toEqual(
        selectedIds.includes("owned-group")
          ? ["framed", "owned-group", "legacy"]
          : ["framed", "first-leaf", "nested-leaf", "legacy"],
      );
      const ids = plan.nextForest.flatMap((root) =>
        isPictureGroup(root) ? traversePictureGroup(root).map(({ node }) => node.id) : [root.id],
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(plan.nextForest[0]).toEqual(before[0]);
      expect(f.sheet.floatingImages).toEqual(before);
    },
  );

  test("complete detached leaf-Cut forest is one Core transaction with exact undo and redo", () => {
    const f = fixture();
    const workbook = createWorkbook({ id: "clipboard-workbook", sheetId: f.sheet.id });
    workbook.sheets.set(f.sheet.id, f.sheet);
    const session = createWorkbookSession({ workbook, idFactory: (prefix) => `${prefix}-unused` });
    const before = structuredClone(f.sheet.floatingImages);
    f.capture("cut", ["nested-leaf"]);
    const plan = f.paste();
    const planned = structuredClone(plan.nextForest);
    const command = createSetSheetFloatingImagesCommand(f.sheet.id, plan.nextForest);
    plan.nextForest[0]!.altText = "Changed returned plan";
    expect(f.sheet.floatingImages).toEqual(before);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(f.clipboard.complete(plan, true)).toBe(true);
    expect(f.sheet.floatingImages).toEqual(planned);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(f.sheet.floatingImages).toEqual(planned);
  });

  test("existing unlocked ownership may release without new-ID or locked-owner exemptions", () => {
    const f = fixture();
    const owner = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(owner)) throw Error("Expected owner");
    owner.locked = false;
    f.sheet.properties.protected = true;
    f.capture("cut", ["nested-leaf"]);
    const plan = f.paste();
    expect(canEditPictureForest(f.sheet, plan.nextForest)).toBe(true);
    const forged = structuredClone(plan.nextForest);
    forged[2]!.id = "new-leaf";
    expect(canEditPictureForest(f.sheet, forged)).toBe(false);
    forged[2]!.id = "nested-leaf";
    forged[2]!.locked = true;
    expect(canEditPictureForest(f.sheet, forged)).toBe(false);

    owner.locked = true;
    f.capture("cut", ["nested-leaf"]);
    const lockedPlan = f.paste();
    const original = structuredClone(f.sheet.floatingImages);
    const workbook = createWorkbook({ id: "protected-workbook", sheetId: f.sheet.id });
    workbook.sheets.set(f.sheet.id, f.sheet);
    const session = createWorkbookSession({ workbook, idFactory: (prefix) => `${prefix}-unused` });
    expect(canEditPictureForest(f.sheet, lockedPlan.nextForest)).toBe(false);
    expect(() =>
      executeWorkbookCommand(
        session,
        createSetSheetFloatingImagesCommand(f.sheet.id, lockedPlan.nextForest),
      ),
    ).toThrow(/protected/);
    expect(f.sheet.floatingImages).toEqual(original);
    expect(session.history.undoStack).toHaveLength(0);
    expect(f.clipboard.complete(lockedPlan, false)).toBe(false);
    expect(f.clipboard.getCurrent()).toBeDefined();
  });
});
