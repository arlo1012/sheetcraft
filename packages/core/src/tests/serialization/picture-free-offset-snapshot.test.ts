import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resolvePictureFrame, type PictureFrameAnchor } from "../../picture-frame.js";
import { resolvePictureGroup } from "../../picture-group-layout.js";
import { isPictureGroup } from "../../picture-group.js";
import { isFramedPictureObject, type FramedFloatingImage } from "../../picture-object.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getActiveSheet, setColumnWidth, type FloatingImage } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";
import { group } from "../picture-groups/fixtures.js";

type RootKind = "picture" | "group";
type RelativeMode = "move-only" | "move-and-size";
const cases = [
  ["picture", "move-only"],
  ["picture", "move-and-size"],
  ["group", "move-only"],
  ["group", "move-and-size"],
] as const;
function relativeAnchor(mode: RelativeMode, free = true): PictureFrameAnchor {
  const offsetMode = free ? { offsetMode: "free-pixels" as const } : {};
  const start = { column: { index: 0, offset: 160.25 }, row: { index: 0, offset: 35.5 } };
  return mode === "move-only"
    ? { mode, origin: start, size: { width: 120, height: 80 }, ...offsetMode }
    : {
        mode,
        start,
        end: { column: { index: 4, offset: 180.75 }, row: { index: 8, offset: 42.25 } },
        ...offsetMode,
      };
}
function fixture(kind: RootKind, anchor: PictureFrameAnchor) {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  const root: FramedFloatingImage | ReturnType<typeof group> =
    kind === "group"
      ? group()
      : {
          id: "picture",
          assetId: "synthetic-asset",
          altText: "Synthetic picture",
          frame: {
            kind: "object-frame-v1",
            anchor,
            source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
            angleDeg: 17,
            flipHorizontal: true,
          },
        };
  root.frame.anchor = anchor;
  sheet.floatingImages = [root];
  return { workbook, sheet, root };
}
function rootAnchor(root: FloatingImage): PictureFrameAnchor {
  if (!isPictureGroup(root) && !isFramedPictureObject(root)) throw Error("Bad root fixture.");
  return root.frame.anchor;
}

describe("conditional V86 free-pixel picture-root snapshot protocol", () => {
  test("an ordinary workbook retains its previous minimum version", () => {
    expect(serializeWorkbook(createTestWorkbook()).version).toBe(43);
  });

  test.each(cases)("bounded %s %s roots retain the old protocol", (kind, mode) => {
    const f = fixture(kind, relativeAnchor(mode, false));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(kind === "picture" ? 47 : 48);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(f.sheet)))).toEqual(snapshot.sheets[0]);
  });

  test.each(cases)("free %s %s roots select V86 and standalone sheets infer it", (kind, mode) => {
    const anchor = relativeAnchor(mode);
    const f = fixture(kind, anchor);
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(86);
    const restored = deserializeWorkbook(JSON.parse(JSON.stringify(snapshot)));
    expect(rootAnchor(getActiveSheet(restored).floatingImages[0]!)).toEqual(anchor);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    const sheetSnapshot = serializeSheet(f.sheet);
    const restoredSheet = deserializeSheet(JSON.parse(JSON.stringify(sheetSnapshot)));
    expect(rootAnchor(restoredSheet.floatingImages[0]!)).toEqual(anchor);
    expect(serializeSheet(restoredSheet)).toEqual(sheetSnapshot);
    // Mutating a restored root must not alias either source or persisted snapshot.
    const restoredAnchor = rootAnchor(restoredSheet.floatingImages[0]!);
    if (restoredAnchor.mode === "fixed") throw Error("Bad relative fixture.");
    const point =
      restoredAnchor.mode === "move-only" ? restoredAnchor.origin : restoredAnchor.start;
    point.column.offset = 1;
    expect(rootAnchor(f.root)).toEqual(anchor);
    expect(rootAnchor(sheetSnapshot.floatingImages[0]!)).toEqual(anchor);
  });

  test.each(cases)("every pre-V86 envelope rejects a free %s %s root", (kind, mode) => {
    const f = fixture(kind, relativeAnchor(mode));
    const snapshot = serializeWorkbook(f.workbook);
    for (let version = 1; version <= 85; version++) {
      const envelope: Record<string, unknown> = { ...snapshot, version };
      // V1/V2 cannot declare a date system; reach the picture feature gate itself.
      if (version < 3) delete envelope.dateSystem;
      expect(() => deserializeWorkbook(envelope)).toThrow(/version 86/);
    }
  });

  test.each(["picture", "group"] as const)(
    "%s raw own fields cannot be erased or defaulted through an older envelope",
    (kind) => {
      const f = fixture(kind, relativeAnchor("move-only", false));
      const snapshot = serializeWorkbook(f.workbook);
      const anchor = rootAnchor(snapshot.sheets[0]!.floatingImages[0]!);
      for (const value of [undefined, "free-pixels", "unknown", null, false]) {
        Object.defineProperty(anchor, "offsetMode", { value, configurable: true });
        expect(() => deserializeWorkbook({ ...snapshot, version: 85 })).toThrow(/version 86/);
      }
      const getter = vi.fn(() => "free-pixels");
      Object.defineProperty(anchor, "offsetMode", { get: getter, configurable: true });
      expect(() => deserializeWorkbook({ ...snapshot, version: 85 })).toThrow(/version 86/);
      expect(() => deserializeWorkbook({ ...snapshot, version: 86 })).toThrow(/accessor/);
      expect(() => deserializeSheet(snapshot.sheets[0])).toThrow(/accessor/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  test.each(["picture", "group"] as const)(
    "%s non-enumerable mode fields retain presence in V86 validation and inference",
    (kind) => {
      const f = fixture(kind, relativeAnchor("move-only", false));
      const snapshot = serializeWorkbook(f.workbook);
      const anchor = rootAnchor(snapshot.sheets[0]!.floatingImages[0]!);
      for (const value of [undefined, "unknown"]) {
        Object.defineProperty(anchor, "offsetMode", { value, configurable: true });
        expect(() => deserializeWorkbook({ ...snapshot, version: 86 })).toThrow();
        expect(() => deserializeSheet(snapshot.sheets[0])).toThrow();
      }
      Object.defineProperty(anchor, "offsetMode", { value: "free-pixels", configurable: true });
      const restored = deserializeWorkbook({ ...snapshot, version: 86 });
      expect(rootAnchor(getActiveSheet(restored).floatingImages[0]!)).toHaveProperty(
        "offsetMode",
        "free-pixels",
      );
      expect(serializeWorkbook(restored).version).toBe(86);
      const restoredSheet = deserializeSheet(snapshot.sheets[0]);
      expect(rootAnchor(restoredSheet.floatingImages[0]!)).toHaveProperty(
        "offsetMode",
        "free-pixels",
      );
    },
  );

  test.each(cases)("V86 and standalone %s %s reject unknown offset modes", (kind, mode) => {
    const f = fixture(kind, relativeAnchor(mode));
    const snapshot = serializeWorkbook(f.workbook);
    Object.assign(rootAnchor(snapshot.sheets[0]!.floatingImages[0]!), { offsetMode: "unknown" });
    expect(() => deserializeWorkbook(snapshot)).toThrow();
    expect(() => deserializeSheet(snapshot.sheets[0])).toThrow();
  });

  test.each(["picture", "group"] as const)("fixed %s anchors cannot carry offsetMode", (kind) => {
    const f = fixture(kind, { mode: "fixed", x: 5, y: 10, size: { width: 120, height: 80 } });
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(kind === "picture" ? 47 : 48);
    for (const value of ["free-pixels", undefined]) {
      Object.assign(rootAnchor(snapshot.sheets[0]!.floatingImages[0]!), { offsetMode: value });
      expect(() => deserializeWorkbook({ ...snapshot, version: 85 })).toThrow(/version 86/);
      expect(() => deserializeWorkbook({ ...snapshot, version: 86 })).toThrow();
      expect(() => deserializeSheet(snapshot.sheets[0])).toThrow();
      Object.defineProperty(rootAnchor(snapshot.sheets[0]!.floatingImages[0]!), "offsetMode", {
        value,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      expect(() => deserializeWorkbook({ ...snapshot, version: 86 })).toThrow();
      expect(() => deserializeSheet(snapshot.sheets[0])).toThrow();
    }
  });

  test.each(["frame", "anchor"] as const)(
    "%s accessors never run during protocol inference",
    (field) => {
      const f = fixture("picture", relativeAnchor("move-only"));
      const snapshot = serializeWorkbook(f.workbook);
      const root = snapshot.sheets[0]!.floatingImages[0]!;
      if (!isFramedPictureObject(root)) throw Error("Bad fixture.");
      const target = field === "frame" ? root : root.frame;
      const value = field === "frame" ? root.frame : root.frame.anchor;
      const getter = vi.fn(() => value);
      Object.defineProperty(target, field, { get: getter, configurable: true });
      expect(() => deserializeWorkbook({ ...snapshot, version: 85 })).toThrow(/accessor/);
      expect(() => deserializeWorkbook(snapshot)).toThrow(/accessor/);
      expect(() => deserializeSheet(snapshot.sheets[0])).toThrow(/accessor/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  test.each(["picture", "group"] as const)(
    "%s logically ordered but physically collapsed anchors can be read and saved without history",
    (kind) => {
      const anchor: PictureFrameAnchor = {
        mode: "move-and-size",
        offsetMode: "free-pixels",
        start: { column: { index: 0, offset: 200 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
      };
      const f = fixture(kind, anchor);
      setColumnWidth(f.sheet, 0, 40);
      const snapshot = serializeWorkbook(f.workbook);
      expect(snapshot.version).toBe(86);
      const restored = deserializeWorkbook(JSON.parse(JSON.stringify(snapshot)));
      const sheet = getActiveSheet(restored);
      const root = sheet.floatingImages[0]!;
      const layout = () => {
        const metrics = createPictureSheetMetrics(sheet);
        if (isPictureGroup(root)) return resolvePictureGroup(root, metrics).layout;
        if (isFramedPictureObject(root)) return resolvePictureFrame(root.frame, metrics);
        throw Error("Bad fixture.");
      };
      expect(layout().collapsed).toBe(true);
      expect(layout().rect.width).toBe(0);
      expect(rootAnchor(root)).toEqual(anchor);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(snapshot.sheets[0]))).toEqual(snapshot.sheets[0]);
      setColumnWidth(sheet, 0, 400);
      expect(layout().collapsed).toBe(false);
      expect(layout().rect.width).toBe(200);
      expect(rootAnchor(root)).toEqual(anchor);
    },
  );
});
