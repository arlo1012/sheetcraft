import { describe, expect, test, vi } from "vitest";
import {
  areImageTransformsEqual,
  cloneImageTransform,
  normalizeImageTransform,
} from "../../image-transform.js";
import { createSetSheetFloatingImagesCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { clonePictureRootsForClipboard } from "../../picture-group-copy.js";
import { normalizePictureObjectCollection } from "../../picture-object.js";
import { cloneCellContent, cloneFloatingImage, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture, childNodes } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import type { PictureGroup } from "../../picture-group.js";
import { fullStyle } from "./detailed-style-fixture.js";

describe("typed picture appearance cloning and history", () => {
  test("transform equality canonicalizes nested record ordering and distinguishes None from absence", () => {
    const left = { appearance: { detailedStyle: fullStyle() } };
    const right = {
      appearance: { detailedStyle: Object.fromEntries(Object.entries(fullStyle()).reverse()) },
    };
    expect(areImageTransformsEqual(left, right)).toBe(true);
    expect(areImageTransformsEqual({ appearance: { detailedStyle: {} } }, undefined)).toBe(true);
    expect(
      areImageTransformsEqual(
        { appearance: { detailedStyle: { shadow: { kind: "none" } } } },
        undefined,
      ),
    ).toBe(false);
    const clone = cloneImageTransform(left)!;
    expect(clone).toEqual(left);
    expect(clone.appearance!.detailedStyle).not.toBe(left.appearance.detailedStyle);
    const getter = vi.fn(() => left.appearance);
    const invalid = {};
    Object.defineProperty(invalid, "appearance", { get: getter });
    expect(() => normalizeImageTransform(invalid)).toThrow(/data/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("cell and standalone clones detach every typed category without changing geometry/source", () => {
    const transform = { appearance: { detailedStyle: fullStyle() } };
    const content = {
      kind: "image" as const,
      image: { assetId: "asset", altText: "Picture", transform },
    };
    const clonedCell = cloneCellContent(content);
    if (clonedCell.kind !== "image") throw Error("Expected image");
    const original = { ...picture("picture", 100), transform };
    const cloned = cloneFloatingImage(original);
    expect(cloned).toEqual(original);
    expect(clonedCell).toEqual(content);
    expect(cloned.transform!.appearance!.detailedStyle!.shadow).not.toBe(
      transform.appearance.detailedStyle.shadow,
    );
    expect(clonedCell.image.transform!.appearance!.detailedStyle!.fill).not.toBe(
      transform.appearance.detailedStyle.fill,
    );
    cloned.transform!.appearance!.detailedStyle!.shadow = { kind: "none" };
    clonedCell.image.transform!.appearance!.detailedStyle!.fill = { kind: "none" };
    expect(transform.appearance.detailedStyle).toEqual(fullStyle());
  });

  test("owned normalization, clone and clipboard copies detach reused style records in separate leaves", () => {
    const f = fixture();
    const style = fullStyle();
    f.picture.transform!.appearance!.detailedStyle = style;
    const sibling = f.inner.members[1]!;
    if (sibling.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    sibling.transform = { appearance: { detailedStyle: style } };
    let id = 0;
    const roots = [
      normalizePictureObjectCollection([f.root])[0],
      cloneFloatingImage(f.root),
      clonePictureRootsForClipboard([f.root], { createId: () => `copy-${++id}` })[0],
    ] as PictureGroup[];
    const styles = roots.flatMap((root) => {
      const members = childNodes(root);
      const other = members.inner.members[1]!;
      if (other.kind !== "grouped-picture-v1") throw Error("Expected leaf");
      return [
        members.picture.transform!.appearance!.detailedStyle!,
        other.transform!.appearance!.detailedStyle!,
      ];
    });
    expect(new Set(styles).size).toBe(6);
    for (const detached of styles) {
      expect(detached).toEqual(style);
      expect(detached.fill).not.toBe(style.fill);
      detached.glow = { kind: "none" };
    }
    expect(style).toEqual(fullStyle());
  });

  test("collection commands preserve full typed tuples in one undo/redo and reject malformed updates atomically", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const original = picture("picture", 100);
    sheet.floatingImages = [original];
    const next = { ...original, transform: { appearance: { detailedStyle: fullStyle() } } };
    const command = createSetSheetFloatingImagesCommand(sheet.id, [next]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.floatingImages).toEqual([next]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual([original]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual([next]);
    const before = structuredClone(sheet.floatingImages);
    const malformed = {
      ...next,
      transform: {
        appearance: {
          detailedStyle: {
            glow: {
              kind: "value",
              value: { sizePt: NaN },
            },
          },
        },
      },
    };
    expect(() =>
      createSetSheetFloatingImagesCommand(sheet.id, [malformed as typeof next]),
    ).toThrow();
    expect(sheet.floatingImages).toEqual(before);
    expect(session.history.undoStack).toHaveLength(1);
  });
});
