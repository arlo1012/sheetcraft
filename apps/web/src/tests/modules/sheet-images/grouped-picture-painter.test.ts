import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame, type ResolvedPictureFrame } from "@sheetcraft/core/picture-frame";
import type { GroupedPicture, PictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import {
  projectPictureFrameIntoPane,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { DrawingThemeEffects } from "../../../modules/sheet-images/drawing-theme-effects";
import {
  paintFramedPictureContent,
  paintGroupedPictureContent,
} from "../../../modules/sheet-images/framed-picture-painter";
import { resetPictureAppearance } from "../../../modules/sheet-images/picture-appearance-edit";
import { assertPicturePaintSupport } from "../../../modules/sheet-images/picture-paint-effects";

function canvas() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    ellipse: vi.fn(),
    globalAlpha: 1,
  };
}

function fixture() {
  const framed: FramedFloatingImage = {
    id: "standalone",
    assetId: "source-asset",
    altText: "Synthetic standalone",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } },
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0.5, offsetYRatio: 0.25 },
      angleDeg: 37,
    },
  };
  const picture: GroupedPicture = {
    kind: "grouped-picture-v1",
    id: "owned-leaf",
    assetId: "source-asset",
    altText: "Synthetic genuine owned leaf",
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      source: { ...framed.frame.source },
      angleDeg: 37,
    },
  };
  const group: PictureGroup = {
    kind: "picture-group-v1",
    id: "owner",
    altText: "Synthetic source-free owner",
    frame: { kind: "group-frame-v1", anchor: framed.frame.anchor, angleDeg: 0 },
    members: [picture],
  };
  const metrics = createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
  const source = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const context = canvas();
  const geometry = (): ResolvedPictureFrame => {
    const leaf = resolvePictureGroup(group, metrics).members[0]!;
    if ("members" in leaf || !leaf.layout) throw new Error("Expected a resolved owned leaf.");
    return leaf.layout;
  };
  const draw = (resolved = geometry(), effects?: DrawingThemeEffects) =>
    paintGroupedPictureContent(
      context as unknown as CanvasRenderingContext2D,
      source,
      picture,
      resolved,
      effects,
    );
  return { framed, picture, group, metrics, source, context, geometry, draw };
}

function calls(context: ReturnType<typeof canvas>) {
  return Object.fromEntries(
    Object.entries(context).map(([name, value]) => [
      name,
      vi.isMockFunction(value) ? value.mock.calls : value,
    ]),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("genuine grouped leaf content kernel", () => {
  test("each owned leaf resolves its suppression without changing source-free owners or siblings", () => {
    const f = fixture();
    f.picture.transform = { appearance: resetPictureAppearance() };
    const sibling = { ...f.picture, id: "inherited-sibling", transform: undefined };
    f.group.members.push(sibling);
    const before = structuredClone(f.group);
    const effects = { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true, bevel: true };
    expect(() => assertPicturePaintSupport([f.group], effects, f.metrics)).not.toThrow();
    f.draw(undefined, effects);
    expect(f.context.drawImage).toHaveBeenCalledOnce();
    expect(f.context.strokeRect).not.toHaveBeenCalled();
    expect(f.context.stroke).not.toHaveBeenCalled();
    const inheritedContext = canvas();
    paintGroupedPictureContent(
      inheritedContext as unknown as CanvasRenderingContext2D,
      f.source,
      sibling,
      f.geometry(),
      effects,
    );
    expect(inheritedContext.drawImage).toHaveBeenCalledTimes(2);
    expect(inheritedContext.strokeRect).toHaveBeenCalledOnce();
    expect(inheritedContext.stroke).toHaveBeenCalledTimes(2);
    expect(f.group).toEqual(before);
  });
  test("owned preflight validates the original theme even when every effect is suppressed", () => {
    const f = fixture();
    f.picture.transform = { appearance: resetPictureAppearance() };
    const getter = vi.fn(() => false);
    const effects = { ...DEFAULT_WORKBOOK_THEME.effects };
    Object.defineProperty(effects, "reflection", { get: getter, enumerable: true });
    expect(() => assertPicturePaintSupport([f.group], effects, f.metrics)).toThrow("data fields");
    expect(getter).not.toHaveBeenCalled();
  });
  test.each([false, true].flatMap((flipX) => [false, true].map((flipY) => ({ flipX, flipY }))))(
    "matches standalone crop, arbitrary rotation, annotations and appearance for flips $flipX/$flipY",
    ({ flipX, flipY }) => {
      const f = fixture();
      f.picture.frame.flipHorizontal = f.framed.frame.flipHorizontal = flipX;
      f.picture.frame.flipVertical = f.framed.frame.flipVertical = flipY;
      f.picture.transform = f.framed.transform = {
        appearance: {
          opacity: 0.4,
          brightness: 0.5,
          grayscale: 1,
          shadow: "soft",
          border: { color: "#123456", width: 4 },
        },
        annotations: [
          {
            kind: "text",
            points: [{ x: 0.5, y: 0.5 }],
            color: "#FF0000",
            width: 0.01,
            text: "Mark",
            fontSize: 0.05,
          },
        ],
      };
      f.draw();
      const standaloneContext = canvas();
      paintFramedPictureContent(
        standaloneContext as unknown as CanvasRenderingContext2D,
        f.source,
        f.framed,
        resolvePictureFrame(f.framed.frame, f.metrics),
      );
      expect(calls(f.context)).toEqual(calls(standaloneContext));
      expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
        f.source,
        flipX ? 200 : 0,
        flipY ? 75 : 25,
        200,
        100,
        0,
        0,
        200,
        100,
      );
      expect(f.context.fillText).toHaveBeenCalledWith("Mark", 200, 100);
      expect(f.context.strokeRect).toHaveBeenCalledWith(2, 2, 196, 96);
      expect(f.picture).not.toHaveProperty("anchor");
      expect(f.picture.frame).not.toHaveProperty("anchor");
    },
  );

  test("default theme outline/bevel and own-shadow precedence use the genuine leaf's composed crop frame", () => {
    const f = fixture();
    f.group.frame.angleDeg = 23;
    f.framed.frame.angleDeg = 60;
    f.picture.frame.flipHorizontal = f.framed.frame.flipHorizontal = true;
    f.picture.transform = f.framed.transform = {
      appearance: { shadow: "hard", border: { color: "#123456", width: 4 } },
    };
    const before = structuredClone(f.group);
    const effects = { ...DEFAULT_WORKBOOK_THEME.effects, bevel: true };
    f.draw(f.geometry(), effects);
    const standaloneContext = canvas();
    paintFramedPictureContent(
      standaloneContext as unknown as CanvasRenderingContext2D,
      f.source,
      f.framed,
      resolvePictureFrame(f.framed.frame, f.metrics),
      effects,
    );
    expect(calls(f.context)).toEqual(calls(standaloneContext));
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.source,
      200,
      25,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(f.context.rotate).toHaveBeenCalledExactlyOnceWith((60 * Math.PI) / 180);
    expect(f.context.strokeRect.mock.calls).toEqual([
      [2, 2, 196, 96],
      [0.5, 0.5, 199, 99],
    ]);
    expect(f.context).toMatchObject({ shadowBlur: 1, shadowOffsetX: 3, shadowOffsetY: 3 });
    expect(f.group).toEqual(before);
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });

  test("theme reflection retains asymmetric transparent padding, actual source and local frame size", () => {
    const f = fixture();
    f.picture.frame.source = {
      widthRatio: 0.5,
      heightRatio: 0.5,
      offsetXRatio: 0.25,
      offsetYRatio: 0.25,
    };
    const geometry = f.geometry(),
      before = structuredClone(f.group);
    const create = vi.spyOn(document, "createElement");
    f.draw(geometry, { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true });
    expect(f.context.drawImage.mock.calls).toEqual(
      Array(2).fill([f.source, 0, 0, 400, 200, 0, 0, 100, 50]),
    );
    expect(f.context.translate.mock.calls).toContainEqual([0, 200]);
    expect(
      f.context.translate.mock.calls.filter((call) => call[0] === 100 && call[1] === 50),
    ).toHaveLength(2);
    expect(f.context.scale).toHaveBeenCalledWith(1, -1);
    expect(f.context.strokeRect).toHaveBeenCalledExactlyOnceWith(0.5, 0.5, 199, 99);
    expect(f.context.clip).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(f.group).toEqual(before);
    expect(f.geometry()).toEqual(geometry);
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });

  test("default effects retain the same source crop and rotated local outline through every frozen pane", () => {
    const f = fixture();
    const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
    const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 13, y: 7 },
      viewportSize: { width: 500, height: 500 },
    });
    const resolved = f.geometry();
    for (const paneId of ["topLeft", "top", "left", "body"] as const)
      f.draw(projectPictureFrameIntoPane(resolved, paneId, layout), DEFAULT_WORKBOOK_THEME.effects);
    expect(f.context.drawImage.mock.calls).toEqual(
      Array(4).fill([f.source, 0, 25, 200, 100, 0, 0, 200, 100]),
    );
    expect(f.context.strokeRect.mock.calls).toEqual(Array(4).fill([0.5, 0.5, 199, 99]));
    expect(f.context.rotate.mock.calls).toEqual(Array(4).fill([(37 * Math.PI) / 180]));
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });

  test("keeps padding transparent and permits clipped source shadow beyond the crop frame", () => {
    const f = fixture();
    f.picture.frame.source = {
      widthRatio: 0.5,
      heightRatio: 0.5,
      offsetXRatio: 0.25,
      offsetYRatio: 0.25,
    };
    f.picture.transform = { appearance: { shadow: "hard" } };
    f.draw();
    expect(f.context.translate).toHaveBeenCalledWith(100, 50);
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.source,
      0,
      0,
      400,
      200,
      0,
      0,
      100,
      50,
    );
    expect(f.context.clip).not.toHaveBeenCalled();
    expect(f.context).toMatchObject({ shadowBlur: 1, shadowOffsetX: 3, shadowOffsetY: 3 });
  });

  test("a source outside the leaf crop paints no source or frame-sized intermediate bitmap", () => {
    const f = fixture();
    f.picture.frame.source.offsetXRatio = 10;
    const create = vi.spyOn(document, "createElement");
    f.draw();
    expect(f.context.drawImage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(f.context.save).toHaveBeenCalledOnce();
    expect(f.context.restore).toHaveBeenCalledOnce();
  });

  test("paints each already-projected source with the same offset and flip through all frozen panes", () => {
    const f = fixture();
    f.picture.frame.flipHorizontal = true;
    f.picture.frame.flipVertical = true;
    const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
    const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
    const context: PictureFrameLayoutContext = {
      metrics: f.metrics,
      layout: createSheetViewportLayout({
        geometry,
        rows,
        freeze: { rows: 1, columns: 1 },
        bodyScrollPosition: { x: 13, y: 7 },
        viewportSize: { width: 500, height: 500 },
      }),
    };
    const resolved = f.geometry();
    for (const paneId of ["topLeft", "top", "left", "body"] as const)
      f.draw(projectPictureFrameIntoPane(resolved, paneId, context.layout));
    expect(f.context.drawImage.mock.calls).toEqual(
      Array(4).fill([f.source, 200, 75, 200, 100, 0, 0, 200, 100]),
    );
    expect(f.context.translate.mock.calls.filter((_call, index) => index % 3 === 0)).toEqual([
      [120, 80],
      [107, 80],
      [120, 73],
      [107, 73],
    ]);
    expect(f.context.rotate.mock.calls).toEqual(Array(4).fill([(37 * Math.PI) / 180]));
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });

  test("uses the composed owned world angle, rather than only the leaf's relative angle", () => {
    const f = fixture();
    f.group.frame.angleDeg = 23;
    f.draw();
    expect(f.context.rotate).toHaveBeenCalledWith((60 * Math.PI) / 180);
  });

  test("hidden and collapsed owned leaves do not touch decoded source or canvas", () => {
    const f = fixture();
    const get = vi.fn(() => {
      throw new Error("Unexpected source access");
    });
    Object.defineProperty(f.source, "naturalWidth", { get });
    f.picture.hidden = true;
    f.draw();
    f.picture.hidden = false;
    f.draw({ ...f.geometry(), collapsed: true, sourceRect: null });
    expect(get).not.toHaveBeenCalled();
    expect(f.context.save).not.toHaveBeenCalled();
  });

  test("reflection stays an explicit unsupported effect before preparation or canvas", () => {
    const f = fixture();
    f.picture.transform = { appearance: { reflection: true, transparentColor: "#FFFFFF" } };
    const create = vi.spyOn(document, "createElement");
    expect(() => f.draw()).toThrow("reflection");
    expect(create).not.toHaveBeenCalled();
    expect(f.context.save).not.toHaveBeenCalled();
  });

  test.each(["source", "corner", "bounds", "angle", "source-size", "source-offset"] as const)(
    "rejects invalid prepared %s before transparent-source preparation or canvas",
    (invalid) => {
      const f = fixture();
      const geometry = f.geometry();
      f.picture.transform = { appearance: { transparentColor: "#FFFFFF" } };
      if (invalid === "source") geometry.sourceRect!.x = Number.NaN;
      else if (invalid === "corner") geometry.corners[0].x = Number.POSITIVE_INFINITY;
      else if (invalid === "bounds") geometry.bounds.width += 1;
      else if (invalid === "angle") geometry.angleDeg = Number.MAX_VALUE;
      else if (invalid === "source-size") geometry.sourceRect!.width += 1;
      else geometry.sourceRect!.x += 1;
      const create = vi.spyOn(document, "createElement");
      expect(() => f.draw(geometry)).toThrow();
      expect(create).not.toHaveBeenCalled();
      expect(f.context.save).not.toHaveBeenCalled();
    },
  );

  test.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unavailable decoded dimensions %s before transparent-source allocation",
    (width) => {
      const f = fixture();
      f.picture.transform = { appearance: { transparentColor: "#FFFFFF" } };
      Object.assign(f.source, { naturalWidth: width });
      const create = vi.spyOn(document, "createElement");
      expect(() => f.draw()).toThrow("positive and finite");
      expect(create).not.toHaveBeenCalled();
      expect(f.context.save).not.toHaveBeenCalled();
    },
  );

  test("strict owned normalization rejects invalid hidden source and geometry-less containers", () => {
    const f = fixture();
    const geometry = f.geometry();
    f.picture.hidden = true;
    f.picture.frame.source.widthRatio = 0;
    expect(() => f.draw(geometry)).toThrow();
    expect(() =>
      paintGroupedPictureContent(
        f.context as unknown as CanvasRenderingContext2D,
        f.source,
        f.group as unknown as GroupedPicture,
        geometry,
      ),
    ).toThrow("source-bearing owned picture");
    expect(() =>
      paintGroupedPictureContent(
        f.context as unknown as CanvasRenderingContext2D,
        f.source,
        f.framed as unknown as GroupedPicture,
        geometry,
      ),
    ).toThrow("source-bearing owned picture");
    expect(f.context.save).not.toHaveBeenCalled();
  });

  test("a genuine grouped leaf cannot enter the standalone public wrapper", () => {
    const f = fixture();
    expect(() =>
      paintFramedPictureContent(
        f.context as unknown as CanvasRenderingContext2D,
        f.source,
        f.picture as unknown as FramedFloatingImage,
        f.geometry(),
      ),
    ).toThrow();
    expect(f.context.save).not.toHaveBeenCalled();
  });

  test("strict owned transform normalization does not execute appearance accessors", () => {
    const f = fixture();
    const geometry = f.geometry();
    const get = vi.fn(() => "#FFFFFF");
    f.picture.transform = { appearance: {} };
    Object.defineProperty(f.picture.transform.appearance!, "transparentColor", { get });
    expect(() => f.draw(geometry)).toThrow("data fields");
    expect(get).not.toHaveBeenCalled();
    expect(f.context.save).not.toHaveBeenCalled();
  });

  test("restores both canvas levels after a source draw failure", () => {
    const f = fixture();
    f.context.drawImage.mockImplementation(() => {
      throw new Error("Source lost");
    });
    expect(() => f.draw()).toThrow("Source lost");
    expect(f.context.save).toHaveBeenCalledTimes(2);
    expect(f.context.restore).toHaveBeenCalledTimes(2);
  });
});
