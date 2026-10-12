import { expect, test, vi } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet, setCellContent, type LegacyFloatingImage } from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { fixture as ownedFixture } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import { findPictureGroupNode, isPictureGroup } from "../../picture-group.js";
const properties = { altTitle: "合成标题", locked: false, printObject: false } as const;
const kinds = ["cell", "legacy", "framed", "nested"] as const;
function fixture(kind: (typeof kinds)[number], propertiesValue: object = properties) {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  const legacy: LegacyFloatingImage = {
    id: "p",
    assetId: "synthetic",
    altText: "description",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 80,
  };
  if (kind === "cell")
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "synthetic", altText: "description", ...propertiesValue },
      },
    );
  else if (kind === "legacy") sheet.floatingImages = [{ ...legacy, ...propertiesValue }];
  else if (kind === "framed") sheet.floatingImages = [{ ...picture("p", 20), ...propertiesValue }];
  else {
    const f = ownedFixture();
    Object.assign(f.picture, propertiesValue);
    sheet.floatingImages = [f.root];
  }
  return { session, sheet };
}
test.each(kinds)(
  "%s properties select version 51 and persist through workbook and sheet snapshots",
  (kind) => {
    const f = fixture(kind),
      snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(51);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(f.sheet)))).toEqual(
      serializeSheet(f.sheet),
    );
  },
);
test.each(kinds)("%s without new semantics retains its previous protocol", (kind) => {
  const f = fixture(kind, {});
  expect(serializeWorkbook(f.session.workbook).version).toBe(
    kind === "framed" ? 47 : kind === "nested" ? 48 : 43,
  );
});
test.each(kinds)("%s cannot smuggle properties through a version 50 workbook", (kind) => {
  const f = fixture(kind),
    snapshot = serializeWorkbook(f.session.workbook);
  expect(() => deserializeWorkbook({ ...snapshot, version: 50 })).toThrow(/version 51/);
});
test("default and invalid own fields also require the new protocol and never execute accessors", () => {
  const f = fixture("legacy", {}),
    snapshot = serializeWorkbook(f.session.workbook);
  const image = snapshot.sheets[0]!.floatingImages[0]!;
  for (const locked of [true, undefined, false]) {
    Object.assign(image, { locked });
    expect(() => deserializeWorkbook({ ...snapshot, version: 50 })).toThrow(/version 51/);
  }
  const getter = vi.fn(() => false);
  Object.defineProperty(image, "locked", { get: getter, configurable: true });
  expect(() => deserializeWorkbook({ ...snapshot, version: 51 })).toThrow(/accessor/);
  expect(getter).not.toHaveBeenCalled();
});
test("nested default-valued fields do not disappear during old-version validation", () => {
  const f = fixture("nested", {}),
    snapshot = serializeWorkbook(f.session.workbook),
    root = snapshot.sheets[0]!.floatingImages[0]!;
  if (!isPictureGroup(root)) throw Error("Bad fixture.");
  findPictureGroupNode(root, ["root", "inner", "picture"])!.node.locked = true;
  expect(() => deserializeWorkbook({ ...snapshot, version: 50 })).toThrow(/version 51/);
});
