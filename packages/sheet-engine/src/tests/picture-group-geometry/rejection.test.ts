import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import type { PictureGroupNumericSizeEdit } from "../../picture-group-geometry.js";
import {
  movePictureGroupBy,
  resizePictureGroupBy,
  resizePictureGroupTo,
  rotatePictureGroupBy,
  rotatePictureGroupTo,
} from "../../picture-group-geometry.js";
import { group, metrics, firstLeaf } from "./fixture.js";

describe("group edit atomic refusal and no-op", () => {
  test("no-op returns a deep detached tree and keeps hidden logical anchor affinity", () => {
    const sheet = createSheet("Hidden affinity", "hidden");
    sheet.hiddenColumns.add(0);
    sheet.hiddenRows.add(0);
    const m = createPictureSheetMetrics(sheet),
      original = group("move-and-size", 0);
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 40 }, row: { index: 0, offset: 8 } },
      end: { column: { index: 6, offset: 36 }, row: { index: 10, offset: 8 } },
    };
    const before = structuredClone(original),
      rect = resolvePictureGroup(original, m).layout.rect;
    const plans = [
      movePictureGroupBy(original, { x: 0, y: 0 }, m),
      resizePictureGroupBy(original, "se", { x: 0, y: 0 }, m),
      resizePictureGroupBy(original, "e", { x: 0, y: 10 }, m),
      resizePictureGroupTo(original, { axis: "width", value: rect.width }, m),
      rotatePictureGroupBy(original, 360, m),
      rotatePictureGroupTo(original, 720, m),
    ];
    for (const next of plans) {
      expect(next).toEqual(before);
      expect(next).not.toBe(original);
      expect(next!.members).not.toBe(original.members);
      firstLeaf(next!).frame.source.offsetXRatio = 0.7;
      expect(original).toEqual(before);
    }
  });

  test("sub-ulp movement is a detached no-op rather than a redundant reanchor", () => {
    const original = group("move-only"),
      before = structuredClone(original);
    const next = movePictureGroupBy(
      original,
      { x: Number.MIN_VALUE, y: -Number.MIN_VALUE },
      metrics,
    )!;
    expect(next).toEqual(before);
    expect(next).not.toBe(original);
    expect(next.frame.anchor).toEqual(before.frame.anchor);
    expect(next.members).not.toBe(original.members);
  });

  test("collapsed roots refuse geometry edits while retaining their exact local tree", () => {
    const sheet = createSheet("Collapsed", "hidden");
    sheet.hiddenColumns.add(0);
    const m = createPictureSheetMetrics(sheet),
      original = group("move-and-size");
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 8, offset: 0 } },
    };
    const before = structuredClone(original);
    expect(movePictureGroupBy(original, { x: 10, y: 10 }, m)).toBeNull();
    expect(resizePictureGroupBy(original, "se", { x: 10, y: 10 }, m)).toBeNull();
    expect(resizePictureGroupTo(original, { axis: "width", value: 10 }, m)).toBeNull();
    expect(rotatePictureGroupBy(original, 37, m)).toBeNull();
    expect(rotatePictureGroupTo(original, 37, m)).toBeNull();
    expect(original).toEqual(before);
  });

  test("hidden nested leaf source overflow rejects the entire root resize", () => {
    const original = group("fixed", 0),
      leaf = firstLeaf(original);
    leaf.hidden = true;
    leaf.frame.source.widthRatio = 1e305;
    original.members = [
      {
        kind: "grouped-group-v1",
        id: "nested",
        altText: "Hidden owner",
        hidden: true,
        frame: {
          kind: "group-local-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 0,
        },
        members: [leaf],
      },
    ];
    const before = structuredClone(original);
    expect(() => resolvePictureGroup(original, metrics)).not.toThrow();
    expect(() =>
      resizePictureGroupTo(original, { axis: "width", value: 10000 }, metrics),
    ).toThrow();
    expect(() => resizePictureGroupBy(original, "e", { x: 9484, y: 0 }, metrics)).toThrow();
    expect(original).toEqual(before);
  });

  test("a hidden descendant loses representability after movement and rejects atomically", () => {
    const original = group("fixed", 0),
      leaf = firstLeaf(original);
    leaf.hidden = true;
    leaf.frame.rect.widthRatio = 1e-12;
    const before = structuredClone(original);
    expect(() => resolvePictureGroup(original, metrics)).not.toThrow();
    expect(() => movePictureGroupBy(original, { x: 1e12, y: 0 }, metrics)).toThrow();
    expect(original).toEqual(before);
  });

  test.each([NaN, Infinity, -Infinity, 0, -1, 0.5, 10001])(
    "rejects invalid numeric size %s",
    (value) => {
      const original = group(),
        before = structuredClone(original);
      expect(() => resizePictureGroupTo(original, { axis: "width", value }, metrics)).toThrow();
      expect(original).toEqual(before);
    },
  );
  test.each([{ axis: "both", value: 100 }, { axis: "width", value: 100, height: 200 }, {}, null])(
    "rejects ambiguous numeric edit %j",
    (edit) => {
      expect(() =>
        resizePictureGroupTo(group(), edit as PictureGroupNumericSizeEdit, metrics),
      ).toThrow();
    },
  );
  test("an aspect-locked counterpart outside the manual budget rejects instead of clamping", () => {
    const original = group("fixed", 0);
    original.lockAspectRatio = true;
    expect(() => resizePictureGroupTo(original, { axis: "width", value: 1 }, metrics)).toThrow();
    expect(() =>
      resizePictureGroupTo(original, { axis: "height", value: 10000 }, metrics),
    ).toThrow();
  });
  test.each([
    { minSize: 0 },
    { minSize: 0.5 },
    { maxSize: Infinity },
    { minSize: 100, maxSize: 24 },
    { maxSize: 10001 },
  ])("rejects invalid handle budget %j", (options) => {
    const original = group(),
      before = structuredClone(original);
    expect(() => resizePictureGroupBy(original, "e", { x: 10, y: 0 }, metrics, options)).toThrow();
    expect(original).toEqual(before);
  });
  test("nonfinite deltas and angles reject before producing a plan", () => {
    const original = group(),
      before = structuredClone(original);
    expect(() => movePictureGroupBy(original, { x: NaN, y: 0 }, metrics)).toThrow();
    expect(() => resizePictureGroupBy(original, "e", { x: Infinity, y: 0 }, metrics)).toThrow();
    expect(() => rotatePictureGroupBy(original, NaN, metrics)).toThrow();
    expect(() => rotatePictureGroupTo(original, Infinity, metrics)).toThrow();
    expect(original).toEqual(before);
  });
  test("even no-op edits fully validate hidden descendant source representability", () => {
    const original = group();
    firstLeaf(original).hidden = true;
    firstLeaf(original).frame.source.widthRatio = 1e308;
    const before = structuredClone(original);
    expect(() => movePictureGroupBy(original, { x: 0, y: 0 }, metrics)).toThrow();
    expect(() => rotatePictureGroupBy(original, 360, metrics)).toThrow();
    expect(original).toEqual(before);
  });
});
