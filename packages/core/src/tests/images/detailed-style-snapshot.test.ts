import { describe, expect, test, vi } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type SheetSnapshot,
} from "../../serialization.js";
import type { ImageAppearance } from "../../image-appearance.js";
import type { PictureDetailedStyle } from "../../picture-detailed-style.js";
import { isPictureGroup, traversePictureGroup } from "../../picture-group.js";
import { getActiveSheet, setCellContent, type LegacyFloatingImage } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture as ownedFixture } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import { fullStyle, line, picturePaint } from "./detailed-style-fixture.js";

const placements = ["cell", "legacy-root", "framed-root", "nested-leaf"] as const;
type Placement = (typeof placements)[number];
function legacy(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "asset",
    altText: "Legacy",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 80,
    hidden: true,
  };
}
function install(placement: Placement, detailedStyle: PictureDetailedStyle = fullStyle()) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const transform = { appearance: { detailedStyle } };
  if (placement === "cell")
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "cell", altText: "", transform },
      },
    );
  else if (placement === "legacy-root") sheet.floatingImages = [{ ...legacy(), transform }];
  else if (placement === "framed-root")
    sheet.floatingImages = [{ ...picture("framed", 0), transform }];
  else {
    const owned = ownedFixture();
    owned.picture.transform!.appearance!.detailedStyle = detailedStyle;
    owned.picture.hidden = true;
    sheet.floatingImages = [owned.root];
  }
  return { workbook: session.workbook, sheet };
}
function appearance(sheet: SheetSnapshot): ImageAppearance {
  for (const cell of sheet.cells)
    if (cell.content?.kind === "image") {
      const style = cell.content.image.transform?.appearance;
      if (style && Object.hasOwn(style, "detailedStyle")) return style;
    }
  for (const root of sheet.floatingImages) {
    const nodes = isPictureGroup(root)
      ? traversePictureGroup(root).map(({ node }) => node)
      : [root];
    for (const node of nodes) {
      if ("members" in node) continue;
      const style = node.transform?.appearance;
      if (style && Object.hasOwn(style, "detailedStyle")) return style;
    }
  }
  throw Error("Expected detailed style");
}
describe("V50 complete picture appearance internal persistence", () => {
  test.each(placements)(
    "round trips all categories and auxiliary image fills for %s",
    (placement) => {
      for (const style of [
        fullStyle(),
        {
          fill: { kind: "value" as const, value: picturePaint("fill") },
          line: { kind: "value" as const, value: line(picturePaint("outline")) },
        },
      ]) {
        const f = install(placement, style);
        const snapshot = serializeWorkbook(f.workbook);
        expect(snapshot.version).toBe(50);
        expect(appearance(snapshot.sheets[0]!).detailedStyle).toEqual(style);
        expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
        const isolated = serializeSheet(f.sheet);
        expect(serializeSheet(deserializeSheet(isolated))).toEqual(isolated);
      }
    },
  );

  test.each(placements)(
    "all 1..49 envelopes reject field presence, even empty/undefined, in %s",
    (placement) => {
      const f = install(placement);
      for (const field of [fullStyle(), {}, undefined]) {
        const snapshot = serializeWorkbook(f.workbook);
        appearance(snapshot.sheets[0]!).detailedStyle = field;
        for (let version = 1; version <= 49; version++) {
          const old: Record<string, unknown> = { ...snapshot, version };
          if (version < 3) delete old.dateSystem;
          expect(() => deserializeWorkbook(old)).toThrow(/version 50/);
        }
      }
    },
  );

  test.each(placements)(
    "malformed fields and accessors fail atomically without getter calls in %s",
    (placement) => {
      const f = install(placement);
      for (const invalid of [
        null,
        [],
        { glow: { kind: "value", value: { sizePt: NaN } } },
        { line: { kind: "none", inheritedOutline: "inherit" } },
        { unexpected: true },
      ]) {
        const snapshot = serializeWorkbook(f.workbook);
        appearance(snapshot.sheets[0]!).detailedStyle = invalid as unknown as PictureDetailedStyle;
        expect(() => deserializeWorkbook(snapshot)).toThrow();
        expect(() => deserializeSheet(snapshot.sheets[0]!)).toThrow();
      }
      const getter = vi.fn(() => fullStyle());
      const snapshot = serializeWorkbook(f.workbook);
      Object.defineProperty(appearance(snapshot.sheets[0]!), "detailedStyle", { get: getter });
      expect(() => deserializeWorkbook(snapshot)).toThrow(/data/);
      expect(() => deserializeSheet(snapshot.sheets[0]!)).toThrow(/data/);
      expect(() => deserializeWorkbook({ ...snapshot, version: 49 })).toThrow(/version 50/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  test("empty records retain established writer versions; explicit None promotes exactly once", () => {
    for (const [placement, expectedVersion] of [
      ["cell", 43],
      ["legacy-root", 43],
      ["framed-root", 47],
      ["nested-leaf", 48],
    ] as const) {
      const f = install(placement, {});
      const snapshot = serializeWorkbook(f.workbook);
      expect(snapshot.version).toBe(expectedVersion);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      const none = install(placement, { glow: { kind: "none" } });
      expect(serializeWorkbook(none.workbook).version).toBe(50);
      expect(appearance(serializeSheet(none.sheet)).detailedStyle).toEqual({
        glow: { kind: "none" },
      });
    }
    const flags = install("framed-root", {});
    const root = flags.sheet.floatingImages[0]!;
    if (isPictureGroup(root)) throw Error("Expected a picture");
    root.transform!.appearance = { suppressThemeEffects: { bevel: true } };
    expect(serializeWorkbook(flags.workbook).version).toBe(49);
    root.transform!.appearance.detailedStyle = { shadow: { kind: "none" } };
    expect(serializeWorkbook(flags.workbook).version).toBe(50);
  });

  test("all old valid versions 1..49 still migrate without a detailed style", () => {
    const ordinary = serializeWorkbook(createTestWorkbookSession().workbook);
    const sheet = ordinary.sheets[0]!;
    for (let version = 1; version <= 49; version++) {
      const input: Record<string, unknown> = {
        ...ordinary,
        version,
        sheets: [
          {
            id: sheet.id,
            name: sheet.name,
            cells: [],
            rowHeights: [],
            columnWidths: [],
            floatingImages: [],
            properties: sheet.properties,
          },
        ],
      };
      if (version < 3) delete input.dateSystem;
      expect(serializeWorkbook(deserializeWorkbook(input))).toEqual(ordinary);
    }
  });
});
