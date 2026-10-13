import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { ungroupShapeRoot } from "../../shape-group-planning.js";
import { traverseShapeGroupVisibility, type ShapeGroupDrawing } from "../../shape-group.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { isSheetDrawingVisible, type SheetDrawing } from "../../sheet-drawings.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, leaf, metrics, nested } from "./fixtures.js";

function nestedFixture(): ShapeGroupDrawing {
  return {
    ...group("root"),
    hidden: true,
    members: [{ ...nested("inner"), members: [leaf("a"), leaf("b", "textBox")] }, leaf("c")],
  };
}
function visibleIds(roots: readonly SheetDrawing[]): string[] {
  return roots.flatMap((root) =>
    root.kind === "shapeGroup"
      ? traverseShapeGroupVisibility(root)
          .filter(({ visible }) => visible)
          .map(({ node }) => node.id)
      : isSheetDrawingVisible(root)
        ? [root.id]
        : [],
  );
}

describe("visibility when shape ownership is released", () => {
  test("root Ungroup transfers hidden only to each released root, then a second release keeps descendants hidden", () => {
    const source = nestedFixture(),
      before = structuredClone(source);
    const released = ungroupShapeRoot([source], "root", metrics());
    expect(released.map((root) => root.id)).toEqual(["inner", "c"]);
    expect(released.every((root) => !isSheetDrawingVisible(root))).toBe(true);
    const inner = released[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected released subgroup");
    expect(inner.hidden).toBe(true);
    expect(inner.members).toEqual(
      source.members[0]!.kind === "shapeGroup" ? source.members[0]!.members : [],
    );
    expect(inner.members.every((child) => !Object.hasOwn(child, "hidden"))).toBe(true);
    expect(visibleIds(released)).toEqual([]);
    const leaves = ungroupShapeRoot(released, "inner", metrics());
    expect(leaves.map((root) => root.id)).toEqual(["a", "b", "c"]);
    expect(visibleIds(leaves)).toEqual([]);
    expect(leaves.every((root) => Object.hasOwn(root, "hidden"))).toBe(true);
    expect(source).toEqual(before);
  });

  test("nested and recursive singleton deletion preserves removed-owner visibility on the actual survivor", () => {
    const root = nestedFixture();
    const promoted = planDeleteShapeGroupNodes([root], [["root", "c"]], metrics());
    expect(promoted.map((node) => node.id)).toEqual(["inner"]);
    expect(promoted[0]).toHaveProperty("hidden", true);
    expect(promoted[0]).not.toHaveProperty("members.0.hidden");
    expect(visibleIds(promoted)).toEqual([]);
    const cascade = planDeleteShapeGroupNodes(
      [root],
      [
        ["root", "c"],
        ["root", "inner", "b"],
      ],
      metrics(),
    );
    expect(cascade.map((node) => node.id)).toEqual(["a"]);
    expect(cascade[0]).toHaveProperty("hidden", true);
    expect(visibleIds(cascade)).toEqual([]);
    const inner = root.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected owner");
    delete root.hidden;
    inner.hidden = true;
    const retained = planDeleteShapeGroupNodes([root], [["root", "inner", "b"]], metrics());
    expect(retained[0]).toHaveProperty("members.0.id", "a");
    expect(retained[0]).toHaveProperty("members.0.hidden", true);
    expect(visibleIds(retained)).toEqual(["root", "c"]);
    delete inner.hidden;
    root.hidden = true;
    const inheritedOnly = planDeleteShapeGroupNodes([root], [["root", "inner", "b"]], metrics());
    expect(inheritedOnly[0]).not.toHaveProperty("members.0.hidden");
    expect(visibleIds(inheritedOnly)).toEqual([]);
  });

  test("release and singleton deletion retain exact command Undo/Redo, clone flags and snapshot64", () => {
    for (const action of ["ungroup", "delete"] as const) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      const source = nestedFixture();
      sheet.drawings = [source];
      const before = serializeWorkbook(session.workbook);
      const next =
        action === "ungroup"
          ? ungroupShapeRoot([source], "root", metrics())
          : planDeleteShapeGroupNodes(
              [source],
              [
                ["root", "c"],
                ["root", "inner", "b"],
              ],
              metrics(),
            );
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next))).toBe(
        true,
      );
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(64);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      expect(visibleIds(sheet.drawings!)).toEqual([]);
      let id = 0;
      const copy = cloneShapeRootsForClipboard(sheet.drawings!, {
        createId: () => `fresh-${++id}`,
      });
      expect(visibleIds(copy)).toEqual([]);
      expect(copy.map((root) => root.kind)).toEqual(next.map((root) => root.kind));
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });
});
