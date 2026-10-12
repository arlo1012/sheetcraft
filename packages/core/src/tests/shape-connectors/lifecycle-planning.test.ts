import { describe, expect, test, vi } from "vitest";
import { planCloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { canEditSheetDrawingCollection } from "../../shape-protection.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { groupShapeRoots } from "../../shape-group-planning.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import { metrics } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

function forest() {
  return [framedShape("rect"), framedShape("ellipse", "ellipse", 210, 110), connectorShape()];
}
function endpoints(values: ReturnType<typeof forest>) {
  const connection = resolveSheetShapeConnections(values, metrics()).getConnector("connector")!;
  if (connection.begin.status !== "ready" || connection.end.status !== "ready")
    throw Error("Expected ready tips");
  return { begin: connection.begin.position, end: connection.end.position };
}
describe("connector target Delete lifecycle", () => {
  test("deleting a root target preserves the surviving tip and untouched opposite binding", () => {
    const source = forest(),
      before = structuredClone(source),
      initial = endpoints(source);
    const next = planDeleteShapeGroupNodes(source, [["rect"]], metrics());
    expect(next.map((node) => node.id)).toEqual(["ellipse", "connector"]);
    const relation = resolveSheetShapeConnections(next, metrics()).getConnector("connector")!;
    expect(relation.begin).toMatchObject({
      status: "ready",
      kind: "free",
      position: initial.begin,
    });
    expect(relation.end).toMatchObject({
      status: "ready",
      kind: "site",
      targetId: "ellipse",
      position: initial.end,
    });
    expect(source).toEqual(before);
  });
  test("owned target deletion dissolves and reflows owners without moving either surviving endpoint", () => {
    const grouped = groupShapeRoots(
      forest(),
      ["rect", "connector"],
      { id: "owner", name: "Owner" },
      metrics(),
    );
    const owner = grouped.find((node) => node.id === "owner");
    if (owner?.kind !== "shapeGroup") throw Error("Expected owned root");
    owner.rotation = 37;
    const child = owner.members.find((node) => node.id === "connector");
    if (child?.kind !== "shape") throw Error("Expected connector leaf");
    child.shapeFlipX = true;
    child.shapeFlipY = true;
    const before = structuredClone(grouped);
    const initial = resolveSheetShapeConnections(grouped, metrics()).getConnector("connector")!;
    const next = planDeleteShapeGroupNodes(grouped, [["owner", "rect"]], metrics());
    expect(next.map((node) => node.id)).toEqual(["ellipse", "connector"]);
    const relation = resolveSheetShapeConnections(next, metrics()).getConnector("connector")!;
    expect(relation.begin).toMatchObject({ status: "ready", kind: "free" });
    expect(relation.end).toMatchObject({ status: "ready", kind: "site", targetId: "ellipse" });
    if (initial.begin.status !== "ready" || relation.begin.status !== "ready")
      throw Error("Expected ready begin");
    expect(relation.begin.position.x).toBeCloseTo(initial.begin.position.x, 9);
    expect(relation.begin.position.y).toBeCloseTo(initial.begin.position.y, 9);
    expect(grouped).toEqual(before);
  });
  test("simultaneously deleting a connector and its target does not require obsolete tip materialization", () => {
    const source = forest(),
      before = structuredClone(source);
    const next = planDeleteShapeGroupNodes(source, [["rect"], ["connector"]], metrics());
    expect(next.map((node) => node.id)).toEqual(["ellipse"]);
    expect(source).toEqual(before);
  });
});

describe("connector lifecycle copy and atomic history", () => {
  test("copying only the connector frees both external tips and reserves all original identities", () => {
    const source = forest(),
      before = structuredClone(source),
      initial = endpoints(source);
    const createId = vi.fn(() => "copy-connection");
    const copied = planCloneShapeRootsForClipboard(source, ["connector"], metrics(), { createId });
    expect(createId).toHaveBeenCalledTimes(1);
    const relation = resolveSheetShapeConnections(copied, metrics()).getConnector(
      "copy-connection",
    )!;
    expect(relation.begin).toMatchObject({ kind: "free", position: initial.begin });
    expect(relation.end).toMatchObject({ kind: "free", position: initial.end });
    expect(() =>
      planCloneShapeRootsForClipboard(source, ["connector"], metrics(), {
        createId: () => "ellipse",
      }),
    ).toThrow(/collision/);
    expect(source).toEqual(before);
  });
  test("mixed closure copy remaps the copied target and materializes only the external opposite tip", () => {
    const source = forest(),
      before = structuredClone(source),
      initial = endpoints(source);
    let count = 0;
    const copied = planCloneShapeRootsForClipboard(source, ["connector", "rect"], metrics(), {
      createId: () => `copy-${++count}`,
    });
    expect(copied.map((node) => node.id)).toEqual(["copy-1", "copy-2"]);
    const relation = resolveSheetShapeConnections(copied, metrics()).getConnector("copy-2")!;
    expect(relation.begin).toMatchObject({
      kind: "site",
      targetId: "copy-1",
      position: initial.begin,
    });
    expect(relation.end).toMatchObject({ kind: "free", position: initial.end });
    expect(source).toEqual(before);
  });
  test("copying an owned closure preserves its target relation while freeing references outside the owner", () => {
    const source = groupShapeRoots(
      forest(),
      ["rect", "connector"],
      { id: "owner", name: "Owner" },
      metrics(),
    );
    const before = structuredClone(source);
    const initial = resolveSheetShapeConnections(source, metrics()).getConnector("connector")!;
    let count = 0;
    const copied = planCloneShapeRootsForClipboard(source, ["owner"], metrics(), {
      createId: () => `copy-${++count}`,
    });
    const relation = resolveSheetShapeConnections(copied, metrics()).getConnector("copy-3")!;
    expect(relation.begin).toMatchObject({ kind: "site", targetId: "copy-2" });
    expect(relation.end).toMatchObject({ kind: "free" });
    if (initial.end.status !== "ready" || relation.end.status !== "ready")
      throw Error("Expected ready end");
    expect(relation.end.position.x).toBeCloseTo(initial.end.position.x, 9);
    expect(relation.end.position.y).toBeCloseTo(initial.end.position.y, 9);
    expect(source).toEqual(before);
  });
  test("invalid or stale root selections reject before the ID factory and never mutate source", () => {
    const source = forest(),
      before = structuredClone(source),
      createId = vi.fn(() => "new");
    for (const ids of [["rect", "rect"], ["missing"], [""]])
      expect(() => planCloneShapeRootsForClipboard(source, ids, metrics(), { createId })).toThrow();
    expect(createId).not.toHaveBeenCalled();
    expect(source).toEqual(before);
  });
  test("deleting a whole target owner detaches every surviving referenced descendant tip", () => {
    const source = groupShapeRoots(
      forest(),
      ["rect", "ellipse"],
      { id: "targets", name: "Targets" },
      metrics(),
    );
    const before = structuredClone(source);
    const next = planDeleteShapeGroupNodes(source, [["targets"]], metrics());
    expect(next.map((node) => node.id)).toEqual(["connector"]);
    const relation = resolveSheetShapeConnections(next, metrics()).getConnector("connector")!;
    expect(relation.begin).toMatchObject({ kind: "free" });
    expect(relation.end).toMatchObject({ kind: "free" });
    expect(source).toEqual(before);
  });
  test("target deletion and endpoint detachment undo and redo as one collection transaction", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = forest();
    const before = serializeWorkbook(session.workbook);
    const next = planDeleteShapeGroupNodes(sheet.drawings, [["rect"]], metrics());
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next));
    const after = serializeWorkbook(session.workbook);
    expect(session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
  test("ordinary target motion can leave a locked connector intact but detaching it still needs object permission", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const source = forest();
    source[0]!.shapeProperties = { locked: false };
    sheet.drawings = source;
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const moved = structuredClone(source);
    moved[0]!.shapeFrame.anchor = { mode: "fixed", x: 40, y: 20, size: { width: 100, height: 60 } };
    expect(canEditSheetDrawingCollection(sheet, moved)).toBe(true);
    const next = planDeleteShapeGroupNodes(source, [["rect"]], metrics());
    expect(canEditSheetDrawingCollection(sheet, next)).toBe(false);
    const before = serializeWorkbook(session.workbook);
    expect(() =>
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next)),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  });
});

describe("source-aware copy reservation budget", () => {
  test("keeps the full destination reservation allowance independent of source identities", () => {
    const source = [framedShape("static")];
    const reservedIds = Array.from({ length: 20_000 }, (_, index) => `destination-${index}`);
    const copied = planCloneShapeRootsForClipboard(source, ["static"], metrics(), {
      createId: () => "fresh",
      reservedIds,
    });
    expect(copied[0]!.id).toBe("fresh");
    expect(source[0]!.id).toBe("static");
  });
});
