import { describe, expect, test, vi } from "vitest";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPictureViewMetrics,
  getFramedPictureViewportFragments,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getFloatingImageViewportFragmentsForPaint,
  paintFloatingImages,
} from "../../../modules/sheet-images/floating-image-painter";
import { getPictureViewportFragments } from "../../../modules/sheet-images/picture-viewport-fragments";
import type { DrawingThemeEffects } from "../../../modules/sheet-images/drawing-theme-effects";

function createView(hiddenColumns: readonly number[] = []) {
  const sheet = createSheet("Synthetic", "sheet");
  sheet.hiddenColumns = new Set(hiddenColumns);
  const geometry = createSheetGeometry({
    rowCount: 20,
    columnCount: 20,
    hiddenColumns: sheet.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 13, y: 7 },
    viewportSize: { width: 240, height: 120 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}

function legacy(id = "legacy"): LegacyFloatingImage {
  return {
    id,
    assetId: id,
    altText: "Synthetic legacy",
    anchor: { row: 0, column: 0 },
    offsetX: 40,
    offsetY: 10,
    width: 100,
    height: 50,
  };
}

function framed(): FramedFloatingImage {
  return {
    id: "framed",
    assetId: "framed",
    altText: "Synthetic framed",
    groupId: "group",
    lockAspectRatio: false,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 10, size: { width: 100, height: 50 } },
      angleDeg: 37,
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}

const palette = {
  placeholderBackground: "#eee",
  placeholderStripe: "#ddd",
  placeholderBorder: "#ccc",
  placeholderText: "#666",
};

const noEffects: DrawingThemeEffects = {
  shadow: "none",
  reflection: false,
  bevel: false,
  outlineWidth: 0,
  gradient: false,
};

function paintFixture() {
  const view = createView();
  const picture = framed();
  const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
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
  const cache = {
    get: vi.fn((_url: string): HTMLImageElement | undefined => decoded),
    load: vi.fn(async () => {}),
    retain: vi.fn(),
    dispose: vi.fn(),
  };
  const options: Parameters<typeof paintFloatingImages>[1] = {
    state: { images: [picture], revision: 1 },
    layout: view.layout,
    frameContext: view,
    assetUrls: new Map([[picture.assetId, "blob:framed"]]),
    cache,
    palette,
    loadingLabel: "Loading",
    unavailableLabel: "Unavailable",
  };
  const paint = () => paintFloatingImages(context as unknown as CanvasRenderingContext2D, options);
  return { picture, decoded, context, cache, options, paint };
}

function expectNoPaintSideEffects(fixture: ReturnType<typeof paintFixture>) {
  expect(fixture.context.save).not.toHaveBeenCalled();
  expect(fixture.context.clip).not.toHaveBeenCalled();
  expect(fixture.context.drawImage).not.toHaveBeenCalled();
  expect(fixture.context.fillRect).not.toHaveBeenCalled();
  expect(fixture.cache.get).not.toHaveBeenCalled();
  expect(fixture.cache.load).not.toHaveBeenCalled();
  expect(fixture.cache.retain).not.toHaveBeenCalled();
}

describe("owned picture viewport fragment adapter", () => {
  test("keeps the legacy paint contract while preserving mixed object stacking order", () => {
    const view = createView();
    const first = legacy("first"),
      picture = framed(),
      last = legacy("last");
    const fragments = getPictureViewportFragments([first, picture, last], view.layout, view);
    expect(fragments.map((fragment) => fragment.image.id)).toEqual([
      ...Array(4).fill("first"),
      ...Array(4).fill("framed"),
      ...Array(4).fill("last"),
    ]);
    for (const fragment of fragments) {
      expect(fragment.image).toBe(
        fragment.kind === "framed" ? picture : fragment.image.id === "first" ? first : last,
      );
      if (fragment.kind === "framed") {
        expect(fragment).not.toHaveProperty("rect");
        expect(fragment).not.toHaveProperty("clippedRect");
      } else {
        expect(fragment).not.toHaveProperty("geometry");
        expect(fragment).not.toHaveProperty("clippedBounds");
      }
    }
    expect(
      getPictureViewportFragments([first], view.layout).map(
        ({ kind: _kind, ...fragment }) => fragment,
      ),
    ).toEqual(getFloatingImageViewportFragmentsForPaint([first], view.layout));
    expect(() => getFloatingImageViewportFragmentsForPaint([first, picture], view.layout)).toThrow(
      "not yet enabled",
    );
  });

  test("retains the shared 37-degree source/quadrilateral projection through frozen panes", () => {
    const view = createView(),
      picture = framed();
    const fragments = getPictureViewportFragments([picture], view.layout, view);
    expect(fragments.map((fragment) => fragment.paneId)).toEqual([
      "topLeft",
      "top",
      "left",
      "body",
    ]);
    expect(fragments.map(({ kind: _kind, image: _image, ...fragment }) => fragment)).toEqual(
      getFramedPictureViewportFragments(picture, view),
    );
    for (const fragment of fragments) {
      if (fragment.kind !== "framed") throw new Error("Expected a framed fragment.");
      expect(fragment.geometry.angleDeg).toBe(37);
      expect(fragment.geometry.rect.width).toBe(100);
      expect(fragment.geometry.rect.height).toBe(50);
      expect(fragment.geometry.sourceRect?.width).toBe(200);
      expect(fragment.geometry.sourceRect?.height).toBe(100);
      expect(fragment.geometry.bounds.width).toBeGreaterThan(100);
      expect(fragment.geometry.bounds.height).toBeGreaterThan(50);
      expect(fragment.geometry.corners).toHaveLength(4);
    }
  });

  test("missing context, including a hidden late frame, refuses the whole collection first", () => {
    const view = createView(),
      picture = framed();
    picture.hidden = true;
    const resolveLegacy = vi.spyOn(view.layout, "getCellRect");
    expect(() => getPictureViewportFragments([legacy(), picture], view.layout)).toThrow(
      "require a frame context",
    );
    expect(resolveLegacy).not.toHaveBeenCalled();
  });

  test("a supplied context must own the exact layout even for a legacy-only collection", () => {
    const view = createView(),
      other = createView();
    const resolveLegacy = vi.spyOn(view.layout, "getCellRect");
    expect(() => getPictureViewportFragments([legacy()], view.layout, other)).toThrow(
      "supplied viewport layout",
    );
    expect(resolveLegacy).not.toHaveBeenCalled();
  });
});

describe("mixed framed picture canvas painting", () => {
  test("uses the prepared source crop and local rotation without doubling scale, headers or scroll", () => {
    const { context, decoded, cache, paint } = paintFixture();
    paint();
    expect(context.drawImage.mock.calls).toEqual(
      Array(4).fill([decoded, 100, 50, 200, 100, 0, 0, 100, 50]),
    );
    expect(context.rotate.mock.calls).toEqual(Array(4).fill([(37 * Math.PI) / 180]));
    expect(context.translate.mock.calls).toEqual([
      [90, 35],
      [-50, -25],
      [0, 0],
      [77, 35],
      [-50, -25],
      [0, 0],
      [90, 28],
      [-50, -25],
      [0, 0],
      [77, 28],
      [-50, -25],
      [0, 0],
    ]);
    expect(context.scale.mock.calls).toEqual(Array(4).fill([1, 1]));
    expect(context.rect.mock.calls).toEqual([
      [0, 0, 96, 24],
      [96, 0, 144, 24],
      [0, 24, 96, 96],
      [96, 24, 144, 96],
    ]);
    expect(context.clip).toHaveBeenCalledTimes(4);
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
    expect(cache.retain).toHaveBeenCalledExactlyOnceWith(new Set(["blob:framed"]));
  });

  test("dispatches mixed sources in original image order and retains every visible URL", () => {
    const f = paintFixture();
    f.options.state = { images: [legacy("first"), f.picture, legacy("last")], revision: 1 };
    f.options.assetUrls = new Map([
      ["first", "blob:first"],
      ["framed", "blob:framed"],
      ["last", "blob:last"],
    ]);
    f.paint();
    expect(f.cache.get.mock.calls).toEqual([
      ...Array(4).fill(["blob:first"]),
      ...Array(4).fill(["blob:framed"]),
      ...Array(4).fill(["blob:last"]),
    ]);
    expect(f.context.drawImage).toHaveBeenCalledTimes(12);
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
      new Set(["blob:first", "blob:framed", "blob:last"]),
    );
  });

  test.each([false, true])(
    "paints a truly rotated local placeholder when loading is %s",
    (loading) => {
      const f = paintFixture();
      f.cache.get.mockReturnValue(undefined);
      f.options.loadingAssetIds = loading ? new Set(["framed"]) : new Set();
      f.paint();
      expect(f.context.drawImage).not.toHaveBeenCalled();
      expect(f.context.fillRect.mock.calls).toEqual(Array(4).fill([0, 0, 100, 50]));
      expect(f.context.rotate.mock.calls).toEqual(Array(4).fill([(37 * Math.PI) / 180]));
      expect(f.context.translate.mock.calls).toEqual([
        [90, 35],
        [-50, -25],
        [77, 35],
        [-50, -25],
        [90, 28],
        [-50, -25],
        [77, 28],
        [-50, -25],
      ]);
      expect(f.context.fillText.mock.calls).toEqual(
        Array(4).fill([loading ? "Loading" : "Unavailable", 50, 25, 92]),
      );
      expect(f.context.setLineDash).toHaveBeenCalledWith(loading ? [] : [4, 3]);
      expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
      expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(new Set(["blob:framed"]));
    },
  );

  test("omits hidden and visibility-collapsed frames before source or canvas work", () => {
    const f = paintFixture();
    const collapsed = framed();
    collapsed.id = "collapsed";
    collapsed.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    f.picture.hidden = true;
    const view = createView([0]);
    f.options.layout = view.layout;
    f.options.frameContext = view;
    f.options.state = { images: [f.picture, collapsed], revision: 1 };
    f.paint();
    expect(f.context.save).not.toHaveBeenCalled();
    expect(f.cache.get).not.toHaveBeenCalled();
    expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(new Set());
  });

  test("missing frame context fails atomically even after a visible legacy object", () => {
    const f = paintFixture();
    f.options.frameContext = undefined;
    f.options.state = { images: [legacy(), f.picture], revision: 1 };
    expect(f.paint).toThrow("require a frame context");
    expectNoPaintSideEffects(f);
  });

  test("a different context layout fails atomically before cache or canvas access", () => {
    const f = paintFixture();
    f.options.frameContext = createView();
    expect(f.paint).toThrow("supplied viewport layout");
    expectNoPaintSideEffects(f);
  });

  test.each([false, true])(
    "a late unsupported reflection refuses the whole collection, hidden %s",
    (hidden) => {
      const f = paintFixture();
      f.picture.hidden = hidden;
      f.picture.transform = { appearance: { reflection: true } };
      f.options.state = { images: [legacy(), f.picture], revision: 1 };
      expect(f.paint).toThrow("reflection");
      expectNoPaintSideEffects(f);
    },
  );

  test.each([
    { ...noEffects, shadow: "soft" as const },
    { ...noEffects, reflection: true },
    { ...noEffects, bevel: true },
    { ...noEffects, outlineWidth: 2 },
  ])("refuses inherited visible drawing effects atomically: %j", (effects) => {
    for (const source of ["state", "options"] as const) {
      const f = paintFixture();
      f.options.state = {
        images: [legacy(), f.picture],
        revision: 1,
        ...(source === "state" ? { effects } : {}),
      };
      if (source === "options") f.options.effects = effects;
      expect(f.paint).toThrow("Inherited drawing theme effects");
      expectNoPaintSideEffects(f);
    }
  });

  test("a fill-only gradient does not alter photo pixels or falsely block a frame", () => {
    const f = paintFixture();
    f.options.state = { ...f.options.state, effects: { ...noEffects, gradient: true } };
    f.paint();
    expect(f.context.drawImage).toHaveBeenCalledTimes(4);
  });

  test.each(["cache", "decoded", "placeholder"] as const)(
    "balances canvas saves and retains the complete set after %s failure",
    (failure) => {
      const f = paintFixture();
      f.options.state = { images: [f.picture, legacy("later")], revision: 1 };
      f.options.assetUrls = new Map([
        ["framed", "blob:framed"],
        ["later", "blob:later"],
      ]);
      const reject = () => {
        throw new Error("source lost");
      };
      if (failure === "cache") f.cache.get.mockImplementation(reject);
      else if (failure === "decoded") f.context.drawImage.mockImplementation(reject);
      else {
        f.cache.get.mockReturnValue(undefined);
        f.context.fillText.mockImplementation(reject);
      }
      expect(f.paint).toThrow("source lost");
      expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
      expect(f.cache.retain).toHaveBeenCalledExactlyOnceWith(
        new Set(["blob:framed", "blob:later"]),
      );
    },
  );
});
