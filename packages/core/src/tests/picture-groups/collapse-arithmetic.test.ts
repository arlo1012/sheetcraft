import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolvePictureLayout } from "../../picture-frame.js";
import {
  resolvePictureGroup,
  resolvePictureGroupChildLayout,
  placePictureGroupChild,
} from "../../picture-group-layout.js";
import { clonePictureGroup, type GroupedGroup, type GroupedPicture } from "../../picture-group.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { group, leaf, metrics, resolvedLeaf } from "./fixtures.js";

describe("collapsed group retention and atomic derived validation", () => {
  test("hidden-axis collapse retains every local node/source and showing restores geometry", () => {
    const sheet = createSheet("Synthetic", "sheet");
    const child = leaf();
    child.frame.angleDeg = 37;
    child.frame.source.widthRatio = 2;
    const nested: GroupedGroup = {
      kind: "grouped-group-v1",
      id: "inner",
      altText: "Inner",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: -0.2, yRatio: 0.5, widthRatio: 0.8, heightRatio: 2 },
        angleDeg: 13,
      },
      members: [child],
    };
    const value = { ...group(), members: [nested] };
    value.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const before = clonePictureGroup(value);
    const initial = resolvePictureGroup(value, createPictureSheetMetrics(sheet));
    setSheetDimensionHidden(sheet, "column", 0, true);
    const collapsed = resolvePictureGroup(value, createPictureSheetMetrics(sheet));
    expect(collapsed.layout.collapsed).toBe(true);
    expect(collapsed.visible).toBe(false);
    expect(collapsed.members[0]!.layout).toBeNull();
    const subgroup = collapsed.members[0]!;
    if (!("members" in subgroup)) throw new Error("Expected nested group.");
    expect(subgroup.members).toHaveLength(1);
    expect(subgroup.members[0]!.layout).toBeNull();
    expect(subgroup.members[0]!.visible).toBe(false);
    expect(collapsed.node).toEqual(before);
    expect(value).toEqual(before);
    setSheetDimensionHidden(sheet, "column", 0, false);
    expect(resolvePictureGroup(value, createPictureSheetMetrics(sheet))).toEqual(initial);
  });
  test("ancestor visibility suppresses descendants without changing their own hidden flags or layout", () => {
    const value = group();
    value.hidden = true;
    value.members[1]!.hidden = true;
    const hidden = resolvePictureGroup(value, metrics());
    expect(hidden.visible).toBe(false);
    expect(hidden.members.every((child) => !child.visible)).toBe(true);
    expect(hidden.members[0]!.layout).not.toBeNull();
    delete value.hidden;
    const shown = resolvePictureGroup(value, metrics());
    expect(shown.members[0]!.visible).toBe(true);
    expect(shown.members[1]!.visible).toBe(false);
    expect(shown.members[0]!.node.hidden).toBeUndefined();
    expect(shown.members[1]!.node.hidden).toBe(true);
  });
  test.each([
    "source-overflow",
    "source-underflow",
    "child-overflow",
    "position-overflow",
    "unrepresentable-edge",
  ])("rejects %s in a hidden descendant without modifying the input tree", (scenario) => {
    const value = group();
    const child = value.members[1] as GroupedPicture;
    child.hidden = true;
    if (scenario === "source-overflow") child.frame.source.widthRatio = Number.MAX_VALUE;
    if (scenario === "source-underflow") {
      child.frame.rect.widthRatio = Number.MIN_VALUE;
      child.frame.source.widthRatio = Number.MIN_VALUE;
    }
    if (scenario === "child-overflow") child.frame.rect.widthRatio = Number.MAX_VALUE;
    if (scenario === "position-overflow") child.frame.rect.xRatio = Number.MAX_VALUE;
    if (scenario === "unrepresentable-edge") child.frame.rect.xRatio = 1e20;
    const before = structuredClone(value);
    expect(() => resolvePictureGroup(value, metrics())).toThrow();
    expect(value).toEqual(before);
  });
  test("positive local products and inverse ratios cannot silently underflow or overflow", () => {
    const parent = resolvePictureLayout({ x: 0, y: 0, width: 0.1, height: 100 }, 0);
    expect(() =>
      resolvePictureGroupChildLayout(parent, {
        rect: { xRatio: 0, yRatio: 0, widthRatio: Number.MIN_VALUE, heightRatio: 1 },
        angleDeg: 0,
      }),
    ).toThrow(/underflow/);
    const large = resolvePictureLayout({ x: 0, y: 0, width: 1e308, height: 100 }, 0);
    const small = resolvePictureLayout({ x: 0, y: 0, width: 1e-100, height: 100 }, 0);
    expect(() => placePictureGroupChild(large, small)).toThrow(/underflow/);
    expect(() => placePictureGroupChild(small, large)).toThrow();
  });
  test("resolved geometry is detached and local canonical values never acquire world caches", () => {
    const value = group();
    const result = resolvePictureGroup(value, metrics());
    const child = resolvedLeaf(result, 0);
    child.node.frame.rect.xRatio = 2;
    child.layout!.rect.x = 900;
    expect(value.members[0]!.frame.rect.xRatio).toBe(0);
    expect(value.members[0]).not.toHaveProperty("layout");
    expect(value.members[0]).not.toHaveProperty("worldRect");
  });
});
