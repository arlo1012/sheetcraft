import { expect, test, vi } from "vitest";
import {
  normalizePictureProperties,
  getPictureProperties,
  arePicturePropertiesEqual,
} from "../../picture-properties.js";
import {
  normalizePictureObject,
  clonePictureObject,
  arePictureObjectsEqual,
} from "../../picture-object.js";
import { cloneCellContent, setCellContent, getCellContent } from "../../workbook.js";
import { fixture as ownedFixture } from "../picture-group-edit/fixture.js";
import { createTestSheet } from "../helpers.js";
import { picture } from "../picture-group-planning/fixture.js";
import { clonePictureGroup, findPictureGroupNode } from "../../picture-group.js";
const properties = { altTitle: "合成标题 Ω", locked: false, printObject: false } as const;
test("old objects retain default true behaviors and empty title; only meaningful choices are stored", () => {
  expect(normalizePictureProperties({})).toEqual({});
  expect(normalizePictureProperties({ altTitle: "", locked: true, printObject: true })).toEqual({});
  expect(getPictureProperties({})).toEqual({ altTitle: "", locked: true, printObject: true });
  expect(normalizePictureProperties(properties)).toEqual(properties);
  expect(arePicturePropertiesEqual({}, { locked: true, printObject: true, altTitle: "" })).toBe(
    true,
  );
});
test.each(["altTitle", "locked", "printObject"] as const)(
  "%s cannot be supplied by a getter or inherited behavior",
  (key) => {
    const getter = vi.fn(() => (key === "altTitle" ? "hidden title" : false)),
      value = Object.defineProperty({}, key, { get: getter });
    expect(() => normalizePictureProperties(value)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => normalizePictureProperties(Object.create({ [key]: false }))).toThrow();
  },
);
test.each([null, 0, "false", [], {}])(
  "bad boolean %s is rejected, never coerced to unlocked",
  (value) => {
    expect(() => normalizePictureProperties({ locked: value })).toThrow();
    expect(() => normalizePictureProperties({ printObject: value })).toThrow();
  },
);
test("image clone/equality preserve properties independently of geometric and appearance data", () => {
  const image = { ...picture("p", 20), ...properties },
    clone = clonePictureObject(image);
  expect(clone).toEqual(image);
  expect(clone).not.toBe(image);
  expect(arePictureObjectsEqual(image, clone)).toBe(true);
  expect(arePictureObjectsEqual(image, { ...clone, altTitle: "other" })).toBe(false);
  expect(arePictureObjectsEqual(image, { ...clone, locked: true })).toBe(false);
  expect(normalizePictureObject({ ...image, locked: true })).not.toHaveProperty("locked");
});
test("hidden nested leaves and containers retain their own properties during detached group clones", () => {
  const f = ownedFixture();
  Object.assign(f.root, properties);
  Object.assign(f.picture, properties);
  const clone = clonePictureGroup(f.root);
  expect(clone).toMatchObject(properties);
  expect(findPictureGroupNode(clone, f.path)?.node).toMatchObject(properties);
  f.picture.altTitle = "changed source";
  expect(findPictureGroupNode(clone, f.path)?.node.altTitle).toBe(properties.altTitle);
});
test("in-cell clone/normalization/equality retain the same properties without changing its content kind", () => {
  const content = {
      kind: "image" as const,
      image: { assetId: "synthetic", altText: "description", ...properties },
    },
    clone = cloneCellContent(content);
  expect(clone).toEqual(content);
  const sheet = createTestSheet(),
    address = { row: 0, column: 0 };
  expect(setCellContent(sheet, address, content)).toBe(true);
  expect(getCellContent(sheet, address)).toEqual(content);
  expect(setCellContent(sheet, address, clone)).toBe(false);
  expect(
    setCellContent(sheet, address, { ...content, image: { ...content.image, printObject: true } }),
  ).toBe(true);
  expect(() =>
    setCellContent(sheet, address, { ...content, image: { ...content.image, locked: 0 } as never }),
  ).toThrow();
});
