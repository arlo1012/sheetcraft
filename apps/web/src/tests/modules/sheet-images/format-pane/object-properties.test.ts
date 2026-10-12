import { expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { cropOwnerFixture } from "./crop-owner-fixture";

test.each(["legacy", "framed", "owned-group"])(
  "%s title and root behavior are real single-command edits",
  (id) => {
    const f = cropOwnerFixture(id),
      snapshot = f.pane.snapshot.value!;
    expect(snapshot.values).toMatchObject({ altTitle: "", locked: true, printObject: true });
    for (const key of ["altTitle", "altDescription", "locked", "printObject"] as const)
      expect(f.pane.capabilities.value.fields[key]?.enabled).toBe(true);
    const before = serializeWorkbook(f.session.workbook);
    expect(f.pane.onIntent(f.field("altTitle", "合成标题 Ω"))).toBe(true);
    expect(f.sheet.floatingImages.find((x) => x.id === id)?.altTitle).toBe("合成标题 Ω");
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    expect(f.pane.onIntent(f.field("printObject", false))).toBe(true);
    expect(f.pane.onIntent(f.field("locked", false))).toBe(true);
    expect(f.pane.onIntent(f.field("altTitle", ""))).toBe(true);
    const root = f.sheet.floatingImages.find((x) => x.id === id)!;
    expect(root).toMatchObject({ locked: false, printObject: false });
    expect(root).not.toHaveProperty("altTitle");
    f.scope.stop();
  },
);
test("owned properties display the root's behavior and cannot independently change child locking/printing", () => {
  const f = cropOwnerFixture("owned-group", ["owned-group", "owned-leaf"]),
    root = f.sheet.floatingImages[0]!;
  if (!isPictureGroup(root)) throw Error("Bad fixture");
  Object.assign(root, { locked: false, printObject: false });
  expect(f.pane.snapshot.value!.values).toMatchObject({
    locked: false,
    printObject: false,
    altTitle: "",
  });
  expect(f.pane.capabilities.value.fields.locked?.enabled).toBe(false);
  expect(f.pane.capabilities.value.fields.printObject?.enabled).toBe(false);
  const before = serializeWorkbook(f.session.workbook);
  expect(f.pane.onIntent(f.field("locked", true))).toBe(false);
  expect(f.pane.onIntent(f.field("printObject", true))).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.pane.onIntent(f.field("altTitle", "叶标题"))).toBe(true);
  const result = f.sheet.floatingImages[0]!;
  expect(isPictureGroup(result) && result.members[0]!.altTitle).toBe("叶标题");
  f.scope.stop();
});
test("protected Edit objects allows changing Locked, while a denied or malformed intent keeps the draft owner and history", () => {
  const f = cropOwnerFixture();
  f.sheet.properties.protected = true;
  f.sheet.protection = { editableRanges: [], editObjects: true };
  expect(f.pane.capabilities.value.fields.locked?.enabled).toBe(true);
  expect(f.pane.onIntent(f.field("locked", false))).toBe(true);
  const before = serializeWorkbook(f.session.workbook),
    history = f.session.history.undoStack.length;
  expect(f.pane.onIntent(f.field("printObject", 0 as never))).toBe(false);
  expect(f.pane.onIntent(f.field("altTitle", false as never))).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(history);
  f.scope.stop();
});
