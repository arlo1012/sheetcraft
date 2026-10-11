import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { paintFramedPictureContent } from "../../../modules/sheet-images/framed-picture-painter";
import * as imageAppearance from "../../../shared/images/imageAppearance";
import type { DrawingThemeEffects } from "../../../modules/sheet-images/drawing-theme-effects";
import { resetPictureAppearance } from "../../../modules/sheet-images/picture-appearance-edit";

function fixture() {
  const picture: FramedFloatingImage = {
    id: "synthetic",
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } },
      source: { widthRatio: 2, heightRatio: 2, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
  };
  const source = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const context = {
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
    globalAlpha: 1,
  };
  const metrics = createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
  const draw = (effects?: DrawingThemeEffects) =>
    paintFramedPictureContent(
      context as unknown as CanvasRenderingContext2D,
      source,
      picture,
      resolvePictureFrame(picture.frame, metrics),
      effects,
    );
  return { picture, source, context, metrics, draw };
}

afterEach(() => vi.restoreAllMocks());

describe("prepared framed picture content painter", () => {
  test("explicit reset suppresses all inherited effects while keeping source geometry intact", () => {
    const f = fixture();
    f.picture.transform = { appearance: resetPictureAppearance() };
    const before = structuredClone(f.picture);
    f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, reflection: true, bevel: true });
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.source,
      100,
      50,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(f.context.strokeRect).not.toHaveBeenCalled();
    expect(f.context.stroke).not.toHaveBeenCalled();
    expect(f.context).not.toHaveProperty("shadowBlur");
    expect(f.context.rotate).toHaveBeenCalledExactlyOnceWith((37 * Math.PI) / 180);
    expect(f.picture).toEqual(before);
  });
  test("suppression flags affect inheritance only and preserve explicit local border and shadow", () => {
    const f = fixture();
    f.picture.transform = {
      appearance: {
        ...resetPictureAppearance(),
        border: { color: "#123456", width: 4 },
        shadow: "hard",
      },
    };
    f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, reflection: true, bevel: true });
    expect(f.context.drawImage).toHaveBeenCalledOnce();
    expect(f.context.strokeRect).toHaveBeenCalledExactlyOnceWith(2, 2, 196, 96);
    expect(f.context.stroke).not.toHaveBeenCalled();
    expect(f.context).toHaveProperty("shadowBlur", 1);
  });
  test("suppressed flags cannot hide invalid inherited theme fields or unsupported own reflection", () => {
    const f = fixture();
    f.picture.transform = { appearance: resetPictureAppearance() };
    expect(() => f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, outlineWidth: NaN })).toThrow();
    expect(f.context.save).not.toHaveBeenCalled();
    f.picture.transform.appearance!.reflection = true;
    expect(() => f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, reflection: true })).toThrow(
      "reflection",
    );
    expect(f.context.save).not.toHaveBeenCalled();
  });
  test("draws a local crop once through the arbitrary-angle frame matrix", () => {
    const { draw, context, source } = fixture();
    draw();
    expect(context.translate.mock.calls.slice(0, 2)).toEqual([
      [120, 80],
      [-100, -50],
    ]);
    expect(context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      source,
      100,
      50,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(context.save).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
  });
  test.each([false, true].flatMap((flipX) => [false, true].map((flipY) => ({ flipX, flipY }))))(
    "shares asymmetric source clipping and flips $flipX/$flipY with annotations",
    ({ flipX, flipY }) => {
      const { picture, draw, context, source } = fixture();
      picture.frame.source.offsetXRatio = 0.5;
      picture.frame.source.offsetYRatio = 0.25;
      picture.frame.flipHorizontal = flipX;
      picture.frame.flipVertical = flipY;
      picture.transform = {
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
      draw();
      expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
        source,
        flipX ? 200 : 0,
        flipY ? 75 : 25,
        200,
        100,
        0,
        0,
        200,
        100,
      );
      expect(context.scale).toHaveBeenCalledWith(flipX ? -1 : 1, flipY ? -1 : 1);
      expect(context.clip).toHaveBeenCalledOnce();
      expect(context.rect).toHaveBeenCalledWith(0, 0, 200, 100);
      expect(context.fillText).toHaveBeenCalledWith("Mark", 200, 100);
    },
  );
  test("keeps source padding transparent instead of stretching it over the whole frame", () => {
    const { picture, draw, context, source } = fixture();
    picture.frame.source = {
      widthRatio: 0.5,
      heightRatio: 0.5,
      offsetXRatio: 0.25,
      offsetYRatio: 0.25,
    };
    draw();
    expect(context.translate).toHaveBeenCalledWith(100, 50);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      source,
      0,
      0,
      400,
      200,
      0,
      0,
      100,
      50,
    );
  });
  test("a source fully outside the crop leaves no painted source or allocated bitmap", () => {
    const { picture, draw, context } = fixture();
    picture.frame.source.offsetXRatio = 10;
    draw();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalledOnce();
  });
  test("applies supported appearance to content and an inset local frame border", () => {
    const { picture, draw, context } = fixture();
    picture.transform = {
      appearance: {
        opacity: 0.5,
        brightness: 0.5,
        grayscale: 1,
        shadow: "soft",
        border: { color: "#123456", width: 4 },
      },
    };
    draw();
    expect(context.globalAlpha).toBe(0.5);
    expect(context.strokeRect).toHaveBeenCalledWith(2, 2, 196, 96);
    expect(context).toMatchObject({ filter: "none", shadowColor: "transparent", shadowBlur: 8 });
  });
  test("the default Office theme keeps the actual crop and adds its local shadow and outline", () => {
    const f = fixture();
    const before = structuredClone(f.picture);
    const create = vi.spyOn(document, "createElement");
    const drawn: unknown[] = [];
    f.context.drawImage.mockImplementation(() => {
      drawn.push({ ...f.context });
    });
    f.draw(DEFAULT_WORKBOOK_THEME.effects);
    expect(drawn).toMatchObject([
      { shadowColor: "rgb(0 0 0 / 28%)", shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 3 },
    ]);
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.source,
      100,
      50,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(f.context.strokeRect).toHaveBeenCalledExactlyOnceWith(0.5, 0.5, 199, 99);
    expect(f.context.rotate).toHaveBeenCalledExactlyOnceWith((37 * Math.PI) / 180);
    expect(f.picture).toEqual(before);
    expect(create).not.toHaveBeenCalled();
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
    create.mockRestore();
  });

  test("an explicit effect-free theme preserves the existing content kernel", () => {
    const f = fixture();
    f.draw({ shadow: "none", reflection: false, bevel: false, outlineWidth: 0, gradient: false });
    expect(f.context.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.source,
      100,
      50,
      200,
      100,
      0,
      0,
      200,
      100,
    );
    expect(f.context.strokeRect).not.toHaveBeenCalled();
    expect(f.context.stroke).not.toHaveBeenCalled();
    expect(f.context.save).toHaveBeenCalledTimes(2);
    expect(f.context.restore).toHaveBeenCalledTimes(2);
  });

  test("own shadow overrides the theme and the rotated theme outline/bevel follow the own border", () => {
    const f = fixture();
    f.picture.transform = {
      appearance: {
        opacity: 0.4,
        brightness: 0.5,
        shadow: "hard",
        border: { color: "#123456", width: 4 },
      },
    };
    const state = f.context as unknown as Record<string, unknown>;
    const keys = [
      "globalAlpha",
      "filter",
      "shadowColor",
      "shadowBlur",
      "shadowOffsetX",
      "shadowOffsetY",
      "lineWidth",
      "strokeStyle",
    ];
    const stack: Record<string, unknown>[] = [];
    f.context.save.mockImplementation(() =>
      stack.push(Object.fromEntries(keys.map((key) => [key, state[key]]))),
    );
    f.context.restore.mockImplementation(() => Object.assign(state, stack.pop()));
    const draws: Record<string, unknown>[] = [],
      strokes: Record<string, unknown>[] = [];
    f.context.drawImage.mockImplementation(() => draws.push({ ...state }));
    f.context.strokeRect.mockImplementation(() => strokes.push({ ...state }));
    f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, bevel: true });
    expect(draws).toMatchObject([
      {
        globalAlpha: 0.4,
        filter: "brightness(0.5)",
        shadowColor: "rgb(0 0 0 / 35%)",
        shadowBlur: 1,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
      },
    ]);
    expect(strokes).toMatchObject([
      { globalAlpha: 0.4, filter: "none", lineWidth: 4, strokeStyle: "#123456" },
      { globalAlpha: 1, lineWidth: 1, strokeStyle: "rgb(54 78 110 / 72%)" },
    ]);
    expect(f.context.strokeRect.mock.calls).toEqual([
      [2, 2, 196, 96],
      [0.5, 0.5, 199, 99],
    ]);
    expect(f.context.moveTo.mock.calls).toEqual([
      [0.5, 99.5],
      [199.5, 0.5],
    ]);
    expect(f.context.lineTo.mock.calls).toEqual([
      [0.5, 0.5],
      [199.5, 0.5],
      [199.5, 99.5],
      [0.5, 99.5],
    ]);
    expect(f.context.drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      f.context.strokeRect.mock.invocationCallOrder[0]!,
    );
    expect(f.context.strokeRect.mock.invocationCallOrder[1]).toBeLessThan(
      f.context.stroke.mock.invocationCallOrder[0]!,
    );
    expect(f.context.rotate).toHaveBeenCalledExactlyOnceWith((37 * Math.PI) / 180);
    expect(stack).toHaveLength(0);
  });

  test("inherited reflection repeats the actual crop below the rotated frame without shrinking it", () => {
    const f = fixture();
    f.picture.transform = {
      appearance: { opacity: 0.5, border: { color: "#123456", width: 4 } },
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
    const before = structuredClone(f.picture);
    const state = f.context as unknown as Record<string, unknown>;
    const keys = [
      "globalAlpha",
      "filter",
      "shadowColor",
      "shadowBlur",
      "shadowOffsetX",
      "shadowOffsetY",
      "lineWidth",
      "strokeStyle",
    ];
    const stack: Record<string, unknown>[] = [];
    f.context.save.mockImplementation(() =>
      stack.push(Object.fromEntries(keys.map((key) => [key, state[key]]))),
    );
    f.context.restore.mockImplementation(() => Object.assign(state, stack.pop()));
    const opacity: unknown[] = [];
    f.context.drawImage.mockImplementation(() => opacity.push(state.globalAlpha));
    const create = vi.spyOn(document, "createElement");
    f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, reflection: true });
    expect(f.context.drawImage.mock.calls).toEqual(
      Array(2).fill([f.source, 100, 50, 200, 100, 0, 0, 200, 100]),
    );
    expect(opacity).toEqual([0.5, 0.11]);
    expect(f.context.translate).toHaveBeenCalledWith(0, 200);
    expect(f.context.scale).toHaveBeenCalledWith(1, -1);
    expect(f.context.rotate).toHaveBeenCalledExactlyOnceWith((37 * Math.PI) / 180);
    expect(f.context.fillText.mock.calls).toEqual(Array(2).fill(["Mark", 200, 100]));
    expect(f.context.strokeRect.mock.calls).toEqual([
      [2, 2, 196, 96],
      [2, 2, 196, 96],
      [0.5, 0.5, 199, 99],
    ]);
    expect(f.picture).toEqual(before);
    expect(create).not.toHaveBeenCalled();
    expect(stack).toHaveLength(0);
    create.mockRestore();
  });

  test("inherited effects reuse the transparent-color source and its annotation scale", () => {
    const f = fixture();
    f.picture.transform = {
      appearance: { transparentColor: "#FFFFFF", transparentTolerance: 4 },
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
    const before = structuredClone(f.picture);
    const prepared = document.createElement("canvas");
    prepared.width = 200;
    prepared.height = 100;
    const prepare = vi.spyOn(imageAppearance, "imageAppearanceSource").mockReturnValue(prepared);
    const create = vi.spyOn(document, "createElement");
    f.draw({ ...DEFAULT_WORKBOOK_THEME.effects, reflection: true });
    expect(prepare).toHaveBeenCalledExactlyOnceWith(f.source, f.picture.transform.appearance);
    expect(f.context.drawImage.mock.calls).toEqual(
      Array(2).fill([prepared, 50, 25, 100, 50, 0, 0, 200, 100]),
    );
    expect(f.context.fillText.mock.calls).toEqual(Array(2).fill(["Mark", 100, 50]));
    expect(f.picture).toEqual(before);
    expect(f.source).toMatchObject({ naturalWidth: 400, naturalHeight: 200 });
    expect(create).not.toHaveBeenCalled();
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });

  test("unsupported own reflection remains atomic even on a hidden frame with inherited effects", () => {
    const f = fixture();
    f.picture.hidden = true;
    f.picture.transform = { appearance: { reflection: true, transparentColor: "#FFFFFF" } };
    const create = vi.spyOn(document, "createElement");
    expect(() => f.draw(DEFAULT_WORKBOOK_THEME.effects)).toThrow("reflection");
    expect(create).not.toHaveBeenCalled();
    expect(f.context.save).not.toHaveBeenCalled();
    create.mockRestore();
  });

  test.each(["outline", "bevel", "reflection"] as const)(
    "balances inherited %s scopes when canvas painting fails",
    (effect) => {
      const f = fixture();
      const reject = () => {
        throw new Error("Canvas lost");
      };
      if (effect === "outline") f.context.strokeRect.mockImplementation(reject);
      else if (effect === "bevel") f.context.stroke.mockImplementation(reject);
      else f.context.drawImage.mockImplementationOnce(() => {}).mockImplementationOnce(reject);
      expect(() =>
        f.draw({
          ...DEFAULT_WORKBOOK_THEME.effects,
          reflection: effect === "reflection",
          bevel: effect === "bevel",
        }),
      ).toThrow("Canvas lost");
      expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
    },
  );

  test("unsupported reflection rejects before touching the canvas", () => {
    const { picture, draw, context } = fixture();
    picture.transform = { appearance: { reflection: true } };
    expect(draw).toThrow("reflection");
    expect(context.save).not.toHaveBeenCalled();
  });
  test("hidden and visibility-collapsed frames do not decode or draw", () => {
    const { picture, draw, context, metrics, source } = fixture();
    picture.hidden = true;
    draw();
    picture.hidden = false;
    const resolved = resolvePictureFrame(picture.frame, metrics);
    paintFramedPictureContent(context as unknown as CanvasRenderingContext2D, source, picture, {
      ...resolved,
      collapsed: true,
      sourceRect: null,
    });
    expect(context.save).not.toHaveBeenCalled();
  });
  test("restores both levels when drawImage rejects", () => {
    const { draw, context } = fixture();
    context.drawImage.mockImplementation(() => {
      throw new Error("decode lost");
    });
    expect(draw).toThrow("decode lost");
    expect(context.restore).toHaveBeenCalledTimes(2);
  });
  test("rejects unavailable decoded dimensions before touching the canvas", () => {
    const { draw, context, source } = fixture();
    Object.assign(source, { naturalWidth: 0 });
    expect(draw).toThrow("positive and finite");
    expect(context.save).not.toHaveBeenCalled();
  });
});
