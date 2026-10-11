import { describe, expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import type { GroupedGroup, GroupedPicture, PictureGroup } from "@sheetcraft/core/picture-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { getPictureViewportFragments } from "../../../modules/sheet-images/picture-viewport-fragments";
import { getOwnedPictureGroupViewportFragments } from "../../../modules/sheet-images/picture-owned-group-fragments";
import {
  assertPicturePaintSupport,
  UnsupportedPicturePaintError,
} from "../../../modules/sheet-images/picture-paint-effects";
import { paintFloatingImages } from "../../../modules/sheet-images/floating-image-painter";
import type { DrawingThemeEffects } from "../../../modules/sheet-images/drawing-theme-effects";
import { pictureGroup } from "./picture-group-fixture";
import { framedPicture } from "./framed-picture-fixture";

function view() {
  const sheet = createSheet("Synthetic", "sheet");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 13, y: 7 },
    viewportSize: { width: 500, height: 500 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}

function leaf(id: string): GroupedPicture {
  const node = pictureGroup().members[0]!;
  if (node.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
  return {
    ...node,
    id,
    assetId: `asset-${id}`,
    frame: { ...node.frame, angleDeg: 0 },
  };
}

function group(id = "group"): PictureGroup {
  const root = pictureGroup();
  root.id = id;
  root.frame.angleDeg = 0;
  root.frame.anchor = { mode: "fixed", x: 130, y: 70, size: { width: 120, height: 80 } };
  const parent: GroupedGroup = {
    kind: "grouped-group-v1",
    id: `${id}-owner`,
    altText: "Synthetic owner",
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      angleDeg: 37,
    },
    members: [leaf(`${id}-middle`)],
  };
  root.members = [leaf(`${id}-bottom`), parent, leaf(`${id}-top`)];
  return root;
}

function legacy(id = "legacy"): LegacyFloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: "Synthetic legacy",
    anchor: { row: 0, column: 1 },
    offsetX: 34,
    offsetY: 70,
    width: 120,
    height: 80,
  };
}

function fixture() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    globalAlpha: 1,
  };
  const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const cache = {
    get: vi.fn((_url: string): HTMLImageElement | undefined => decoded),
    load: vi.fn(async () => {}),
    retain: vi.fn(),
    dispose: vi.fn(),
  };
  const frameContext = view();
  const root = group();
  const options: Parameters<typeof paintFloatingImages>[1] = {
    state: { images: [root], revision: 1 },
    layout: frameContext.layout,
    frameContext,
    assetUrls: new Map([
      ["asset-group-bottom", "blob:bottom"],
      ["asset-group-middle", "blob:middle"],
      ["asset-group-top", "blob:top"],
      ["group", "blob:fake-container"],
    ]),
    cache,
    palette: {
      placeholderBackground: "#eee",
      placeholderStripe: "#ddd",
      placeholderBorder: "#ccc",
      placeholderText: "#666",
    },
    loadingLabel: "Loading",
    unavailableLabel: "Unavailable",
  };
  const paint = () => paintFloatingImages(context as unknown as CanvasRenderingContext2D, options);
  return { context, decoded, cache, frameContext, root, options, paint };
}

function noSideEffects(f: ReturnType<typeof fixture>): void {
  expect(f.context.save).not.toHaveBeenCalled();
  expect(f.context.clip).not.toHaveBeenCalled();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  expect(f.context.fillRect).not.toHaveBeenCalled();
  expect(f.cache.get).not.toHaveBeenCalled();
  expect(f.cache.load).not.toHaveBeenCalled();
  expect(f.cache.retain).not.toHaveBeenCalled();
}

describe("prepared whole-forest owned group viewport projection", () => {
  test("preserves interleaved root order and nested sibling order using genuine group-leaf variants", () => {
    const f = fixture();
    const first = legacy("first"),
      last = legacy("last"),
      framed = framedPicture(),
      other = group("second");
    framed.frame.anchor = { mode: "fixed", x: 130, y: 70, size: { width: 120, height: 80 } };
    const fragments = getPictureViewportFragments(
      [first, f.root, framed, other, last],
      f.frameContext.layout,
      f.frameContext,
    );
    expect([...new Set(fragments.map(({ image }) => image.id))]).toEqual([
      "first",
      "group-bottom",
      "group-middle",
      "group-top",
      "framed",
      "second-bottom",
      "second-middle",
      "second-top",
      "last",
    ]);
    const groupFragments = fragments.filter(({ kind }) => kind === "group-leaf");
    expect(groupFragments).toEqual([
      ...getOwnedPictureGroupViewportFragments(f.root, f.frameContext),
      ...getOwnedPictureGroupViewportFragments(other, f.frameContext),
    ]);
    for (const fragment of fragments) {
      if (fragment.kind === "legacy")
        expect(fragment.image).toBe(fragment.image.id === "first" ? first : last);
      else if (fragment.kind === "framed") expect(fragment.image).toBe(framed);
      else {
        expect(fragment.image).not.toHaveProperty("members");
        expect(fragment.path[0]).toBe(fragment.rootId);
        expect(fragment.path.at(-1)).toBe(fragment.image.id);
        expect(fragment.geometry.sourceRect).not.toBeNull();
      }
    }
  });

  test("requires context for hidden groups and rejects mismatched layout before projection", () => {
    const f = fixture();
    f.root.hidden = true;
    const project = vi.spyOn(f.options.layout, "getCellRect");
    expect(() => getPictureViewportFragments([legacy(), f.root], f.options.layout)).toThrow(
      "require a frame context",
    );
    expect(() => getPictureViewportFragments([legacy(), f.root], f.options.layout, view())).toThrow(
      "supplied viewport layout",
    );
    expect(project).not.toHaveBeenCalled();
  });

  test.each([
    "duplicate-root-leaf",
    "shared-owner",
    "hidden-source",
    "hidden-derived",
    "forest-budget",
  ] as const)(
    "rejects %s across the complete forest before visible legacy projection or canvas/cache",
    (invalid) => {
      const f = fixture();
      f.options.state = { images: [legacy("first"), f.root], revision: 1 };
      if (invalid === "duplicate-root-leaf") f.root.members[0]!.id = "first";
      else if (invalid === "shared-owner")
        f.options.state = { ...f.options.state, images: [legacy("first"), f.root, f.root] };
      else if (invalid === "forest-budget") {
        f.options.state = {
          ...f.options.state,
          images: Array.from({ length: 10_001 }, (_, index) => legacy(`root-${index}`)),
        };
      } else {
        const parent = f.root.members[1]!;
        if (parent.kind !== "grouped-group-v1") throw new Error("Expected fixture owner.");
        parent.hidden = true;
        const child = parent.members[0]!;
        if (child.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
        if (invalid === "hidden-source") child.frame.source.widthRatio = 0;
        else child.frame.rect.widthRatio = Number.MAX_VALUE;
      }
      const project = vi.spyOn(f.options.layout, "getCellRect");
      expect(f.paint).toThrow();
      expect(project).not.toHaveBeenCalled();
      noSideEffects(f);
    },
  );

  test("validates a late hidden standalone derived frame before projecting earlier roots", () => {
    const f = fixture(),
      framed = framedPicture();
    framed.hidden = true;
    framed.frame.source.widthRatio = Number.MAX_VALUE;
    f.options.state = { images: [legacy("first"), f.root, framed], revision: 1 };
    const project = vi.spyOn(f.options.layout, "getCellRect");
    expect(f.paint).toThrow();
    expect(project).not.toHaveBeenCalled();
    noSideEffects(f);
  });
});

describe("prepared actual owned leaf canvas dispatch", () => {
  test("paints and retains only real leaf asset URLs, never a source-free owner asset", () => {
    const f = fixture();
    f.paint();
    expect(f.cache.get.mock.calls).toEqual([["blob:bottom"], ["blob:middle"], ["blob:top"]]);
    expect(f.context.drawImage).toHaveBeenCalledTimes(3);
    expect(f.context.rotate.mock.calls).toEqual([[0], [(37 * Math.PI) / 180], [0]]);
    expect(f.context.rect.mock.calls).toEqual(Array(3).fill([96, 24, 404, 476]));
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
      new Set(["blob:bottom", "blob:middle", "blob:top"]),
    );
    expect(f.root).not.toHaveProperty("assetId");
    expect(f.root.members[1]).not.toHaveProperty("assetId");
  });

  test("dispatches interleaved legacy/group/framed roots without changing their z-order", () => {
    const f = fixture(),
      framed = framedPicture();
    framed.frame.anchor = { mode: "fixed", x: 130, y: 70, size: { width: 120, height: 80 } };
    f.options.state = { images: [legacy("first"), f.root, framed, legacy("last")], revision: 1 };
    f.options.assetUrls = new Map([
      ...f.options.assetUrls,
      ["asset-first", "blob:first"],
      [framed.assetId, "blob:framed"],
      ["asset-last", "blob:last"],
    ]);
    f.paint();
    expect(f.cache.get.mock.calls).toEqual([
      ["blob:first"],
      ["blob:bottom"],
      ["blob:middle"],
      ["blob:top"],
      ["blob:framed"],
      ["blob:last"],
    ]);
    expect(f.context.drawImage).toHaveBeenCalledTimes(6);
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
      new Set(["blob:first", "blob:bottom", "blob:middle", "blob:top", "blob:framed", "blob:last"]),
    );
  });

  test.each([false, true])(
    "uses a real leaf's local rotated placeholder, loading %s",
    (loading) => {
      const f = fixture();
      f.cache.get.mockReturnValue(undefined);
      f.options.loadingAssetIds = loading ? new Set(["asset-group-middle"]) : new Set();
      f.paint();
      expect(f.context.drawImage).not.toHaveBeenCalled();
      expect(f.context.fillRect.mock.calls).toEqual(Array(3).fill([0, 0, 120, 80]));
      expect(f.context.rotate.mock.calls).toEqual([[0], [(37 * Math.PI) / 180], [0]]);
      expect(f.context.fillText.mock.calls).toEqual([
        ["Unavailable", 60, 40, 112],
        [loading ? "Loading" : "Unavailable", 60, 40, 112],
        ["Unavailable", 60, 40, 112],
      ]);
      expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
        new Set(["blob:bottom", "blob:middle", "blob:top"]),
      );
    },
  );

  test("omits hidden parent and leaf resources, and retains nothing for a hidden root", () => {
    const f = fixture();
    f.root.members[0]!.hidden = true;
    f.root.members[1]!.hidden = true;
    f.paint();
    expect(f.cache.get.mock.calls).toEqual([["blob:top"]]);
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(new Set(["blob:top"]));
    f.cache.get.mockClear();
    f.cache.retain.mockClear();
    f.root.hidden = true;
    f.paint();
    expect(f.cache.get).not.toHaveBeenCalled();
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(new Set());
  });

  test.each([false, true])(
    "rejects a late owned reflection atomically even with a hidden owner %s",
    (hidden) => {
      const f = fixture();
      const parent = f.root.members[1]!;
      if (parent.kind !== "grouped-group-v1") throw new Error("Expected fixture owner.");
      parent.hidden = hidden;
      const picture = parent.members[0]!;
      if (picture.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
      picture.transform = { appearance: { reflection: true } };
      f.options.state = { images: [legacy("first"), f.root], revision: 1 };
      expect(f.paint).toThrow("reflection");
      noSideEffects(f);
    },
  );

  test.each([
    DEFAULT_WORKBOOK_THEME.effects,
    { shadow: "soft", reflection: false, bevel: false, outlineWidth: 0, gradient: false },
    { shadow: "none", reflection: true, bevel: false, outlineWidth: 0, gradient: false },
    { shadow: "none", reflection: false, bevel: true, outlineWidth: 0, gradient: false },
    { shadow: "none", reflection: false, bevel: false, outlineWidth: 2, gradient: false },
  ] satisfies DrawingThemeEffects[])(
    "paints inherited effects using only real owned leaf sources: %j",
    (effects) => {
      const f = fixture();
      const before = structuredClone(f.root);
      f.options.state = { images: [f.root], revision: 1, effects };
      f.paint();
      expect(f.cache.get.mock.calls).toEqual([["blob:bottom"], ["blob:middle"], ["blob:top"]]);
      expect(f.context.drawImage).toHaveBeenCalledTimes(effects.reflection ? 6 : 3);
      expect(f.context.drawImage.mock.calls.every((call) => call[0] === f.decoded)).toBe(true);
      expect(f.context.rotate.mock.calls).toEqual([[0], [(37 * Math.PI) / 180], [0]]);
      expect(f.context.rect.mock.calls).toEqual(Array(3).fill([96, 24, 404, 476]));
      expect(f.context.strokeRect).toHaveBeenCalledTimes(effects.outlineWidth > 0 ? 3 : 0);
      expect(f.context.stroke).toHaveBeenCalledTimes(effects.bevel ? 6 : 0);
      expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
        new Set(["blob:bottom", "blob:middle", "blob:top"]),
      );
      expect(f.root).toEqual(before);
      expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
    },
  );

  test("a hidden owned reflection rejects through the shared command/save guard before cache or source preparation", () => {
    const f = fixture();
    f.root.hidden = true;
    const picture = f.root.members[0]!;
    if (picture.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
    picture.transform = { appearance: { reflection: true, transparentColor: "#FFFFFF" } };
    f.options.effects = DEFAULT_WORKBOOK_THEME.effects;
    const create = vi.spyOn(document, "createElement");
    expect(() => assertPicturePaintSupport([f.root], f.options.effects)).toThrow(
      UnsupportedPicturePaintError,
    );
    expect(new UnsupportedPicturePaintError().code).toBe("unsupported-picture-reflection");
    expect(f.paint).toThrow("reflection");
    expect(create).not.toHaveBeenCalled();
    noSideEffects(f);
    create.mockRestore();
  });

  test("an unsupported future theme rejects the complete hidden forest before earlier legacy paint", () => {
    const f = fixture();
    f.root.hidden = true;
    f.options.state = { images: [legacy("first"), f.root], revision: 1 };
    f.options.effects = {
      ...DEFAULT_WORKBOOK_THEME.effects,
      shadow: "future-shadow",
    } as unknown as DrawingThemeEffects;
    expect(f.paint).toThrow("Inherited drawing theme shadow");
    noSideEffects(f);
  });

  test("hidden reflection geometry overflow rejects before projecting or touching any cache", () => {
    const f = fixture();
    f.root.hidden = true;
    f.root.frame.anchor = {
      mode: "fixed",
      x: 0,
      y: 0,
      size: { width: 100, height: 100 },
    };
    const picture = leaf("group-bottom");
    picture.frame.rect.heightRatio = Number.MAX_VALUE * 0.0075;
    f.root.members = [picture];
    f.options.state = { images: [legacy("first"), f.root], revision: 1 };
    f.options.effects = { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true };
    const project = vi.spyOn(f.options.layout, "getCellRect");
    expect(f.paint).toThrow("reflection translation");
    expect(project).not.toHaveBeenCalled();
    noSideEffects(f);
  });

  test("accepts a fill-only theme gradient without altering owned photo pixels", () => {
    const f = fixture();
    f.options.effects = {
      shadow: "none",
      reflection: false,
      bevel: false,
      outlineWidth: 0,
      gradient: true,
    };
    f.paint();
    expect(f.context.drawImage).toHaveBeenCalledTimes(3);
  });

  test.each(["cache", "decoded", "placeholder"] as const)(
    "balances and retains all actual leaf URLs after %s failure",
    (failure) => {
      const f = fixture();
      const reject = () => {
        throw new Error("Source lost");
      };
      if (failure === "cache") f.cache.get.mockImplementation(reject);
      else if (failure === "decoded") f.context.drawImage.mockImplementation(reject);
      else {
        f.cache.get.mockReturnValue(undefined);
        f.context.fillText.mockImplementation(reject);
      }
      expect(f.paint).toThrow("Source lost");
      expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
      expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
        new Set(["blob:bottom", "blob:middle", "blob:top"]),
      );
    },
  );
});
