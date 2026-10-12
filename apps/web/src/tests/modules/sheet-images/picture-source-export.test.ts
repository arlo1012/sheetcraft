import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { readEncodedImageSource } from "../../../modules/image-assets/readEncodedImageSource";
import { createPictureSourcePresentationCanvas } from "../../../modules/sheet-images/picture-source-presentation";
import { exportPictureSourceBlob } from "../../../modules/sheet-images/picture-source-export";
import { framedPicture } from "./framed-picture-fixture";
import { deferred } from "./useSheetImageActions/replacement-fixture";

vi.mock("../../../modules/image-assets/readEncodedImageSource", () => ({
  readEncodedImageSource: vi.fn(),
}));
vi.mock("../../../modules/sheet-images/picture-source-presentation", async (original) => ({
  ...(await original<object>()),
  createPictureSourcePresentationCanvas: vi.fn(),
}));
const blob = new Blob(["source"], { type: "image/png" });
let images: FakeImage[] = [];
class FakeImage {
  naturalWidth = 400;
  naturalHeight = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  source = "";
  constructor() {
    images.push(this);
  }
  set src(value: string) {
    this.source = value;
    if (value) queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this.source;
  }
}
function presentation() {
  const picture = framedPicture();
  picture.frame.source.offsetXRatio = 0.3;
  return {
    picture,
    geometry: resolvePictureFrame(picture.frame, createPictureSheetMetrics(createSheet("S", "s"))),
  };
}
function surface(format = "png") {
  const canvas = document.createElement("canvas"),
    context = { fillRect: vi.fn() };
  canvas.width = 400;
  canvas.height = 200;
  vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const encode = vi
    .spyOn(canvas, "toBlob")
    .mockImplementation((callback) => callback(new Blob(["encoded"], { type: `image/${format}` })));
  vi.mocked(createPictureSourcePresentationCanvas).mockReturnValue(canvas);
  return { canvas, context, encode };
}
beforeEach(() => {
  images = [];
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:source-${images.length}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(createPictureSourcePresentationCanvas).mockReset();
  vi.mocked(readEncodedImageSource)
    .mockReset()
    .mockImplementation(async (input) => ({
      blob: input,
      bytes: new Uint8Array([1]),
      header: { width: 400, height: 200, mimeType: "image/png" },
    }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test.each(["png", "jpeg", "webp"] as const)(
  "encodes %s from the real worksheet presentation and releases temporary resources",
  async (format) => {
    const input = presentation(),
      before = structuredClone(input),
      { canvas, context, encode } = surface(format);
    const result = await exportPictureSourceBlob(
      blob,
      input,
      format,
      undefined,
      vi.fn(),
      () => true,
    );
    expect(result?.type).toBe(`image/${format}`);
    expect(encode).toHaveBeenCalledWith(expect.any(Function), `image/${format}`, 0.9);
    expect(createPictureSourcePresentationCanvas).toHaveBeenCalledWith(
      images[0],
      input,
      undefined,
      expect.any(Object),
      4096,
      expect.any(Number),
    );
    expect(context.fillRect).toHaveBeenCalledTimes(format === "jpeg" ? 1 : 0);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(images[0]?.src).toBe("");
    expect(input).toEqual(before);
  },
);
test("loads actual typed fill assets before painting and supplies their verified dimensions", async () => {
  const input = presentation();
  input.picture.transform = {
    appearance: {
      detailedStyle: {
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId: "texture",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          },
        },
      },
    },
  };
  surface();
  const read = vi.fn().mockResolvedValue(blob);
  await exportPictureSourceBlob(blob, input, "png", undefined, read, () => true);
  expect(read).toHaveBeenCalledExactlyOnceWith("texture");
  const resources = vi.mocked(createPictureSourcePresentationCanvas).mock.calls[0]![3]!;
  expect(resources.getAssetSize?.("texture")).toEqual({
    width: 400,
    height: 200,
  });
  expect(resources.getAssetImage?.("texture")).toBe(images[1]);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
test("bad encoded headers refuse before creating a decoder or canvas", async () => {
  vi.mocked(readEncodedImageSource).mockRejectedValue(new Error("Invalid header"));
  await expect(
    exportPictureSourceBlob(blob, presentation(), "png", undefined, vi.fn(), () => true),
  ).rejects.toThrow("Invalid header");
  expect(images).toHaveLength(0);
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test("missing auxiliary source fails instead of silently saving an unfilled picture", async () => {
  const input = presentation();
  input.picture.transform = {
    appearance: {
      detailedStyle: {
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId: "missing",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          },
        },
      },
    },
  };
  await expect(
    exportPictureSourceBlob(blob, input, "png", undefined, vi.fn(), () => true),
  ).rejects.toThrow("fill source");
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
test("aggregate decoded sources obey the shared pixel budget before allocating an auxiliary decoder", async () => {
  const input = presentation();
  input.picture.transform = {
    appearance: {
      detailedStyle: {
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId: "texture",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          },
        },
      },
    },
  };
  vi.mocked(readEncodedImageSource).mockResolvedValue({
    blob,
    bytes: new Uint8Array([1]),
    header: { width: 8192, height: 4096, mimeType: "image/png" },
  });
  await expect(
    exportPictureSourceBlob(
      blob,
      input,
      "png",
      undefined,
      vi.fn().mockResolvedValue(blob),
      () => true,
    ),
  ).rejects.toThrow("pixel-limit");
  expect(images).toHaveLength(1);
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
test("unsupported platform encoding fails, clears the output canvas and never returns another format", async () => {
  const { canvas } = surface("png");
  await expect(
    exportPictureSourceBlob(blob, presentation(), "webp", undefined, vi.fn(), () => true),
  ).rejects.toThrow("requested picture format");
  expect([canvas.width, canvas.height]).toEqual([0, 0]);
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
test("an encoding result arriving after revocation is discarded; canvas is held until callback settles", async () => {
  const { canvas, encode } = surface(),
    waiting = deferred<Blob>();
  encode.mockImplementation((callback) => {
    void waiting.promise.then(callback);
  });
  let current = true;
  const running = exportPictureSourceBlob(
    blob,
    presentation(),
    "png",
    undefined,
    vi.fn(),
    () => current,
  );
  await vi.waitFor(() => expect(encode).toHaveBeenCalled());
  current = false;
  expect(canvas.width).toBe(400);
  waiting.resolve(new Blob(["encoded"], { type: "image/png" }));
  expect(await running).toBeUndefined();
  expect([canvas.width, canvas.height]).toEqual([0, 0]);
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
test("Arc native source sampling uses the filled mapping, retaining all source pixels", async () => {
  const input = presentation();
  input.picture.frame.cropShape = { preset: "arc" };
  surface();
  await exportPictureSourceBlob(blob, input, "png", undefined, vi.fn(), () => true);
  const density = vi.mocked(createPictureSourcePresentationCanvas).mock.calls[0]![5]!;
  expect(density).toBeCloseTo(
    Math.max(
      400 / (input.geometry.sourceRect!.width / 2),
      200 / (input.geometry.sourceRect!.height / 2),
    ),
  );
});
test("invalid actual shape bounds fail before decoder, source URL, auxiliary read or canvas", async () => {
  const input = presentation();
  input.picture.frame.cropShape = {
    preset: "wedgeRectCallout",
    adjustments: { adj1: 2147483647, adj2: 0 },
  };
  input.geometry = resolvePictureFrame(
    {
      ...input.picture.frame,
      anchor: { mode: "fixed", x: 0, y: 0, size: { width: 1000, height: 1000 } },
    },
    createPictureSheetMetrics(createSheet("S", "s")),
  );
  const read = vi.fn();
  await expect(
    exportPictureSourceBlob(blob, input, "png", undefined, read, () => true),
  ).rejects.toThrow();
  expect(readEncodedImageSource).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
});
