import { describe, expect, test, vi } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type SheetSnapshot,
} from "../../serialization.js";
import type { ImageAppearance, ImageThemeEffectSuppression } from "../../image-appearance.js";
import { isPictureGroup, traversePictureGroup } from "../../picture-group.js";
import { getActiveSheet, setCellContent, type LegacyFloatingImage } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture as ownedFixture } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import { fixture as pivotFixture } from "../pivot-tables/fixture.js";
import { calculatedColumnFixture } from "../tables/calculated-column-fixture.js";

const locations = ["cell", "legacy-root", "framed-root", "nested-leaf"] as const;
type Location = (typeof locations)[number];

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
  };
}

function install(location: Location, flags: ImageThemeEffectSuppression = { shadow: true }) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const transform = { appearance: { suppressThemeEffects: flags } };
  if (location === "cell") {
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "cell", altText: "", transform },
      },
    );
  } else if (location === "legacy-root") {
    sheet.floatingImages = [{ ...legacy(), transform }];
  } else if (location === "framed-root") {
    sheet.floatingImages = [{ ...picture("framed", 0), transform }];
  } else {
    const f = ownedFixture();
    f.picture.transform!.appearance!.suppressThemeEffects = flags;
    sheet.floatingImages = [f.root];
  }
  return { session, workbook: session.workbook, sheet };
}

function suppressedAppearance(sheet: SheetSnapshot): ImageAppearance {
  for (const cell of sheet.cells) {
    if (cell.content?.kind === "image") {
      const appearance = cell.content.image.transform?.appearance;
      if (appearance && Object.hasOwn(appearance, "suppressThemeEffects")) return appearance;
    }
  }
  for (const root of sheet.floatingImages) {
    const nodes = isPictureGroup(root)
      ? traversePictureGroup(root).map(({ node }) => node)
      : [root];
    for (const node of nodes) {
      if ("members" in node) continue;
      const appearance = node.transform?.appearance;
      if (appearance && Object.hasOwn(appearance, "suppressThemeEffects")) return appearance;
    }
  }
  throw Error("Expected a suppression field");
}

describe("internal V49 picture theme suppression persistence", () => {
  test.each(locations)("round trips sparse flags exactly for a %s", (location) => {
    for (const flag of ["shadow", "outline", "reflection", "bevel"] as const) {
      const f = install(location, { [flag]: true });
      const snapshot = serializeWorkbook(f.workbook);
      expect(snapshot.version).toBe(49);
      expect(suppressedAppearance(snapshot.sheets[0]!).suppressThemeEffects).toEqual({
        [flag]: true,
      });
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      const sheet = serializeSheet(f.sheet);
      expect(serializeSheet(deserializeSheet(sheet))).toEqual(sheet);
    }
  });

  test.each(locations)(
    "rejects a suppression field in an old %s envelope, even when empty",
    (location) => {
      const f = install(location);
      const snapshot = serializeWorkbook(f.workbook);
      for (let version = 1; version <= 48; version++) {
        const old: Record<string, unknown> = { ...snapshot, version };
        if (version < 3) delete old.dateSystem;
        expect(() => deserializeWorkbook(old)).toThrow(/version 49/);
      }
      suppressedAppearance(snapshot.sheets[0]!).suppressThemeEffects = {};
      expect(() => deserializeWorkbook({ ...snapshot, version: 48 })).toThrow(/version 49/);
      suppressedAppearance(snapshot.sheets[0]!).suppressThemeEffects = undefined;
      expect(() => deserializeWorkbook({ ...snapshot, version: 48 })).toThrow(/version 49/);
    },
  );

  test.each(locations)(
    "rejects malformed V49 %s flags and accessors without invoking them",
    (location) => {
      const f = install(location);
      for (const malformed of [
        null,
        [],
        { shadow: false },
        { outline: undefined },
        { glow: true },
      ]) {
        const snapshot = serializeWorkbook(f.workbook);
        suppressedAppearance(snapshot.sheets[0]!).suppressThemeEffects =
          malformed as unknown as ImageThemeEffectSuppression;
        expect(() => deserializeWorkbook(snapshot)).toThrow();
        expect(() => deserializeSheet(snapshot.sheets[0]!)).toThrow();
      }
      const getter = vi.fn(() => true);
      const snapshot = serializeWorkbook(f.workbook);
      const appearance = suppressedAppearance(snapshot.sheets[0]!);
      Object.defineProperty(appearance.suppressThemeEffects!, "shadow", { get: getter });
      expect(() => deserializeWorkbook(snapshot)).toThrow(/data/);
      expect(() => deserializeSheet(snapshot.sheets[0]!)).toThrow(/data/);
      const other = serializeWorkbook(f.workbook);
      Object.defineProperty(suppressedAppearance(other.sheets[0]!), "suppressThemeEffects", {
        get: getter,
      });
      expect(() => deserializeWorkbook(other)).toThrow(/data/);
      expect(() => deserializeSheet(other.sheets[0]!)).toThrow(/data/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  test("canonical empty suppression emits the same existing feature versions", () => {
    for (const [location, version] of [
      ["cell", 43],
      ["legacy-root", 43],
      ["framed-root", 47],
      ["nested-leaf", 48],
    ] as const) {
      const f = install(location, {});
      const snapshot = serializeWorkbook(f.workbook);
      expect(snapshot.version).toBe(version);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    }
    const pivot = pivotFixture();
    pivot.destination.pivotTables = [
      {
        ...pivot.table,
        sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
      },
    ];
    expect(serializeWorkbook(pivot.workbook).version).toBe(44);
    const calculated = calculatedColumnFixture();
    calculated.sheet.tables![0]!.columns[2]!.calculatedColumnFormula = "=B2*2";
    expect(serializeWorkbook(calculated.workbook).version).toBe(45);
    const font = createTestWorkbookSession();
    setCellContent(
      getActiveSheet(font.workbook),
      { row: 0, column: 0 },
      { kind: "literal", value: "Font", fontRuns: [{ start: 0, end: 4, fontFamily: "Arial" }] },
    );
    expect(serializeWorkbook(font.workbook).version).toBe(46);
  });

  test("every old version still migrates a valid workbook without suppression", () => {
    const ordinary = serializeWorkbook(createTestWorkbookSession().workbook);
    const sheet = ordinary.sheets[0]!;
    for (let version = 1; version <= 48; version++) {
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

  test("one hidden nested leaf keeps V49 alongside manual pivots, calculated columns, fonts and frames", () => {
    const f = pivotFixture();
    f.destination.pivotTables = [
      {
        ...f.table,
        sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
      },
    ];
    const calculated = calculatedColumnFixture();
    calculated.sheet.tables![0]!.columns[2]!.calculatedColumnFormula = "=B2*2";
    f.source.tables = calculated.sheet.tables;
    setCellContent(
      f.source,
      { row: 0, column: 0 },
      { kind: "literal", value: "Region", fontRuns: [{ start: 0, end: 6, fontFamily: "Arial" }] },
    );
    const owned = ownedFixture();
    owned.picture.transform!.appearance!.suppressThemeEffects = { bevel: true };
    f.source.floatingImages = [picture("framed", 700), owned.root];
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(49);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    for (const sheet of [f.source, f.destination]) {
      const isolated = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(isolated))).toEqual(isolated);
    }
  });
});
