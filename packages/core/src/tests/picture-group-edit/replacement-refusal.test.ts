import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolvePictureLayout } from "../../picture-frame.js";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "../../picture-group-edit.js";
import type { GroupedGroup, GroupedPicture } from "../../picture-group.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { childNodes, fixture, resolvedNodes } from "./fixture.js";

const world = resolvePictureLayout({ x: 400, y: 100, width: 216, height: 144 }, 74);

describe("owned child edits validate old leases and both complete trees", () => {
  test.each(["asset", "source", "reparent", "missing"])(
    "stale %s refuses before any mutation",
    (change) => {
      const f = fixture();
      const lease = leasePictureGroupNode(f.root, f.path);
      if (change === "asset") f.picture.assetId = "changed-asset";
      if (change === "source") f.picture.frame.source.offsetXRatio = 0.7;
      if (change === "reparent") f.root.members.push(f.inner.members.shift()!);
      if (change === "missing") f.inner.members.shift();
      const before = structuredClone(f.root);
      expect(() => applyPictureGroupChildWorldEdit(f.root, lease, world, f.metrics)).toThrow(
        /stale|missing|reparented/,
      );
      expect(f.root).toEqual(before);
    },
  );
  test("explicit leaf replacement changes source/content only after old path/asset/source lease matches", () => {
    const f = fixture();
    const lease = leasePictureGroupNode(f.root, f.path);
    const currentWorld = resolvedNodes(f.root, f.metrics).picture.layout!;
    const replacement: GroupedPicture = {
      ...structuredClone(f.picture),
      assetId: "replacement-asset",
      altText: "Replacement",
      hidden: false,
      frame: {
        ...f.picture.frame,
        source: { widthRatio: 0.7, heightRatio: 2, offsetXRatio: 0.1, offsetYRatio: -0.3 },
        flipHorizontal: false,
        flipVertical: true,
      },
      transform: { appearance: { opacity: 0.4 }, annotations: [] },
    };
    const next = applyPictureGroupChildWorldEdit(f.root, lease, currentWorld, f.metrics, {
      replacement,
    });
    const picture = childNodes(next).picture;
    expect(picture.assetId).toBe("replacement-asset");
    expect(picture.frame.source).toEqual(replacement.frame.source);
    expect(picture.frame.flipHorizontal).toBe(false);
    expect(picture.frame.flipVertical).toBe(true);
    expect(picture.frame.rect).toEqual(f.picture.frame.rect);
    expect(picture.transform!.appearance!.opacity).toBe(0.4);
    expect(picture.hidden).toBe(false);
    expect(() => applyPictureGroupChildWorldEdit(next, lease, currentWorld, f.metrics)).toThrow(
      /stale/,
    );
    expect(leasePictureGroupNode(next, f.path)).toMatchObject({ assetId: "replacement-asset" });
    expect(f.picture.assetId).toBe("shared-asset");
  });
  test.each(["id", "kind", "missing-asset", "bad-source", "hidden-source-overflow"])(
    "invalid replacement %s rejects the whole detached plan",
    (change) => {
      const f = fixture();
      const before = structuredClone(f.root);
      const replacement = structuredClone(f.picture);
      if (change === "id") replacement.id = "changed-id";
      if (change === "kind") (replacement as { kind: string }).kind = "grouped-group-v1";
      if (change === "missing-asset") replacement.assetId = "";
      if (change === "bad-source") replacement.frame.source.widthRatio = 0;
      if (change === "hidden-source-overflow")
        replacement.frame.source.widthRatio = Number.MAX_VALUE;
      expect(() =>
        applyPictureGroupChildWorldEdit(
          f.root,
          leasePictureGroupNode(f.root, f.path),
          world,
          f.metrics,
          {
            replacement,
          },
        ),
      ).toThrow();
      expect(f.root).toEqual(before);
    },
  );
  test.each(["asset", "source", "order", "membership", "owner-path"])(
    "container replacement cannot alter descendant %s",
    (change) => {
      const f = fixture();
      const replacement = structuredClone(f.inner);
      const leaf = replacement.members[0] as GroupedPicture;
      if (change === "asset") leaf.assetId = "changed-asset";
      if (change === "source") leaf.frame.source.offsetXRatio = 0.3;
      if (change === "order") replacement.members.reverse();
      if (change === "membership") replacement.members.pop();
      if (change === "owner-path") {
        const inner: GroupedGroup = {
          ...replacement,
          id: "new-owner",
          members: [leaf],
        };
        replacement.members[0] = inner;
      }
      expect(() =>
        applyPictureGroupChildWorldEdit(
          f.root,
          leasePictureGroupNode(f.root, ["root", "inner"]),
          world,
          f.metrics,
          { replacement },
        ),
      ).toThrow(/ownership|sources/);
    },
  );
  test("container replacement with unchanged ownership/source may update metadata and appearance", () => {
    const f = fixture();
    const replacement = structuredClone(f.inner);
    replacement.altText = "Edited owner";
    replacement.hidden = false;
    (replacement.members[0] as GroupedPicture).transform = { appearance: { opacity: 0.4 } };
    const currentWorld = resolvedNodes(f.root, f.metrics).inner.layout!;
    const next = applyPictureGroupChildWorldEdit(
      f.root,
      leasePictureGroupNode(f.root, ["root", "inner"]),
      currentWorld,
      f.metrics,
      { replacement },
    );
    expect(childNodes(next).inner).toEqual(replacement);
  });
  test("an invalid hidden sibling rejects an otherwise valid target edit", () => {
    const f = fixture();
    const lease = leasePictureGroupNode(f.root, f.path);
    const sibling = f.root.members[1] as GroupedPicture;
    sibling.hidden = true;
    sibling.frame.source.widthRatio = Number.MAX_VALUE;
    const before = structuredClone(f.root);
    expect(() => applyPictureGroupChildWorldEdit(f.root, lease, world, f.metrics)).toThrow();
    expect(f.root).toEqual(before);
  });
  test("collapsed ancestors refuse inverse editing and showing them leaves durable data intact", () => {
    const f = fixture();
    const sheet = createSheet("Synthetic", "sheet");
    f.root.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    const lease = leasePictureGroupNode(f.root, f.path);
    const before = structuredClone(f.root);
    setSheetDimensionHidden(sheet, "column", 0, true);
    expect(() =>
      applyPictureGroupChildWorldEdit(f.root, lease, world, createPictureSheetMetrics(sheet)),
    ).toThrow(/collapsed/);
    expect(f.root).toEqual(before);
    setSheetDimensionHidden(sheet, "column", 0, false);
    expect(() =>
      applyPictureGroupChildWorldEdit(f.root, lease, world, createPictureSheetMetrics(sheet)),
    ).not.toThrow();
  });
  test("root leases cannot be used as a child edit and malformed metadata cannot commit", () => {
    const f = fixture();
    expect(() =>
      applyPictureGroupChildWorldEdit(
        f.root,
        leasePictureGroupNode(f.root, ["root"]),
        world,
        f.metrics,
      ),
    ).toThrow(/owner/);
    expect(() =>
      applyPictureGroupChildWorldEdit(
        f.root,
        leasePictureGroupNode(f.root, f.path),
        world,
        f.metrics,
        {
          metadata: { hidden: "yes" as unknown as boolean },
        },
      ),
    ).toThrow(/visibility/);
  });
});
