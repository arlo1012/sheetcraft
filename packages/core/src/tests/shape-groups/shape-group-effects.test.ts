import { describe, expect, expectTypeOf, test } from "vitest";
import {
  areShapeGroupChildrenEqual,
  areShapeGroupsEqual,
  cloneShapeGroup,
  cloneShapeGroupChild,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  normalizeShapeGroupEffects,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupEffects,
  type ShapeGroupedGroup,
} from "../../shape-group.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { ungroupShapeRoot } from "../../shape-group-planning.js";
import { normalizeShapeStyle, type ShapeDetailedStyle } from "../../shape-style.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, metrics, nested } from "./fixtures.js";

function assertDetached(source: unknown, target: unknown): void {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}

describe("owned shape group body shadows", () => {
  test("reuses the exact shadow type and normalization for every branch and explicit none", () => {
    expectTypeOf<ShapeGroupEffects["shadow"]>().toEqualTypeOf<ShapeDetailedStyle["shadow"]>();
    const perspective = fullStyle().shadow!;
    if (perspective.kind !== "value" || perspective.value.kind !== "perspective")
      throw Error("Expected perspective shadow");
    const {
      scaleX: _scaleX,
      scaleY: _scaleY,
      skewXDeg: _skew,
      originX: _originX,
      originY: _originY,
      ...base
    } = perspective.value;
    const effects: ShapeGroupEffects[] = [
      { shadow: perspective },
      { shadow: { kind: "none" } },
      ...(["outer", "inner"] as const).map((kind) => ({
        shadow: {
          kind: "value" as const,
          value: { ...base, kind, angleDeg: -45, color: { kind: "automatic" as const } },
        },
      })),
    ];
    for (const input of effects) {
      const normalized = normalizeShapeGroupEffects(input);
      expect(normalized).toEqual(normalizeShapeStyle(input));
      assertDetached(input, normalized);
    }
    expect(normalizeShapeGroupEffects(undefined)).toBeUndefined();
    expect(normalizeShapeGroupEffects({})).toBeUndefined();
  });

  test("root and nested shadows clone recursively, participate in equality and never inherit", () => {
    const inner: ShapeGroupedGroup = {
      ...nested("inner"),
      groupEffects: { shadow: { kind: "none" } },
    };
    const input = {
      ...group(),
      groupEffects: { shadow: fullStyle().shadow },
      members: [inner, nested("plain"), leaf("leaf")],
    };
    const clone = cloneShapeGroup(input);
    expect(clone).toEqual(input);
    assertDetached(input, clone);
    expect(areShapeGroupsEqual(input, clone)).toBe(true);
    expect(areShapeGroupChildrenEqual(inner, cloneShapeGroupChild(inner))).toBe(true);
    const visits = traverseShapeGroup(clone);
    expect(visits[0]!.node).toBe(clone);
    expect(visits[1]!.node).toBe(clone.members[0]);
    expect(visits[1]!.node).toHaveProperty("groupEffects.shadow.kind", "none");
    expect(clone.members[1]).not.toHaveProperty("groupEffects");
    expect(clone.members[2]).not.toHaveProperty("groupEffects");
    const changedInner = cloneShapeGroupChild(inner);
    delete changedInner.groupEffects;
    expect(areShapeGroupChildrenEqual(inner, changedInner)).toBe(false);
    clone.members[0] = changedInner;
    expect(areShapeGroupsEqual(input, clone)).toBe(false);
    expect(normalizeShapeGroup({ ...group(), groupEffects: {} })).not.toHaveProperty(
      "groupEffects",
    );
    expect(normalizeShapeGroupChild({ ...nested(), groupEffects: {} })).not.toHaveProperty(
      "groupEffects",
    );
  });

  test("rejects every other effect category, paint, theme binding and source field", () => {
    for (const key of [
      "fill",
      "line",
      "softEdges",
      "format3d",
      "rotation3d",
      "theme",
      "styleId",
      "source",
    ]) {
      const effects = { shadow: { kind: "none" }, [key]: { kind: "none" } };
      expect(() => normalizeShapeGroupEffects(effects)).toThrow(/Unknown/);
      expect(() =>
        normalizeShapeGroup({ ...group(), groupEffects: effects } as ShapeGroupDrawing),
      ).toThrow(/Unknown/);
      expect(() =>
        normalizeShapeGroupChild({ ...nested(), groupEffects: effects } as ShapeGroupChild),
      ).toThrow(/Unknown/);
    }
    expect(() =>
      normalizeShapeGroupChild({ ...leaf(), groupEffects: {} } as ShapeGroupChild),
    ).toThrow(/Unknown/);
    for (const effects of [
      null,
      [],
      { shadow: undefined },
      { shadow: { kind: "none", value: {} } },
    ])
      expect(() => normalizeShapeGroupEffects(effects)).toThrow();
    expect(() =>
      normalizeShapeGroupEffects({ shadow: { kind: "value", value: { kind: "outer" } } }),
    ).toThrow();
  });

  test("ordinary own data rejects inherited records, symbols and accessors without reading them", () => {
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    const effects = { shadow: fullStyle().shadow };
    Object.defineProperty(effects, "shadow", { get: access });
    expect(() => normalizeShapeGroupEffects(effects)).toThrow(/data fields/);
    const choice = { shadow: fullStyle().shadow! };
    Object.defineProperty(choice.shadow, "kind", { get: access });
    expect(() => normalizeShapeGroupEffects(choice)).toThrow(/data fields/);
    const detail = { shadow: fullStyle().shadow! };
    if (detail.shadow.kind !== "value") throw Error("Expected shadow value");
    Object.defineProperty(detail.shadow.value.color, "rgb", { get: access });
    expect(() => normalizeShapeGroupEffects(detail)).toThrow(/data fields/);
    for (const owner of [group(), nested()]) {
      Object.defineProperty(owner, "groupEffects", { get: access });
      expect(() =>
        "shapeFrame" in owner ? normalizeShapeGroup(owner) : normalizeShapeGroupChild(owner),
      ).toThrow(/data fields/);
    }
    expect(() => normalizeShapeGroupEffects(Object.create({ shadow: { kind: "none" } }))).toThrow(
      /ordinary/,
    );
    expect(() => normalizeShapeGroupEffects({ [Symbol("effect")]: { kind: "none" } })).toThrow(
      /Unknown/,
    );
    expect(reads).toBe(0);
  });

  test("one-level Ungroup and removed-owner promotion drop owner effects and retain child-owned effects", () => {
    const inner = { ...nested("inner"), groupEffects: { shadow: { kind: "none" as const } } };
    const outer = {
      ...group("outer"),
      groupEffects: { shadow: fullStyle().shadow },
      members: [leaf("ordinary"), inner],
    };
    const before = structuredClone(outer);
    for (const released of [
      ungroupShapeRoot([outer], outer.id, metrics()),
      planDeleteShapeGroupNodes([outer], [[outer.id, "ordinary"]], metrics()),
    ]) {
      const survivor = released.find((node) => node.id === inner.id);
      if (survivor?.kind !== "shapeGroup") throw Error("Expected promoted nested group");
      expect(survivor.groupEffects).toEqual(inner.groupEffects);
      expect(survivor.members).toEqual(inner.members);
      for (const ordinary of released.filter((node) => node.id === "ordinary"))
        expect(ordinary).not.toHaveProperty("groupEffects");
      for (const root of ungroupShapeRoot(released, inner.id, metrics()))
        expect(root).not.toHaveProperty("groupEffects");
    }
    expect(outer).toEqual(before);
  });
});
