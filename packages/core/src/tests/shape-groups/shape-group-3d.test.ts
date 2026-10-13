import { describe, expect, expectTypeOf, test } from "vitest";
import type { Choice, PictureRotation3d } from "../../picture-detailed-style.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  materializeShapeGroup3dRelease,
  materializeShapeGroup3dReleaseChildren,
  resolveShapeGroup3dSource,
} from "../../shape-group-3d.js";
import {
  applyShapeGroup3dRotationEdit,
  leaseShapeGroup3dRotation,
  leaseShapeGroupNode,
  type ShapeGroup3dRotationLease,
} from "../../shape-group-edit.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { resolveShapeGroup } from "../../shape-group-layout.js";
import { resolveShapeRootLayout, ungroupShapeRoot } from "../../shape-group-planning.js";
import {
  areShapeGroupsEqual,
  cloneShapeGroup,
  normalizeShapeGroup,
  normalizeShapeGroup3d,
  normalizeShapeGroupChild,
  type ShapeGroup3d,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { normalizeSheetDrawing } from "../../sheet-drawings.js";
import { serializeWorkbook } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, metrics, nested, textModel } from "./fixtures.js";

export function camera(xDeg = 45): ShapeGroup3d {
  return {
    rotation3d: {
      kind: "value",
      value: {
        projection: "parallel",
        xDeg,
        yDeg: 0,
        zDeg: 0,
        distanceFromGroundPt: 0,
      },
    },
  };
}
function bodyLeaf(id: string) {
  const format3d = fullStyle().format3d!;
  if (format3d.kind !== "value") throw Error("Expected body format");
  return {
    ...leaf(id),
    shapeText: textModel(),
    shapeStyle: {
      rotation3d: camera(10).rotation3d,
      format3d: { ...format3d, value: { ...format3d.value, depthPt: 24 } },
    },
  };
}
function fixture(): ShapeGroupDrawing {
  return {
    ...group("root"),
    group3d: camera(),
    members: [
      {
        ...nested("inner"),
        group3d: { rotation3d: { kind: "none" } },
        members: [bodyLeaf("a"), bodyLeaf("b")],
      },
      bodyLeaf("c"),
    ],
  };
}

describe("shared group body camera source and lifecycle", () => {
  test("strict camera choice is detached, sparse and distinct from completed-alpha effects", () => {
    expectTypeOf<ShapeGroup3d["rotation3d"]>().toEqualTypeOf<Choice<PictureRotation3d>>();
    const input = fixture(),
      clone = cloneShapeGroup(input);
    expect(clone).toEqual(input);
    expect(clone.group3d).not.toBe(input.group3d);
    expect(clone.group3d!.rotation3d).not.toBe(input.group3d!.rotation3d);
    expect(areShapeGroupsEqual(input, clone)).toBe(true);
    clone.group3d = camera(30);
    expect(areShapeGroupsEqual(input, clone)).toBe(false);
    expect(normalizeShapeGroup3d(undefined)).toBeUndefined();
    expect(normalizeShapeGroup({ ...group(), group3d: undefined })).not.toHaveProperty("group3d");
    expect(normalizeShapeGroup3d({ rotation3d: { kind: "none" } })).toEqual({
      rotation3d: { kind: "none" },
    });
    expect(() => normalizeShapeGroup3d({ rotation3d: camera().rotation3d, format3d: {} })).toThrow(
      /Unknown/,
    );
  });

  test("effective camera is one exact owner with all sibling paths; canonical leaf values remain dormant", () => {
    const input = fixture(),
      before = structuredClone(input);
    const resolved = resolveShapeGroup3dSource(input, ["root", "inner", "a"]);
    expect(resolved).toEqual({
      rotation3d: camera().rotation3d,
      ownerPath: ["root"],
      source: "group",
      inherited: true,
      affectedLeafPaths: [
        ["root", "inner", "a"],
        ["root", "inner", "b"],
        ["root", "c"],
      ],
    });
    expect(resolveShapeGroup3dSource(input, ["root"]).inherited).toBe(false);
    expect(resolveShapeGroup3dSource(input, ["root", "inner"]).ownerPath).toEqual(["root"]);
    const editable = resolveShapeGroup(input, metrics()).members[0]!;
    if (!("members" in editable)) throw Error("Expected nested owner");
    expect(editable.members[0]!.node).toHaveProperty(
      "shapeStyle.rotation3d",
      camera(10).rotation3d,
    );
    expect(editable.members[0]!.node).not.toHaveProperty("group3d");
    expect(resolved.rotation3d).not.toBe(input.group3d!.rotation3d);
    expect(input).toEqual(before);
    expect(() => resolveShapeGroup3dSource(input, ["root", "a"])).toThrow(/missing|reparented/);
  });

  test("inner X30 updates shared owner in one exact lease with true scene scope", () => {
    const input = fixture(),
      lease = leaseShapeGroup3dRotation(input, ["root", "inner", "a"]);
    const result = applyShapeGroup3dRotationEdit(input, lease, camera(30).rotation3d);
    expect(result.ownerPath).toEqual(["root"]);
    expect(result.affectedLeafPaths).toHaveLength(3);
    expect(result.root.group3d).toEqual(camera(30));
    expect(resolveShapeGroup3dSource(result.root, ["root", "c"]).rotation3d).toEqual(
      camera(30).rotation3d,
    );
    expect(result.root).toHaveProperty(
      "members.0.members.0.shapeStyle.rotation3d",
      camera(10).rotation3d,
    );
    expect(result.root.shapeFrame).toEqual(input.shapeFrame);
    expect(input.group3d).toEqual(camera());
    expect(() => applyShapeGroup3dRotationEdit(result.root, lease, camera(20).rotation3d)).toThrow(
      /stale/,
    );
    expect(() =>
      applyShapeGroup3dRotationEdit(input, lease, {
        kind: "value",
        value: {},
      } as Choice<PictureRotation3d>),
    ).toThrow();
  });

  test.each(["append", "reparent", "same-id replacement", "camera change"] as const)(
    "shared camera edit rejects stale affected-subtree lease after %s without mutating source",
    (change) => {
      const input = fixture(),
        lease = leaseShapeGroup3dRotation(input, ["root", "c"]);
      const changed = cloneShapeGroup(input),
        inner = changed.members[0]!;
      if (inner.kind !== "shapeGroup") throw Error("Expected nested owner");
      if (change === "append") inner.members.push(bodyLeaf("added"));
      if (change === "reparent")
        inner.members = [{ ...nested("deeper"), members: [inner.members[0]!] }, inner.members[1]!];
      if (change === "same-id replacement")
        inner.members[0] = { ...bodyLeaf("a"), fill: "#00ccdd" };
      if (change === "camera change") changed.group3d = camera(20);
      const before = structuredClone(changed);
      expect(() => applyShapeGroup3dRotationEdit(changed, lease, camera(30).rotation3d)).toThrow(
        /stale/,
      );
      expect(changed).toEqual(before);
      const fresh = leaseShapeGroup3dRotation(changed, ["root", "c"]);
      expect(
        applyShapeGroup3dRotationEdit(changed, fresh, camera(30).rotation3d).root.group3d,
      ).toEqual(camera(30));
      expect(changed).toEqual(before);
    },
  );

  test("dedicated rotation leases require both exact own-data authorities and reject getters untouched", () => {
    const input = fixture(),
      before = structuredClone(input),
      lease = leaseShapeGroup3dRotation(input, ["root", "c"]);
    expect(lease.selectedNode.path).toEqual(["root", "c"]);
    expect(lease.cameraOwner.path).toEqual(["root"]);
    expect(lease.cameraOwner.node).toEqual(input);
    expect(lease.cameraOwner.node).not.toBe(input);
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const field of ["selectedNode", "cameraOwner"] as const) {
      const wrapper = { ...lease };
      Object.defineProperty(wrapper, field, { get: access });
      expect(() => applyShapeGroup3dRotationEdit(input, wrapper, camera(30).rotation3d)).toThrow(
        /data/,
      );
      const nodeLease = structuredClone(lease);
      Object.defineProperty(nodeLease[field], "node", { get: access });
      expect(() => applyShapeGroup3dRotationEdit(input, nodeLease, camera(30).rotation3d)).toThrow(
        /data/,
      );
    }
    for (const invalid of [
      Object.create(lease),
      { ...lease, extra: true },
      { selectedNode: lease.selectedNode },
      { ...lease, cameraOwner: leaseShapeGroupNode(input, ["root", "inner"]) },
      leaseShapeGroupNode(input, ["root", "c"]),
    ])
      expect(() =>
        applyShapeGroup3dRotationEdit(
          input,
          invalid as ShapeGroup3dRotationLease,
          camera(30).rotation3d,
        ),
      ).toThrow();
    expect(reads).toBe(0);
    expect(input).toEqual(before);
    const ordinary = cloneShapeGroup(input);
    delete ordinary.group3d;
    const own = leaseShapeGroup3dRotation(ordinary, ["root", "c"]);
    expect(own.cameraOwner).toEqual(own.selectedNode);
    expect(own.cameraOwner).not.toBe(own.selectedNode);
    const inner = ordinary.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected nested owner");
    inner.members.push(bodyLeaf("unrelated"));
    expect(applyShapeGroup3dRotationEdit(ordinary, own, camera(30).rotation3d).ownerPath).toEqual([
      "root",
      "c",
    ]);
  });

  test("none is dormant, does not mask an ancestor, and clearing does not claim old-state restoration", () => {
    const input = fixture(),
      cleared = applyShapeGroup3dRotationEdit(
        input,
        leaseShapeGroup3dRotation(input, ["root", "c"]),
        {
          kind: "none",
        },
      ).root;
    expect(cleared.group3d).toEqual({ rotation3d: { kind: "none" } });
    expect(resolveShapeGroup3dSource(cleared, ["root", "inner", "a"])).toMatchObject({
      source: "leaf",
      inherited: false,
      ownerPath: ["root", "inner", "a"],
      rotation3d: camera(10).rotation3d,
    });
    const ownEdit = applyShapeGroup3dRotationEdit(
      cleared,
      leaseShapeGroup3dRotation(cleared, ["root", "c"]),
      camera(30).rotation3d,
    );
    expect(ownEdit.ownerPath).toEqual(["root", "c"]);
    expect(ownEdit.affectedLeafPaths).toEqual([["root", "c"]]);
    expect(ownEdit.root.group3d).toEqual(cleared.group3d);
    const absent = group();
    expect(resolveShapeGroup3dSource(absent, [absent.id, absent.members[0]!.id])).toMatchObject({
      source: "absent",
      ownerPath: null,
    });
  });

  test("malformed, owner-ineligible, accessor and simultaneous nested scene payloads reject without getters", () => {
    const invalid: unknown[] = [
      null,
      [],
      {},
      { rotation3d: undefined },
      { rotation3d: { kind: "none", value: {} } },
      { rotation3d: { kind: "value", value: {} } },
      Object.create({ rotation3d: { kind: "none" } }),
      { rotation3d: camera().rotation3d, [Symbol("scene")]: 1 },
      {
        rotation3d: {
          kind: "value",
          value: { projection: "parallel", xDeg: NaN, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
        },
      },
    ];
    for (const scene of invalid) expect(() => normalizeShapeGroup3d(scene)).toThrow();
    const input = fixture(),
      inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected inner owner");
    inner.group3d = camera(30);
    expect(() => normalizeShapeGroup(input)).toThrow(/nested.*unsupported/);
    expect(() =>
      normalizeShapeGroupChild({ ...leaf(), group3d: camera() } as ShapeGroupChild),
    ).toThrow(/Unknown/);
    expect(() =>
      normalizeSheetDrawing({ ...legacyShapeDrawing(), group3d: camera() } as never),
    ).toThrow(/genuine shape group/);
    let reads = 0;
    for (const level of ["owner", "scene", "choice", "parameters"]) {
      const source = fixture(),
        scene = source.group3d!,
        choice = scene.rotation3d;
      if (choice.kind !== "value") throw Error("Expected camera");
      const target =
        level === "owner"
          ? source
          : level === "scene"
            ? scene
            : level === "choice"
              ? choice
              : choice.value;
      Object.defineProperty(
        target,
        level === "owner"
          ? "group3d"
          : level === "scene"
            ? "rotation3d"
            : level === "choice"
              ? "kind"
              : "xDeg",
        {
          get() {
            reads++;
            throw Error("Getter executed");
          },
        },
      );
      expect(() => normalizeShapeGroup(source)).toThrow(/data fields/);
    }
    expect(reads).toBe(0);
  });

  test("separate branch cameras remain independent and activation above one refuses atomically", () => {
    const input = {
      ...group("root"),
      members: [
        { ...nested("left"), group3d: camera(30) },
        { ...nested("right"), group3d: camera(45) },
      ],
    };
    const before = structuredClone(input);
    expect(normalizeShapeGroup(input)).toEqual(input);
    expect(resolveShapeGroup3dSource(input, ["root", "left", "left-leaf"]).ownerPath).toEqual([
      "root",
      "left",
    ]);
    expect(resolveShapeGroup3dSource(input, ["root", "right", "right-leaf"]).rotation3d).toEqual(
      camera(45).rotation3d,
    );
    expect(() =>
      applyShapeGroup3dRotationEdit(
        input,
        leaseShapeGroup3dRotation(input, ["root"]),
        camera(30).rotation3d,
      ),
    ).toThrow(/nested.*unsupported/);
    expect(input).toEqual(before);
  });

  test("Ungroup gives released leaves X30 and surviving 2D subgroups their new shared owner, retaining source frames/depth/flat", () => {
    const input = fixture();
    input.group3d = camera(30);
    const released = ungroupShapeRoot([input], "root", metrics());
    expect(released.map(({ id }) => id)).toEqual(["inner", "c"]);
    const subgroup = released[0]!;
    if (subgroup.kind !== "shapeGroup") throw Error("Expected subgroup");
    expect(subgroup.group3d).toEqual(camera(30));
    expect(subgroup).toHaveProperty("members.0.shapeStyle.rotation3d", camera(10).rotation3d);
    expect(resolveShapeGroup3dSource(subgroup, ["inner", "a"]).ownerPath).toEqual(["inner"]);
    expect(released[1]).toHaveProperty("shapeStyle.rotation3d", camera(30).rotation3d);
    const rootLayout = resolveShapeGroup(input, metrics());
    for (const child of rootLayout.members)
      expect(
        resolveShapeRootLayout(released.find(({ id }) => id === child.node.id)! as never, metrics())
          .rect,
      ).toEqual(child.layout!.rect);
    const leaves = ungroupShapeRoot(released, "inner", metrics());
    for (const body of leaves) {
      expect(body).toHaveProperty("shapeStyle.rotation3d", camera(30).rotation3d);
      expect(body).toHaveProperty("shapeStyle.format3d.value.depthPt", 24);
      expect(body).toHaveProperty("shapeText.layout.keepFlat", true);
      expect(body).not.toHaveProperty("group3d");
    }
  });

  test("nested release under an active outer scene keeps dormant own sources; source-path and duplicate release guards hold", () => {
    const input = fixture(),
      inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected inner owner");
    expect(materializeShapeGroup3dRelease(input, ["root", "inner"], inner.members[0]!)).toEqual(
      inner.members[0],
    );
    expect(() =>
      materializeShapeGroup3dRelease(input, ["root", "missing"], inner.members[0]!),
    ).toThrow(/exact/);
    expect(() =>
      materializeShapeGroup3dRelease(input, ["root", "inner"], input.members[1]!),
    ).toThrow(/reparented/);
    expect(() =>
      materializeShapeGroup3dReleaseChildren(
        input,
        ["root"],
        [input.members[1]!, input.members[1]!],
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      materializeShapeGroup3dRelease(input, ["root"], { ...inner, members: [leaf("new-id")] }),
    ).toThrow(/identities/);
  });

  test("singleton Delete shares the release boundary through nested promotion and recursive dissolution", () => {
    const input = fixture();
    input.group3d = camera(30);
    const promoted = planDeleteShapeGroupNodes([input], [["root", "c"]], metrics());
    expect(promoted[0]).toHaveProperty("group3d", camera(30));
    expect(promoted[0]).toHaveProperty("members.0.shapeStyle.rotation3d", camera(10).rotation3d);
    const retainedOuter = planDeleteShapeGroupNodes([input], [["root", "inner", "b"]], metrics());
    expect(retainedOuter[0]).toHaveProperty("group3d", camera(30));
    expect(retainedOuter[0]).toHaveProperty("members.0.id", "a");
    expect(retainedOuter[0]).toHaveProperty(
      "members.0.shapeStyle.rotation3d",
      camera(10).rotation3d,
    );
    const dissolved = planDeleteShapeGroupNodes(
      [input],
      [
        ["root", "c"],
        ["root", "inner", "b"],
      ],
      metrics(),
    );
    expect(dissolved).toHaveLength(1);
    expect(dissolved[0]).toHaveProperty("id", "a");
    expect(dissolved[0]).toHaveProperty("shapeStyle.rotation3d", camera(30).rotation3d);
    expect(dissolved[0]).toHaveProperty("shapeStyle.format3d.value.depthPt", 24);
    expect(dissolved[0]).not.toHaveProperty("group3d");
    const nestedCamera = fixture();
    delete nestedCamera.group3d;
    const owner = nestedCamera.members[0]!;
    if (owner.kind !== "shapeGroup") throw Error("Expected owner");
    owner.group3d = camera(30);
    const nestedDissolved = planDeleteShapeGroupNodes(
      [nestedCamera],
      [["root", "inner", "b"]],
      metrics(),
    );
    expect(nestedDissolved[0]).toHaveProperty(
      "members.0.shapeStyle.rotation3d",
      camera(30).rotation3d,
    );
  });

  test("camera edit and each release are deep-owned whole-forest transactions with exact Undo/Redo", () => {
    for (const action of ["edit", "ungroup", "delete"] as const) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook),
        input = fixture();
      sheet.drawings = [input];
      const before = serializeWorkbook(session.workbook);
      const next =
        action === "edit"
          ? [
              applyShapeGroup3dRotationEdit(
                input,
                leaseShapeGroup3dRotation(input, ["root", "c"]),
                camera(30).rotation3d,
              ).root,
            ]
          : action === "ungroup"
            ? ungroupShapeRoot([input], "root", metrics())
            : planDeleteShapeGroupNodes(
                [input],
                [
                  ["root", "c"],
                  ["root", "inner", "b"],
                ],
                metrics(),
              );
      const command = createSetSheetDrawingsCommand(sheet.id, next);
      expect(executeWorkbookCommand(session, command)).toBe(true);
      const after = serializeWorkbook(session.workbook);
      expect(executeWorkbookCommand(session, command)).toBe(false);
      expect(session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });
});
