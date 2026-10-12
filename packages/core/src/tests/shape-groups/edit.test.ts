import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "../../picture-frame.js";
import {
  applyShapeGroupChildWorldEdit,
  deduplicateShapeGroupPaths,
  leaseShapeGroupNode,
} from "../../shape-group-edit.js";
import {
  findShapeGroupNode,
  normalizeShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "../../shape-group.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "../../shape-group-layout.js";
import { group, leaf, metrics, nested, textModel } from "./fixtures.js";

function fixture() {
  const a = {
    ...leaf("a"),
    rotation: 37,
    shapeText: textModel(),
    shapeProperties: { altTitle: "Original" },
  };
  const inner = { ...nested("inner"), members: [a, leaf("inside-sibling")] };
  const root = { ...group("root"), rotation: 37, members: [inner, leaf("root-sibling")] };
  return { root, inner, a, path: ["root", "inner", "a"] };
}
function resolvedNode(root: ShapeGroupDrawing, path: ShapeGroupPath): ResolvedShapeGroupNode {
  function find(node: ResolvedShapeGroupNode): ResolvedShapeGroupNode | undefined {
    if (node.path.join("/") === path.join("/")) return node;
    if ("members" in node)
      for (const child of node.members) {
        const found = find(child);
        if (found) return found;
      }
    return undefined;
  }
  const found = find(resolveShapeGroup(root, metrics()));
  if (!found) throw Error("Missing test node");
  return found;
}

describe("source-free shape member compare-and-swap world edits", () => {
  test("nested rotated inverse placement preserves leaf appearance and never contracts its owner", () => {
    const f = fixture(),
      before = structuredClone(f.root);
    const world = resolvePictureLayout({ x: 400, y: -100, width: 216, height: 144 }, 74);
    const parent = resolvedNode(f.root, ["root", "inner"]).layout!;
    const placement = placeShapeGroupChild(parent, world);
    if (placement.status !== "placed") throw Error("Expected placement");
    const next = applyShapeGroupChildWorldEdit(
      f.root,
      leaseShapeGroupNode(f.root, f.path),
      world,
      metrics(),
    );
    const child = findShapeGroupNode(next, f.path)!.node as ShapeGroupChild;
    expect(child.groupFrame).toEqual(placement.groupFrame);
    expect(child.rotation).toBe(placement.rotation);
    expect({ ...child, groupFrame: f.a.groupFrame, rotation: f.a.rotation }).toEqual(f.a);
    expect(next.shapeFrame).toEqual(f.root.shapeFrame);
    expect(
      (findShapeGroupNode(next, ["root", "inner"])!.node as ShapeGroupChild).groupFrame,
    ).toEqual(f.inner.groupFrame);
    const resolved = resolvedNode(next, f.path).layout!;
    resolved.corners.forEach((point, index) => {
      expect(point.x).toBeCloseTo(world.corners[index]!.x, 9);
      expect(point.y).toBeCloseTo(world.corners[index]!.y, 9);
    });
    expect(f.root).toEqual(before);
  });
  test("repeated exact geometry no-ops and metadata-only changes preserve local numeric storage", () => {
    const f = fixture();
    let next: ShapeGroupDrawing = f.root;
    for (let count = 0; count < 15; count++)
      next = applyShapeGroupChildWorldEdit(
        next,
        leaseShapeGroupNode(next, f.path),
        resolvedNode(next, f.path).layout!,
        metrics(),
      );
    expect(next).toEqual(normalizeShapeGroup(f.root));
    next = applyShapeGroupChildWorldEdit(
      next,
      leaseShapeGroupNode(next, f.path),
      resolvedNode(next, f.path).layout!,
      metrics(),
      { metadata: { name: "Updated", shapeProperties: {} } },
    );
    const child = findShapeGroupNode(next, f.path)!.node as ShapeGroupChild;
    expect(child.groupFrame).toEqual(f.a.groupFrame);
    expect(child).not.toHaveProperty("shapeProperties");
    expect(child.name).toBe("Updated");
    expect(f.a.shapeProperties.altTitle).toBe("Original");
  });
  test("target changes, owner placement changes, reordered siblings and reparented paths invalidate leases", () => {
    for (const scenario of ["appearance", "owner", "order", "reparent"]) {
      const f = fixture(),
        lease = leaseShapeGroupNode(f.root, f.path);
      const world = resolvedNode(f.root, f.path).layout!;
      if (scenario === "appearance") f.a.text = "Concurrent text";
      if (scenario === "owner") f.root.rotation = 13;
      if (scenario === "order") f.inner.members.reverse();
      if (scenario === "reparent") {
        f.inner.members.shift();
        f.root.members.push(f.a);
      }
      expect(() => applyShapeGroupChildWorldEdit(f.root, lease, world, metrics())).toThrow(
        /stale|missing|reparented/,
      );
    }
  });
  test("container world resizing retains its full child tree and changes orthogonal dimensions only", () => {
    const f = fixture(),
      path = ["root", "inner"];
    const world = resolvePictureLayout({ x: -200, y: 400, width: 800, height: 180 }, 323);
    const next = applyShapeGroupChildWorldEdit(
      f.root,
      leaseShapeGroupNode(f.root, path),
      world,
      metrics(),
    );
    const owner = findShapeGroupNode(next, path)!.node;
    if (owner.kind !== "shapeGroup") throw Error("Expected owner");
    expect(owner.members).toEqual(f.inner.members);
    const child = resolvedNode(next, f.path).layout!;
    expect(child.angleDeg).toBe(0);
    expect(child.rect.width).toBe(400);
    expect(child.rect.height).toBe(90);
    expect((findShapeGroupNode(next, f.path)!.node as typeof f.a).fontSize).toBe(19);
  });
  test("replacement retains kind/ID and container membership while leaf text/style may be replaced", () => {
    const f = fixture(),
      world = resolvedNode(f.root, f.path).layout!;
    const next = applyShapeGroupChildWorldEdit(
      f.root,
      leaseShapeGroupNode(f.root, f.path),
      world,
      metrics(),
      { replacement: { ...f.a, text: "New text", fontSize: 24 } },
    );
    expect(findShapeGroupNode(next, f.path)!.node).toMatchObject({
      text: "New text",
      fontSize: 24,
    });
    for (const replacement of [
      { ...f.a, id: "other" },
      { ...f.a, kind: "textBox" as const },
    ])
      expect(() =>
        applyShapeGroupChildWorldEdit(
          f.root,
          leaseShapeGroupNode(f.root, f.path),
          world,
          metrics(),
          { replacement },
        ),
      ).toThrow(/kind and ID/);
    const path = ["root", "inner"];
    expect(() =>
      applyShapeGroupChildWorldEdit(
        f.root,
        leaseShapeGroupNode(f.root, path),
        resolvedNode(f.root, path).layout!,
        metrics(),
        { replacement: { ...f.inner, members: [...f.inner.members].reverse() } },
      ),
    ).toThrow(/owned members/);
  });
  test("selection pruning checks every stale path first and keeps selected ancestors in input order", () => {
    const f = fixture();
    expect(
      deduplicateShapeGroupPaths(f.root, [
        f.path,
        ["root", "inner"],
        ["root", "root-sibling"],
        ["root", "inner"],
      ]),
    ).toEqual([
      ["root", "inner"],
      ["root", "root-sibling"],
    ]);
    expect(() => deduplicateShapeGroupPaths(f.root, [["root"], ["root", "missing"]])).toThrow(
      /missing/,
    );
    const lease = leaseShapeGroupNode(f.root, f.path);
    expect(lease.node).not.toBe(f.a);
    lease.node.name = "Changed detached lease";
    expect(f.a.name).toBe("Shape a");
    expect(() =>
      applyShapeGroupChildWorldEdit(
        f.root,
        leaseShapeGroupNode(f.root, ["root"]),
        resolveShapeGroup(f.root, metrics()).layout,
        metrics(),
      ),
    ).toThrow(/immediate/);
  });
  test("explicit resize enforces target and descendant size limits while subpixel no-ops stay recoverable", () => {
    const f = fixture(),
      path = ["root", "inner"],
      before = structuredClone(f.root);
    const old = resolvedNode(f.root, path).layout!;
    expect(() =>
      applyShapeGroupChildWorldEdit(
        f.root,
        leaseShapeGroupNode(f.root, path),
        resolvePictureLayout({ ...old.rect, width: 1, height: 1 }, old.angleDeg),
        metrics(),
      ),
    ).toThrow(/Shape frame size/);
    expect(() =>
      applyShapeGroupChildWorldEdit(
        f.root,
        leaseShapeGroupNode(f.root, path),
        resolvePictureLayout({ ...old.rect, width: 20000 }, old.angleDeg),
        metrics(),
      ),
    ).toThrow();
    expect(f.root).toEqual(before);
    f.a.groupFrame.rect.widthRatio = 0.001;
    const lease = leaseShapeGroupNode(f.root, f.path),
      world = resolvedNode(f.root, f.path).layout!;
    expect(world.rect.width).toBeLessThan(1);
    expect(applyShapeGroupChildWorldEdit(f.root, lease, world, metrics())).toEqual(
      normalizeShapeGroup(f.root),
    );
  });
});
