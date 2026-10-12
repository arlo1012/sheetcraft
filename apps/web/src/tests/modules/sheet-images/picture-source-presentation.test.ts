import { afterEach, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  capturePictureSourcePresentation,
  createPictureSourcePresentationCanvas,
} from "../../../modules/sheet-images/picture-source-presentation";
import * as painters from "../../../modules/sheet-images/framed-picture-painter";
import * as bounds from "../../../shared/images/picture-detailed-bounds";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

const metrics = createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
function source() {
  return { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
}
function framed() {
  const picture = framedPicture();
  picture.frame.angleDeg = 37;
  picture.frame.flipHorizontal = true;
  picture.frame.source = { widthRatio: 0.5, heightRatio: 2, offsetXRatio: 0.8, offsetYRatio: -0.2 };
  picture.transform = { appearance: { opacity: 0.7 } };
  return capturePictureSourcePresentation(picture, resolvePictureFrame(picture.frame, metrics));
}
function surface() {
  const canvas = document.createElement("canvas");
  const context = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) =>
    tag === "canvas" ? canvas : original(tag, options),
  );
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  return { canvas, context };
}
afterEach(() => vi.restoreAllMocks());

test("captures detached real source geometry, including blank padding, crop offset and rotation", () => {
  const original = framedPicture();
  const before = structuredClone(original);
  const presentation = capturePictureSourcePresentation(
    original,
    resolvePictureFrame(original.frame, metrics),
  );
  presentation.picture.frame.angleDeg = 60;
  presentation.geometry.rect.width = 100;
  expect(original).toEqual(before);
  expect(presentation.geometry.sourceRect).not.toBeNull();
});
test("preview delegates the genuine framed snapshot and its full geometry to the worksheet painter", () => {
  const presentation = framed(),
    { canvas, context } = surface();
  const paint = vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {});
  const image = source();
  const result = createPictureSourcePresentationCanvas(image, presentation);
  expect(result).toBe(canvas);
  expect(canvas.width).toBeGreaterThan(0);
  expect(paint).toHaveBeenCalledOnce();
  const args = paint.mock.calls[0]!;
  expect(args[0]).toBe(context);
  expect(args[1]).toBe(image);
  expect(args[2]).toEqual(presentation.picture);
  expect(args[3]).toEqual(presentation.geometry);
  expect(args[2]).not.toHaveProperty("anchor");
  expect(context.setTransform).toHaveBeenCalledOnce();
});
test("an owned leaf retains its world angle and source; it is not converted to a container asset", () => {
  const group = pictureGroup(),
    leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected genuine leaf.");
  const geometry = resolvePictureSourceLayout(
    { x: 100, y: 200, width: 180, height: 90 },
    52,
    leaf.frame.source,
  );
  const presentation = capturePictureSourcePresentation(leaf, geometry),
    { context } = surface();
  const paint = vi.spyOn(painters, "paintGroupedPictureContent").mockImplementation(() => {});
  createPictureSourcePresentationCanvas(source(), presentation);
  expect(paint).toHaveBeenCalledWith(
    context,
    expect.anything(),
    leaf,
    geometry,
    undefined,
    undefined,
  );
  expect(group).not.toHaveProperty("assetId");
});
test("fallback reflection and shadows enlarge paint bounds without changing the real frame", () => {
  const presentation = framed(),
    before = structuredClone(presentation),
    { canvas } = surface();
  vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {});
  createPictureSourcePresentationCanvas(source(), presentation);
  const small = { width: canvas.width, height: canvas.height };
  createPictureSourcePresentationCanvas(source(), presentation, {
    ...DEFAULT_WORKBOOK_THEME,
    effects: { ...DEFAULT_WORKBOOK_THEME.effects, shadow: "soft", reflection: true },
  });
  expect(canvas.height).toBeGreaterThan(small.height);
  expect(canvas.width).toBeGreaterThan(small.width);
  expect(presentation).toEqual(before);
});
test("typed projected effect bounds are used rather than clipping to the ordinary layout rectangle", () => {
  const presentation = framed(),
    { canvas, context } = surface();
  presentation.picture.transform = { appearance: { detailedStyle: { fill: { kind: "none" } } } };
  const plan = vi
    .spyOn(bounds, "getPictureDetailedWorldBounds")
    .mockReturnValue({ x: -20, y: -30, width: 500, height: 300 });
  vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {});
  createPictureSourcePresentationCanvas(source(), presentation);
  expect(plan).toHaveBeenCalled();
  expect([canvas.width, canvas.height]).toEqual([500, 300]);
  expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 20, 30);
});
test("large legal frames stay inside a four-megapixel, 4096-side consumer canvas budget", () => {
  const picture = framedPicture(),
    { canvas } = surface();
  picture.frame.anchor = { mode: "fixed", x: 0, y: 0, size: { width: 10000, height: 10000 } };
  const presentation = capturePictureSourcePresentation(
    picture,
    resolvePictureFrame(picture.frame, metrics),
  );
  vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {});
  createPictureSourcePresentationCanvas(source(), presentation);
  expect(canvas.width).toBeLessThanOrEqual(4096);
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4 * 1024 * 1024);
});
test("over-budget decoded input and collapsed frames fail before requesting an output canvas", () => {
  const presentation = framed(),
    create = vi.spyOn(document, "createElement");
  expect(() =>
    createPictureSourcePresentationCanvas(
      { naturalWidth: 32768, naturalHeight: 32768 } as HTMLImageElement,
      presentation,
    ),
  ).toThrow();
  expect(() =>
    capturePictureSourcePresentation(presentation.picture, {
      ...presentation.geometry,
      collapsed: true,
    }),
  ).toThrow();
  expect(create).not.toHaveBeenCalled();
});
test("painter failures release the consumer-owned canvas and propagate the actual failure", () => {
  const presentation = framed(),
    { canvas } = surface();
  vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {
    throw new Error("Unavailable texture");
  });
  expect(() => createPictureSourcePresentationCanvas(source(), presentation)).toThrow(
    "Unavailable texture",
  );
  expect([canvas.width, canvas.height]).toEqual([0, 0]);
});
test("a source-resolution consumer can increase sampling density within the same bounded painter", () => {
  const presentation = framed(),
    { canvas } = surface();
  vi.spyOn(painters, "paintFramedPictureContent").mockImplementation(() => {});
  createPictureSourcePresentationCanvas(source(), presentation);
  const original = canvas.width;
  createPictureSourcePresentationCanvas(source(), presentation, undefined, undefined, 4096, 4);
  expect(canvas.width).toBeGreaterThan(original * 3);
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(() =>
    createPictureSourcePresentationCanvas(
      source(),
      presentation,
      undefined,
      undefined,
      4096,
      Infinity,
    ),
  ).toThrow("density");
});
test.each(["framed", "owned"])(
  "explicit %s source rendering reveals its hidden copy without changing visibility",
  (kind) => {
    const leaf = kind === "framed" ? framedPicture() : pictureGroup().members[0]!;
    if (!("assetId" in leaf)) throw new Error("Expected source.");
    leaf.hidden = true;
    const geometry = resolvePictureSourceLayout(
      { x: 0, y: 0, width: 120, height: 80 },
      37,
      leaf.frame.source,
    );
    const input = capturePictureSourcePresentation(leaf, geometry),
      before = structuredClone(input);
    surface();
    const paint =
      kind === "framed"
        ? vi.spyOn(painters, "paintFramedPictureContent")
        : vi.spyOn(painters, "paintGroupedPictureContent");
    paint.mockImplementation(() => {});
    createPictureSourcePresentationCanvas(source(), input);
    expect(paint).toHaveBeenCalledOnce();
    expect(paint.mock.calls[0]![2].hidden).toBe(false);
    expect(input).toEqual(before);
    expect(leaf.hidden).toBe(true);
  },
);
