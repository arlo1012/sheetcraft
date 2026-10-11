import { describe, expect, test } from "vitest";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import {
  MAX_PICTURE_GROUP_DEPTH,
  MAX_PICTURE_GROUP_NODES,
  type GroupedGroup,
  type GroupedPicture,
  type PictureGroupPath,
} from "../../picture-group.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { setSheetDimensionHidden } from "../../workbook.js";
import { fixture, group, leaf, picture } from "./fixture.js";

describe("atomic exact-path Delete validation", () => {
  test("object colors cannot execute coercion while validating a deleted source", () => {
    const f = fixture();
    let reads = 0;
    const color = {
      [Symbol.toPrimitive]() {
        reads++;
        return "#AABBCC";
      },
      toUpperCase() {
        reads++;
        return "#AABBCC";
      },
    } as unknown as string;
    for (const transform of [
      { appearance: { transparentColor: color } },
      { appearance: { border: { color, width: 1 } } },
      {
        annotations: [
          {
            kind: "arrow" as const,
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color,
            width: 0.02,
          },
        ],
      },
    ]) {
      const target = leaf("color");
      target.transform = transform;
      expect(() => planDeletePictureGroupNodes([group([target])], [["root"]], f.metrics)).toThrow(
        /color|border|annotation/,
      );
      const standalone = picture("standalone");
      standalone.transform = transform;
      expect(() => planDeletePictureGroupNodes([standalone], [[standalone.id]], f.metrics)).toThrow(
        /color|border|annotation/,
      );
    }
    expect(reads).toBe(0);
  });
  test("nested anchor accessors refuse even when their root is selected for deletion", () => {
    const f = fixture();
    let reads = 0;
    const axis = {
      get index() {
        reads++;
        return 1;
      },
      offset: 0,
    };
    f.root.frame.anchor = {
      mode: "move-only",
      origin: { column: axis, row: { index: 1, offset: 0 } },
      size: { width: 400, height: 200 },
    };
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"]], f.metrics),
    ).toThrow(/accessors/);
    expect(reads).toBe(0);
  });
  test("inherited annotation and point array methods never execute", () => {
    const f = fixture();
    const p = picture("standalone");
    let reads = 0;
    for (const onPoints of [false, true]) {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      const annotations = [{ kind: "arrow" as const, points, color: "#112233", width: 0.02 }];
      Object.setPrototypeOf(onPoints ? points : annotations, {
        map() {
          reads++;
          throw new Error("executed");
        },
      });
      p.transform = { annotations };
      expect(() => planDeletePictureGroupNodes([p], [[p.id]], f.metrics)).toThrow(/ordinary/);
      const target = leaf("annotated");
      target.transform = { annotations };
      expect(() => planDeletePictureGroupNodes([group([target])], [["root"]], f.metrics)).toThrow(
        /ordinary/,
      );
    }
    expect(reads).toBe(0);
  });
  test("ancestor and descendant selection plus duplicate targets delete only once", () => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    const next = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "inner", "a"], ["root", "inner"], ["root", "inner"], ["above"], ["above"]],
      f.metrics,
    );
    expect(next.map((root) => root.id)).toEqual(["under", "c"]);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(
      planDeletePictureGroupNodes(
        f.sheet.floatingImages,
        [["root"], ["root", "inner", "a"]],
        f.metrics,
      ).map((root) => root.id),
    ).toEqual(["under", "above"]);
  });
  test.each([
    { path: ["root", "missing"] },
    { path: ["root", "a"] },
    { path: ["under", "inner", "a"] },
    { path: ["root", "inner", "c"] },
    { path: [] },
    { path: ["root", ""] },
  ])(
    "missing/reparented or malformed path $path cannot be hidden by ancestor selection",
    ({ path }) => {
      const f = fixture();
      const before = structuredClone(f.sheet.floatingImages);
      expect(() =>
        planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"], path], f.metrics),
      ).toThrow();
      expect(f.sheet.floatingImages).toEqual(before);
    },
  );
  test("every tree and hidden source is derived-validated even if that root is deleted", () => {
    const f = fixture();
    const inner = f.root.members[0] as GroupedGroup;
    const hidden = inner.members[1] as GroupedPicture;
    hidden.hidden = true;
    hidden.frame.source.widthRatio = Number.MAX_VALUE;
    const before = structuredClone(f.sheet.floatingImages);
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"]], f.metrics),
    ).toThrow(/finite|representable/);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(() => planDeletePictureGroupNodes(f.sheet.floatingImages, [], f.metrics)).toThrow();
  });
  test("duplicate forest IDs and cyclic/shared ownership cannot be deleted around", () => {
    const f = fixture();
    const duplicate = [...f.sheet.floatingImages, picture("a")];
    expect(() => planDeletePictureGroupNodes(duplicate, [["root"]], f.metrics)).toThrow(
      /Duplicate/,
    );
    const inner = f.root.members[0] as GroupedGroup;
    inner.members.push(inner);
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"]], f.metrics),
    ).toThrow(/Cyclic/);
    const shared = leaf("shared");
    expect(() =>
      planDeletePictureGroupNodes([group([shared, shared])], [["root"]], f.metrics),
    ).toThrow(/shared/);
  });
  test("path and selection budgets reject before target lookup or pruning", () => {
    const f = fixture();
    expect(() =>
      planDeletePictureGroupNodes(
        f.sheet.floatingImages,
        [Array(MAX_PICTURE_GROUP_DEPTH + 2).fill("root")],
        f.metrics,
      ),
    ).toThrow(/budget/);
    expect(() =>
      planDeletePictureGroupNodes(
        f.sheet.floatingImages,
        Array(MAX_PICTURE_GROUP_NODES + 1).fill(["root"]),
        f.metrics,
      ),
    ).toThrow(/budget/);
  });
  test("selection, individual path and root-array overrides/accessors never execute", () => {
    const f = fixture();
    let reads = 0;
    const invoke = () => {
      reads++;
      throw Error("Should never execute");
    };
    const selections: PictureGroupPath[] = [["root"]];
    Object.defineProperty(selections, "map", { value: invoke });
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, selections, f.metrics),
    ).toThrow(/indexed data array/);
    const path = ["root", "inner", "a"];
    Object.defineProperty(path, "1", { get: invoke });
    expect(() => planDeletePictureGroupNodes(f.sheet.floatingImages, [path], f.metrics)).toThrow(
      /accessors/,
    );
    const roots = [f.root];
    Object.defineProperty(roots, Symbol.iterator, { value: invoke });
    expect(() => planDeletePictureGroupNodes(roots, [["root"]], f.metrics)).toThrow(
      /indexed data array/,
    );
    const sparse = ["root", "inner", "a"];
    delete sparse[1];
    expect(() => planDeletePictureGroupNodes(f.sheet.floatingImages, [sparse], f.metrics)).toThrow(
      /dense own data/,
    );
    Object.setPrototypeOf(sparse, {
      get 1() {
        return invoke();
      },
    });
    expect(() => planDeletePictureGroupNodes(f.sheet.floatingImages, [sparse], f.metrics)).toThrow(
      /ordinary indexed data array/,
    );
    expect(reads).toBe(0);
  });
  test("standalone metadata/appearance accessors refuse before reading even a deleted root", () => {
    const f = fixture();
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Should never read");
    };
    const root = picture("plain");
    Object.defineProperty(root, "id", { get: access });
    expect(() => planDeletePictureGroupNodes([root], [["plain"]], f.metrics)).toThrow(
      /data fields/,
    );
    const appearance = picture("plain");
    appearance.transform = { appearance: { opacity: 0.5 } };
    Object.defineProperty(appearance.transform.appearance!, "opacity", { get: access });
    expect(() => planDeletePictureGroupNodes([appearance], [["plain"]], f.metrics)).toThrow(
      /data fields/,
    );
    const ownership = group();
    Object.defineProperty(ownership, "members", { get: access });
    expect(() => planDeletePictureGroupNodes([ownership], [["root"]], f.metrics)).toThrow(
      /accessors/,
    );
    expect(reads).toBe(0);
  });
  test("collapsed owning trees permit root deletion and refuse owned edits atomically", () => {
    const root = group();
    root.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const f = fixture(root);
    setSheetDimensionHidden(f.sheet, "column", 0, true);
    const metrics = createPictureSheetMetrics(f.sheet);
    const before = structuredClone(f.sheet.floatingImages);
    expect(() =>
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root", "a"]], metrics),
    ).toThrow(/collapsed/);
    expect(() =>
      planDeletePictureGroupNodes(
        f.sheet.floatingImages,
        [["under"], ["root", "a"], ["root", "b"]],
        metrics,
      ),
    ).toThrow(/collapsed/);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["root"], ["root", "a"]], metrics).map(
        (node) => node.id,
      ),
    ).toEqual(["under", "above"]);
    expect(
      planDeletePictureGroupNodes(f.sheet.floatingImages, [["above"]], metrics).map(
        (node) => node.id,
      ),
    ).toEqual(["under", "root"]);
    expect(planDeletePictureGroupNodes(f.sheet.floatingImages, [], metrics)).toEqual(before);
  });
});
