import { describe, expect, test } from "vitest";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import { createSetSheetFloatingImagesCommand } from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { type GroupedGroup, type GroupedPicture } from "../../picture-group.js";
import { fixture } from "./fixture.js";

describe("Delete collection transaction and v48 durability", () => {
  test("nested contraction and dissolution are one transaction each with exact undo/redo snapshots", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    expect(before.version).toBe(48);
    const next = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "inner", "a"]],
      f.metrics,
    );
    expect(
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next)),
    ).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    const contracted = serializeWorkbook(f.session.workbook);
    expect(contracted.version).toBe(48);
    expect(serializeWorkbook(deserializeWorkbook(contracted))).toEqual(contracted);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(contracted);

    const dissolved = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "b"]],
      f.metrics,
    );
    expect(
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, dissolved)),
    ).toBe(true);
    const standalone = serializeWorkbook(f.session.workbook);
    expect(standalone.version).toBe(47);
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(contracted);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(standalone);
  });
  test("failed preflight leaves collection and history unchanged before command creation", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    expect(() => {
      const next = planDeletePictureGroupNodes(
        f.sheet.floatingImages,
        [["under"], ["root", "a"]],
        f.metrics,
      );
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next));
    }).toThrow(/missing|reparented/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    const inner = f.root.members[0] as GroupedGroup;
    (inner.members[1] as GroupedPicture).frame.source.widthRatio = Number.MAX_VALUE;
    const invalid = structuredClone(f.sheet.floatingImages);
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"]], f.metrics),
    ).toThrow();
    expect(f.sheet.floatingImages).toEqual(invalid);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
