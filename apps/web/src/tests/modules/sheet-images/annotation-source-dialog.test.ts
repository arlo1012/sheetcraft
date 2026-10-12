import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { ImageAnnotation } from "@sheetcraft/core/workbook";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import PictureAnnotationDialog from "../../../modules/sheet-images/components/PictureAnnotationDialog.vue";
import type { PictureAssetSource } from "../../../modules/sheet-images/picture-source-selection";
import {
  capturePictureSourcePresentation,
  createPictureSourcePresentationCanvas,
  type PictureSourcePresentation,
} from "../../../modules/sheet-images/picture-source-presentation";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import {
  PicturePaintUnavailableError,
  planPictureDetailedPaint,
} from "../../../shared/images/picture-detailed-render";
import { createAppI18n } from "../../../shared/i18n";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

vi.mock("../../../shared/images/imageAppearance", () => ({ paintImagePresentation: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-source-presentation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../modules/sheet-images/picture-source-presentation")
  >()),
  createPictureSourcePresentationCanvas: vi.fn(),
}));

const mounted: Array<{ unmount(): void }> = [];
const decoded: ImageStub[] = [];
const temporary: HTMLCanvasElement[] = [];
let sourceDimensions = { width: 400, height: 200 };
let autoLoad = true;
class ImageStub {
  naturalWidth = sourceDimensions.width;
  naturalHeight = sourceDimensions.height;
  complete = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url = "";
  constructor() {
    decoded.push(this);
  }
  set src(value: string) {
    this.url = value;
    if ((value === "blob:source" || value === "blob:renewed") && autoLoad)
      queueMicrotask(() => this.finish());
  }
  finish(width = this.naturalWidth, height = this.naturalHeight) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.complete = true;
    this.onload?.();
  }
  fail() {
    this.complete = true;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.onerror?.();
  }
}
const originalAnnotation: ImageAnnotation = {
  kind: "pen",
  color: "#FF0000",
  width: 0.01,
  points: [{ x: 0.1, y: 0.1 }],
};
function source(kind: "framed" | "owned" = "framed") {
  const leaf = pictureGroup().members[0]!;
  if (!isGroupedPicture(leaf)) throw new Error("Expected a genuine picture leaf.");
  const image = kind === "framed" ? framedPicture() : leaf;
  image.frame.angleDeg = 37;
  image.frame.flipHorizontal = true;
  image.frame.flipVertical = true;
  image.frame.source = { widthRatio: 0.5, heightRatio: 2, offsetXRatio: 0.8, offsetYRatio: -0.2 };
  image.transform = {
    appearance: {
      opacity: 0.5,
      brightness: 0.7,
      detailedStyle: {
        rotation3d: {
          kind: "value",
          value: {
            projection: "parallel",
            xDeg: 20,
            yDeg: 30,
            zDeg: 10,
            distanceFromGroundPt: 0,
          },
        },
      },
    },
    annotations: structuredClone([originalAnnotation]),
  };
  const frameSource = capturePictureSourcePresentation(
    image,
    resolvePictureSourceLayout({ x: 100, y: 200, width: 120, height: 80 }, 52, image.frame.source),
  );
  return { image, frameSource };
}
function fill(input: PictureSourcePresentation, assetId: string) {
  input.picture.transform = {
    ...input.picture.transform,
    appearance: {
      ...input.picture.transform?.appearance,
      detailedStyle: {
        ...input.picture.transform?.appearance?.detailedStyle,
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId,
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
}
function setup() {
  vi.stubGlobal("Image", ImageStub);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.mocked(createPictureSourcePresentationCanvas).mockImplementation(
    (_image, input, _theme, resources) => {
      const missing = getDetailedPictureStyleAssetIds(
        input.picture.transform?.appearance?.detailedStyle,
      ).filter((id) => !resources?.getAssetImage?.(id));
      if (missing.length) {
        const plan = planPictureDetailedPaint({
          width: 240,
          height: 180,
          density: 1,
          appearance: input.picture.transform?.appearance,
          resources: {
            getAssetSize: (id) => (missing.includes(id) ? undefined : { width: 1, height: 1 }),
          },
        });
        if (!plan || plan.kind !== "unavailable")
          throw new Error("Expected an unavailable resource fixture.");
        throw new PicturePaintUnavailableError(plan);
      }
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 180;
      temporary.push(canvas);
      return canvas;
    },
  );
}
async function fixture(
  options: {
    kind?: "framed" | "owned";
    handler?: (image: PictureAssetSource) => boolean;
    prepare?: (input: ReturnType<typeof source>) => void;
    missingPresentation?: boolean;
    urls?: ReadonlyMap<string, string>;
  } = {},
) {
  setup();
  const input = source(options.kind);
  options.prepare?.(input);
  const before = structuredClone(input);
  const wrapper = mount(PictureAnnotationDialog, {
    attachTo: document.body,
    props: {
      image: input.image,
      source: "blob:source",
      frameSource: options.missingPresentation ? undefined : input.frameSource,
      theme: DEFAULT_WORKBOOK_THEME,
      assetUrls: options.urls,
      confirmHandler: options.handler,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const editor = document.querySelector(
    ".picture-annotation__view canvas",
  ) as HTMLCanvasElement | null;
  if (editor)
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
    } as DOMRect);
  return { ...input, before, wrapper, editor };
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }),
  );
}
function draw(editor: HTMLCanvasElement) {
  pointer(editor, "pointerdown", 100, 150);
  pointer(window, "pointermove", 500, -20);
  pointer(window, "pointerup", 300, 180);
}
function button(text: string) {
  return new DOMWrapper(
    [...document.querySelectorAll(".picture-annotation button")].find(
      (item) => item.textContent?.trim() === text,
    )!,
  );
}
function apply(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"]) {
  wrapper.findComponent(Dialog).vm.$emit("confirm");
}
afterEach(() => {
  mounted.splice(0).forEach((item) => item.unmount());
  decoded.length = 0;
  temporary.length = 0;
  sourceDimensions = { width: 400, height: 200 };
  autoLoad = true;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(["framed", "owned"] as const)(
  "%s source draws original UVs and previews the unchanged real geometry",
  async (kind) => {
    const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
    const f = await fixture({ kind, handler });
    expect([f.editor!.width, f.editor!.height]).toEqual([400, 200]);
    expect(document.querySelectorAll(".picture-annotation canvas")).toHaveLength(2);
    expect(document.querySelector(".picture-annotation__view--preview")?.textContent).toContain(
      "Current appearance",
    );
    draw(f.editor!);
    apply(f.wrapper);
    apply(f.wrapper);
    expect(handler).toHaveBeenCalledOnce();
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    const result = handler.mock.calls[0]![0] as PictureAssetSource;
    expect(result.id).toBe(f.image.id);
    expect(result.assetId).toBe(f.image.assetId);
    expect(result).toHaveProperty("frame", f.before.image.frame);
    expect(result).not.toHaveProperty("width");
    expect(result).not.toHaveProperty("anchor");
    expect(isGroupedPicture(result)).toBe(kind === "owned");
    expect(result.transform?.appearance).toEqual(f.before.image.transform?.appearance);
    expect(result.transform?.annotations?.[1]?.points).toEqual([
      { x: 0.25, y: 0.75 },
      { x: 1, y: 0 },
      { x: 0.75, y: 0.9 },
    ]);
    expect(f.image).toEqual(f.before.image);
    expect(f.frameSource).toEqual(f.before.frameSource);
    const editorTransform = vi.mocked(paintImagePresentation).mock.calls.at(-1)![3];
    expect(Object.keys(editorTransform!)).toEqual(["annotations"]);
    const preview = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.at(-1)!;
    expect(preview[1].geometry).toEqual(f.before.frameSource.geometry);
    expect(preview[1].picture.frame).toEqual(f.before.frameSource.picture.frame);
    expect(preview[1].picture.transform?.annotations).toEqual(result.transform?.annotations);
    expect(preview[2]).toEqual(DEFAULT_WORKBOOK_THEME);
    expect(preview[4]).toBe(1000);
    expect(temporary.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  },
);

test("cancelled strokes and clear/undo preserve the source, with repeated failed apply retaining its draft", async () => {
  const handler = vi
    .fn<(image: PictureAssetSource) => boolean>()
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValue(true);
  const f = await fixture({ handler });
  pointer(f.editor!, "pointerdown", 50, 50);
  pointer(window, "pointermove", 100, 100);
  pointer(window, "pointercancel", 100, 100);
  draw(f.editor!);
  await button("Clear annotations").trigger("click");
  await button("Undo annotation").trigger("click");
  apply(f.wrapper);
  await f.wrapper.setProps({ error: "Annotations could not be applied" });
  apply(f.wrapper);
  apply(f.wrapper);
  apply(f.wrapper);
  expect(handler).toHaveBeenCalledTimes(3);
  expect(handler.mock.calls.map(([image]) => image.transform?.annotations)).toEqual(
    Array(3).fill(handler.mock.calls[0]![0].transform?.annotations),
  );
  expect(handler.mock.calls[0]![0].transform?.annotations).toHaveLength(2);
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Annotations could not be applied",
  );
  expect(document.querySelector(".picture-annotation__view canvas")).toBe(f.editor);
  expect(f.image).toEqual(f.before.image);
});

test("close cancels the active draft and later pointer events never confirm or mutate the real source", async () => {
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({ handler });
  pointer(f.editor!, "pointerdown", 100, 150);
  pointer(window, "pointermove", 150, 150);
  f.wrapper.findComponent(Dialog).vm.$emit("close");
  expect(f.wrapper.emitted("close")).toHaveLength(1);
  f.wrapper.unmount();
  pointer(window, "pointerup", 300, 100);
  expect(handler).not.toHaveBeenCalled();
  expect(f.image).toEqual(f.before.image);
});

test("oversized decoded sources fail before editor/preview allocation", async () => {
  sourceDimensions = { width: 32768, height: 32768 };
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({ handler });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not process the picture",
  );
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  expect(paintImagePresentation).not.toHaveBeenCalled();
  apply(f.wrapper);
  expect(handler).not.toHaveBeenCalled();
});

test("missing source geometry is unavailable instead of a false framed appearance", async () => {
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({ handler, missingPresentation: true });
  expect(f.editor).not.toBeNull();
  expect(
    document.querySelector('.picture-annotation__view--preview [role="alert"]')?.textContent,
  ).toBe("The image file is unavailable.");
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  apply(f.wrapper);
  expect(handler).not.toHaveBeenCalled();
});

test("loads only actual fill textures, then redraws the preview with the latest annotation draft", async () => {
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({
    handler,
    prepare: (input) => fill(input.frameSource, "texture"),
    urls: new Map([
      ["texture", "blob:texture"],
      ["unrelated", "blob:unrelated"],
    ]),
  });
  expect(decoded.map((image) => image.url)).toEqual(["blob:source", "blob:texture"]);
  expect(
    document.querySelector('.picture-annotation__view--preview [role="status"]')?.textContent,
  ).toBe("Preparing image…");
  draw(f.editor!);
  apply(f.wrapper);
  expect(handler).not.toHaveBeenCalled();
  decoded[1]!.finish();
  await flushPromises();
  expect(document.querySelector('.picture-annotation__view--preview [role="alert"]')).toBeNull();
  apply(f.wrapper);
  expect(handler).toHaveBeenCalledOnce();
  const last = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.at(-1)!;
  expect(last[1].picture.transform?.annotations).toHaveLength(2);
  expect(last[3]?.getAssetImage?.("texture")).toBe(decoded[1]);
  expect(temporary.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

test("failed or over-budget auxiliary textures never fall back to an unformatted preview", async () => {
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({
    handler,
    prepare: (input) => fill(input.frameSource, "texture"),
    urls: new Map([["texture", "blob:texture"]]),
  });
  decoded[1]!.finish(32768, 32768);
  await flushPromises();
  expect(
    document.querySelector('.picture-annotation__view--preview [role="alert"]')?.textContent,
  ).toBe("The image file is unavailable.");
  expect(temporary).toHaveLength(0);
  apply(f.wrapper);
  expect(handler).not.toHaveBeenCalled();
});

test("late source and auxiliary load callbacks are inert after unmount", async () => {
  autoLoad = false;
  const f = await fixture();
  const lateSourceLoad = decoded[0]!.onload!;
  f.wrapper.unmount();
  lateSourceLoad();
  await flushPromises();
  expect(paintImagePresentation).not.toHaveBeenCalled();
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
  autoLoad = true;
  const g = await fixture({
    prepare: (input) => fill(input.frameSource, "texture"),
    urls: new Map([["texture", "blob:texture"]]),
  });
  const lateTextureLoad = decoded.at(-1)!.onload!;
  const before = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.length;
  g.wrapper.unmount();
  lateTextureLoad();
  await flushPromises();
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(before);
});

test("coalesces move previews while keeping source strokes immediate, flushes on end and cancels late frames", async () => {
  const f = await fixture();
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
  );
  const cancel = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  pointer(f.editor!, "pointerdown", 100, 50);
  const initialPreview = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.length;
  const initialEditor = vi.mocked(paintImagePresentation).mock.calls.length;
  pointer(window, "pointermove", 150, 80);
  pointer(window, "pointermove", 180, 90);
  pointer(window, "pointermove", 200, 100);
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(initialPreview);
  expect(paintImagePresentation).toHaveBeenCalledTimes(initialEditor + 3);
  expect(frames.size).toBe(1);
  const frame = frames.entries().next().value!;
  frames.delete(frame[0]);
  frame[1](0);
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(initialPreview + 1);
  pointer(window, "pointermove", 220, 120);
  expect(frames.size).toBe(1);
  pointer(window, "pointerup", 240, 140);
  expect(frames.size).toBe(0);
  expect(cancel).toHaveBeenCalled();
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(initialPreview + 2);
  const finished = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.at(-1)![1].picture
    .transform?.annotations;
  expect(finished?.[1]?.points.at(-1)).toEqual({ x: 0.6, y: 0.7 });
  pointer(f.editor!, "pointerdown", 100, 50);
  pointer(window, "pointermove", 180, 90);
  const lateFrame = frames.values().next().value!;
  const beforeUnmount = vi.mocked(createPictureSourcePresentationCanvas).mock.calls.length;
  f.wrapper.unmount();
  expect(frames.size).toBe(0);
  lateFrame(1);
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(beforeUnmount);
});

test("a renewed local URL for the identical source retains the annotation draft", async () => {
  const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
  const f = await fixture({ handler });
  draw(f.editor!);
  await f.wrapper.setProps({ source: "blob:renewed" });
  await flushPromises();
  apply(f.wrapper);
  expect(handler).toHaveBeenCalledOnce();
  expect(handler.mock.calls[0]![0].transform?.annotations).toHaveLength(2);
  expect(decoded).toHaveLength(2);
  expect(decoded[1]!.url).toBe("blob:renewed");
});

test.each(["id", "asset", "kind"] as const)(
  "a changed source %s invalidates the old draft without decoding or applying it to the replacement",
  async (change) => {
    const handler = vi.fn<(image: PictureAssetSource) => boolean>(() => true);
    const f = await fixture({ handler });
    draw(f.editor!);
    const replacement = change === "kind" ? source("owned").image : structuredClone(f.image);
    replacement.id = change === "id" ? "replacement-id" : f.image.id;
    replacement.assetId = change === "asset" ? "replacement-asset" : f.image.assetId;
    await f.wrapper.setProps({ image: replacement, source: "blob:replacement" });
    await flushPromises();
    apply(f.wrapper);
    expect(handler).not.toHaveBeenCalled();
    expect(decoded).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not process the picture",
    );
    expect(replacement.transform?.annotations).toEqual([originalAnnotation]);
  },
);
