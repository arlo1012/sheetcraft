import { describe, expect, test } from "vitest";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import {
  collectShapeGroupAssetIds,
  isShapeGroupDrawing,
  traverseShapeGroup,
} from "../../shape-group.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { group, leaf, nested, textModel, texture } from "./fixtures.js";

function fixture() {
  const a = leaf("a");
  a.shapeStyle = { fill: { kind: "value", value: texture("body") } };
  a.shapeText = { ...textModel(), style: { fill: { kind: "value", value: texture("glyph") } } };
  const inner = { ...nested("inner"), members: [a] };
  return { ...group("root"), members: [inner, leaf("b", "textBox")] };
}
function ordinary(): SheetGraphicDrawing {
  const { groupFrame: _frame, ...appearance } = leaf("ordinary");
  return {
    ...appearance,
    kind: "icon",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 10,
    height: 20,
  };
}

describe("shape forest internal clipboard clone", () => {
  test("freshens every root/owner/leaf ID in source order while deeply detaching geometry and glyph assets", () => {
    const root = fixture(),
      roots = [ordinary(), root],
      before = structuredClone(roots);
    let calls = 0;
    const next = cloneShapeRootsForClipboard(roots, {
      createId: () => `fresh-${++calls}`,
      reservedIds: ["destination-chart", "destination-control"],
    });
    expect(calls).toBe(5);
    expect(next[0]!.id).toBe("fresh-1");
    const copied = next[1]!;
    if (!isShapeGroupDrawing(copied)) throw Error("Expected copied group");
    expect(traverseShapeGroup(copied).map(({ node }) => node.id)).toEqual([
      "fresh-2",
      "fresh-3",
      "fresh-4",
      "fresh-5",
    ]);
    expect([...collectShapeGroupAssetIds(copied)]).toEqual(["body", "glyph"]);
    expect(copied.members[0]!.groupFrame).toEqual(root.members[0]!.groupFrame);
    expect(copied.members[0]!.groupFrame).not.toBe(root.members[0]!.groupFrame);
    const inner = copied.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected nested owner");
    const source = root.members[0]!;
    if (source.kind !== "shapeGroup") throw Error("Expected source owner");
    const a = inner.members[0]!;
    if (a.kind === "shapeGroup") throw Error("Expected leaf");
    a.shapeText!.layout.marginsPt.leftPt = 999;
    expect((source.members[0] as ReturnType<typeof leaf>).shapeText!.layout.marginsPt.leftPt).toBe(
      1,
    );
    expect(roots).toEqual(before);
    expect(next[0]).not.toHaveProperty("shapeFrame");
  });
  test("all original and destination IDs, including ordinary drawings, are reserved before any mutation", () => {
    const roots = [ordinary(), fixture()],
      before = structuredClone(roots);
    for (const collision of ["root", "inner", "a", "ordinary", "destination-chart"])
      expect(() =>
        cloneShapeRootsForClipboard(roots, {
          createId: () => collision,
          reservedIds: ["destination-chart"],
        }),
      ).toThrow(/collision/);
    let calls = 0;
    expect(() =>
      cloneShapeRootsForClipboard(roots, {
        createId: () => {
          calls++;
          return "same";
        },
      }),
    ).toThrow(/collision/);
    expect(calls).toBe(2);
    expect(roots).toEqual(before);
  });
  test("malformed forests and invalid, inherited or accessor clone options reject before factory execution", () => {
    let calls = 0;
    const createId = () => {
      calls++;
      return `fresh-${calls}`;
    };
    const root = fixture();
    root.members[1]!.id = "a";
    expect(() => cloneShapeRootsForClipboard([root], { createId })).toThrow(/Duplicate/);
    const options = { createId };
    Object.defineProperty(options, "createId", {
      get: () => {
        calls++;
        return createId;
      },
    });
    expect(() => cloneShapeRootsForClipboard([fixture()], options)).toThrow(/data fields/);
    expect(() => cloneShapeRootsForClipboard([fixture()], Object.create({ createId }))).toThrow(
      /ordinary/,
    );
    expect(() => cloneShapeRootsForClipboard([fixture()], { createId, reservedIds: [""] })).toThrow(
      /non-empty/,
    );
    expect(calls).toBe(0);
    expect(() => cloneShapeRootsForClipboard([fixture()], { createId: () => "" })).toThrow(
      /non-empty/,
    );
    const sparse: string[] = Array(1);
    expect(() =>
      cloneShapeRootsForClipboard([fixture()], { createId, reservedIds: sparse }),
    ).toThrow(/dense/);
  });
});
