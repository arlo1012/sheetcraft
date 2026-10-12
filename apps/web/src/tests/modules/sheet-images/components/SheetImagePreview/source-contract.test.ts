import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import SheetImagePreview from "../../../../../modules/sheet-images/components/SheetImagePreview.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import {
  capturePictureSourcePresentation,
  createPictureSourcePresentationCanvas,
} from "../../../../../modules/sheet-images/picture-source-presentation";
import * as imageCache from "../../../../../modules/sheet-grid/canvas/image-painter";
import { PicturePaintUnavailableError } from "../../../../../shared/images/picture-detailed-render";
import { planDetailedPictureRaster } from "../../../../../shared/images/picture-detailed-compositor";
import { framedPicture } from "../../framed-picture-fixture";

vi.mock("../../../../../modules/sheet-images/picture-source-presentation", async (original) => ({
  ...(await original<object>()),
  createPictureSourcePresentationCanvas: vi.fn(),
}));
vi.mock("tdesign-vue-next/es/image-viewer", () => ({
  ImageViewer: defineComponent({
    props: { images: Array, visible: Boolean },
    setup: (props) => () =>
      h("div", {
        "data-viewer": "",
        "data-source": (props.images?.[0] as { mainImage: string } | undefined)?.mainImage,
      }),
  }),
}));
vi.mock("tdesign-vue-next/es/dialog", () => ({
  Dialog: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", { "data-preview-error": "" }, slots.default?.()),
  }),
}));
const wrappers: Array<ReturnType<typeof mount>> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.mocked(createPictureSourcePresentationCanvas).mockReset();
});
function fixture() {
  const picture = framedPicture();
  const presentation = capturePictureSourcePresentation(
    picture,
    resolvePictureSourceLayout(
      { x: 100, y: 200, width: 180, height: 90 },
      37,
      picture.frame.source,
    ),
  );
  const wrapper = mount(SheetImagePreview, {
    props: { src: "blob:source", altText: "Synthetic", frameSource: presentation },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { wrapper, presentation };
}
function canvas() {
  return {
    width: 180,
    height: 90,
    toBlob: (done: BlobCallback) => done(new Blob(["rendered"], { type: "image/png" })),
  } as HTMLCanvasElement;
}
async function load(wrapper: ReturnType<typeof mount>) {
  const image = wrapper.get("img");
  Object.defineProperties(image.element, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 200 },
  });
  await image.trigger("load");
  await flushPromises();
}

test("a source-bearing frame always uses the real painter, including unstyled blank padding", async () => {
  const result = canvas();
  vi.mocked(createPictureSourcePresentationCanvas).mockReturnValue(result);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:framed-presentation");
  const f = fixture();
  expect(f.wrapper.find("[data-viewer]").exists()).toBe(false);
  await load(f.wrapper);
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledWith(
    expect.anything(),
    f.presentation,
    undefined,
    expect.anything(),
  );
  expect(f.wrapper.get("[data-viewer]").attributes("data-source")).toBe("blob:framed-presentation");
  expect([result.width, result.height]).toEqual([0, 0]);
});
test("a source load event from the previous owner never renders the newer frame", async () => {
  vi.mocked(createPictureSourcePresentationCanvas).mockReturnValue(canvas());
  const f = fixture(),
    old = f.wrapper.get("img");
  Object.defineProperties(old.element, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 200 },
  });
  await f.wrapper.setProps({ src: "blob:new-source" });
  await old.trigger("load");
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
});
test("late encoding after close cannot publish an old URL and still releases its canvas", async () => {
  let done!: BlobCallback;
  const result = canvas();
  result.toBlob = (callback) => {
    done = callback;
  };
  vi.mocked(createPictureSourcePresentationCanvas).mockReturnValue(result);
  const urls = vi.spyOn(URL, "createObjectURL");
  const f = fixture();
  await load(f.wrapper);
  await f.wrapper.setProps({ visible: false });
  done(new Blob(["late"], { type: "image/png" }));
  await flushPromises();
  expect(urls).not.toHaveBeenCalled();
  expect([result.width, result.height]).toEqual([0, 0]);
});
test("source decode failures show an error instead of silently showing the uncropped original", async () => {
  const f = fixture();
  await f.wrapper.get("img").trigger("error");
  expect(f.wrapper.find("[data-viewer]").exists()).toBe(false);
  expect(f.wrapper.get("[data-preview-error]").text()).toBe("The image file is unavailable.");
  expect(createPictureSourcePresentationCanvas).not.toHaveBeenCalled();
});
test("a real renderer rejection never falls back to unstyled pixels", async () => {
  vi.mocked(createPictureSourcePresentationCanvas).mockImplementation(() => {
    throw new Error("Source geometry unavailable");
  });
  const f = fixture();
  await load(f.wrapper);
  expect(f.wrapper.find("[data-viewer]").exists()).toBe(false);
  expect(f.wrapper.find("[data-preview-error]").exists()).toBe(true);
});

test("actual auxiliary sources load and retry the same frame instead of leaving a missing-size preview stuck", async () => {
  let changed!: () => void;
  let ready = false;
  const auxiliary = { naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement;
  const cache = {
    get: vi.fn(() => (ready ? auxiliary : undefined)),
    peek: vi.fn(() => (ready ? auxiliary : undefined)),
    state: () => (ready ? ("ready" as const) : ("loading" as const)),
    load: async () => {},
    retain: vi.fn(),
    dispose: vi.fn(),
  };
  vi.spyOn(imageCache, "createCanvasImageCache").mockImplementation((callback) => {
    changed = callback;
    return cache;
  });
  const f = fixture();
  const picture = f.presentation.picture;
  const style = {
    fill: {
      kind: "value" as const,
      value: {
        kind: "picture" as const,
        assetId: "texture",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch" as const,
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
  };
  picture.transform = { appearance: { detailedStyle: style } };
  const plan = planDetailedPictureRaster({
    widthPx: 180,
    heightPx: 90,
    pixelDensity: 1,
    style,
    getAssetSize: () => ({ width: 32, height: 32 }),
  });
  vi.mocked(createPictureSourcePresentationCanvas)
    .mockImplementationOnce(() => {
      throw new PicturePaintUnavailableError({
        ...plan,
        kind: "unavailable",
        reason: "asset-unavailable",
        missingAssetIds: ["texture"],
      });
    })
    .mockReturnValue(canvas());
  await f.wrapper.setProps({
    frameSource: { ...f.presentation, picture },
    assetUrls: new Map([["texture", "blob:texture"]]),
  });
  await load(f.wrapper);
  expect(cache.get).toHaveBeenCalledWith("blob:texture");
  expect(f.wrapper.find("[data-preview-error]").exists()).toBe(false);
  ready = true;
  changed();
  await flushPromises();
  expect(createPictureSourcePresentationCanvas).toHaveBeenCalledTimes(2);
  expect(f.wrapper.find("[data-viewer]").exists()).toBe(true);
});
