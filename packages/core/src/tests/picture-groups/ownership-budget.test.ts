import { describe, expect, test } from "vitest";
import {
  MAX_PICTURE_GROUP_DEPTH,
  MAX_PICTURE_GROUP_NODES,
  normalizePictureGroup,
  normalizePictureGroupCollection,
  type GroupedGroup,
  type PictureGroupChild,
} from "../../picture-group.js";
import { normalizePictureObjectCollection } from "../../picture-object.js";
import { group, leaf } from "./fixtures.js";

function chain(depth: number) {
  let child: PictureGroupChild = leaf("tip");
  for (let index = depth - 1; index > 0; index--) {
    child = {
      kind: "grouped-group-v1",
      id: `nested-${index}`,
      altText: "Nested",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
        angleDeg: 0,
      },
      members: [child],
    };
  }
  return { ...group(), members: [child] };
}
describe("bounded ownership preflight", () => {
  test("rejects accessor-backed ownership before reading or cloning the graph", () => {
    const value = group();
    let reads = 0;
    Object.defineProperty(value, "members", {
      get: () => {
        reads++;
        return [leaf()];
      },
    });
    expect(() => normalizePictureGroup(value)).toThrow(/accessors/);
    expect(reads).toBe(0);
    const indexed = group();
    Object.defineProperty(indexed.members, "0", {
      get: () => {
        reads++;
        return leaf();
      },
    });
    expect(() => normalizePictureGroup(indexed)).toThrow(/accessors/);
    expect(reads).toBe(0);
  });
  test("rejects overridden member iteration without executing an unbounded iterator", () => {
    const value = group();
    let reads = 0;
    Object.defineProperty(value.members, Symbol.iterator, {
      value: () => {
        reads++;
        throw Error("Must not iterate");
      },
    });
    expect(() => normalizePictureGroup(value)).toThrow(/indexed data array/);
    expect(reads).toBe(0);
  });
  test("rejects non-index member metadata and sparse inherited entries without reading them", () => {
    const value = group();
    Object.defineProperty(value.members, "4294967295", { value: leaf("lost") });
    expect(() => normalizePictureGroup(value)).toThrow(/indexed data array/);
    const sparse = group();
    delete sparse.members[0];
    let reads = 0;
    Object.setPrototypeOf(sparse.members, {
      get 0() {
        reads++;
        return leaf();
      },
    });
    expect(() => normalizePictureGroup(sparse)).toThrow(/dense own data/);
    expect(reads).toBe(0);
  });
  test("rejects root collection method overrides, accessors and holes before their execution", () => {
    let reads = 0;
    const override = [group()];
    Object.defineProperty(override, "map", {
      value: () => {
        reads++;
        return [];
      },
    });
    expect(() => normalizePictureObjectCollection(override)).toThrow(/only root entries/);
    const accessor = [group()];
    Object.defineProperty(accessor, "0", {
      get: () => {
        reads++;
        return group();
      },
    });
    expect(() => normalizePictureObjectCollection(accessor)).toThrow(/data fields/);
    const sparse = [group()];
    delete sparse[0];
    Object.setPrototypeOf(sparse, {
      get 0() {
        reads++;
        return group();
      },
    });
    expect(() => normalizePictureObjectCollection(sparse)).toThrow(/dense own data/);
    expect(reads).toBe(0);
  });
  test("nested geometry and fixed-shape image metadata reject getters or method overrides before evaluation", () => {
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const field of ["anchor", "source", "opacity", "border", "points", "point"] as const) {
      const value = group();
      const picture = leaf();
      value.members = [picture];
      picture.transform = {
        appearance: { opacity: 0.8, border: { color: "#AABBCC", width: 1 } },
        annotations: [{ kind: "pen", color: "#112233", width: 0.01, points: [{ x: 0.1, y: 0.2 }] }],
      };
      if (field === "anchor") Object.defineProperty(value.frame.anchor, "mode", { get: access });
      if (field === "source")
        Object.defineProperty(picture.frame.source, "widthRatio", { get: access });
      if (field === "opacity")
        Object.defineProperty(picture.transform.appearance!, "opacity", { get: access });
      if (field === "border")
        Object.defineProperty(picture.transform.appearance!.border!, "width", { get: access });
      if (field === "points")
        Object.defineProperty(picture.transform.annotations![0]!.points, "0", { get: access });
      if (field === "point")
        Object.defineProperty(picture.transform.annotations![0]!.points[0]!, "x", { get: access });
      expect(() => normalizePictureGroup(value)).toThrow(/accessors|data fields/);
    }
    const value = group();
    const picture = leaf();
    picture.transform = { annotations: [] };
    Object.defineProperty(picture.transform.annotations, "map", {
      value: () => {
        reads++;
        return [];
      },
    });
    value.members = [picture];
    expect(() => normalizePictureGroup(value)).toThrow(/indexed data array/);
    expect(reads).toBe(0);
  });
  test("inherited transform geometry or metadata cannot become a second source of truth", () => {
    const value = group();
    const picture = leaf();
    picture.transform = Object.assign(Object.create({ rotation: 90 }), {
      appearance: { opacity: 0.5 },
    });
    value.members = [picture];
    expect(() => normalizePictureGroup(value)).toThrow(/ordinary data record/);
  });
  test("accepts the declared depth and rejects one extra edge before recursive clone", () => {
    expect(() => normalizePictureGroup(chain(MAX_PICTURE_GROUP_DEPTH))).not.toThrow();
    expect(() => normalizePictureGroup(chain(MAX_PICTURE_GROUP_DEPTH + 1))).toThrow(/depth budget/);
  });
  test("accepts the exact node budget and rejects excess without truncation", () => {
    const value = {
      ...group(),
      members: Array.from({ length: MAX_PICTURE_GROUP_NODES - 1 }, (_, index) =>
        leaf(`leaf-${index}`),
      ),
    };
    expect(normalizePictureGroup(value).members).toHaveLength(MAX_PICTURE_GROUP_NODES - 1);
    value.members.push(leaf("extra"));
    expect(() => normalizePictureGroup(value)).toThrow(/node budget/);
    expect(value.members).toHaveLength(MAX_PICTURE_GROUP_NODES);
  });
  test("checks shared and cyclic node identities before any source is cloned", () => {
    const shared = leaf();
    expect(() => normalizePictureGroup({ ...group(), members: [shared, shared] })).toThrow(
      /shared/,
    );
    const nested = chain(2).members[0] as GroupedGroup;
    nested.members.push(nested);
    expect(() => normalizePictureGroup({ ...group(), members: [nested] })).toThrow(/Cyclic/);
    const one = group("one");
    const two = group("two");
    two.members = one.members;
    expect(() => normalizePictureGroupCollection([one, two])).toThrow(/shared/);
    let sourceReads = 0;
    const first = leaf("duplicate");
    Object.defineProperty(first.frame, "source", {
      get: () => {
        sourceReads++;
        throw new Error("Clone happened too early");
      },
      enumerable: true,
    });
    expect(() =>
      normalizePictureGroup({ ...group(), members: [first, leaf("duplicate")] }),
    ).toThrow(/Duplicate/);
    expect(sourceReads).toBe(0);
  });
  test("rejects duplicate IDs across descendants and separate roots", () => {
    expect(() => normalizePictureGroup({ ...group(), members: [leaf("group")] })).toThrow(
      /Duplicate/,
    );
    const one = group("one");
    const two = group("two");
    two.members[0]!.id = one.members[0]!.id;
    expect(() => normalizePictureGroupCollection([one, two])).toThrow(/Duplicate/);
  });
  test("rejects empty durable groups but retains singleton ownership", () => {
    expect(() => normalizePictureGroup({ ...group(), members: [] })).toThrow(/at least one/);
    expect(normalizePictureGroup({ ...group(), members: [leaf()] }).members).toHaveLength(1);
  });
});
