import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import SheetImagePreview from "../../../../../modules/sheet-images/components/SheetImagePreview.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import * as appearances from "../../../../../shared/images/imageAppearance";
import { PicturePaintUnavailableError } from "../../../../../shared/images/picture-detailed-render";
import { planDetailedPictureRaster } from "../../../../../shared/images/picture-detailed-compositor";

vi.mock("tdesign-vue-next/es/dialog", () => ({
  Dialog: defineComponent({
    props: { visible: Boolean },
    emits: ["confirm", "close"],
    setup:
      (_p, { slots, emit }) =>
      () =>
        h("button", { "data-paint-error": "", onClick: () => emit("confirm") }, slots.default?.()),
  }),
}));
vi.mock("tdesign-vue-next/es/image-viewer", () => ({
  ImageViewer: defineComponent({
    props: { images: Array, visible: Boolean },
    setup: (props) => () =>
      h("div", {
        "data-viewer": "",
        "data-visible": props.visible,
        "data-source": (props.images?.[0] as { mainImage?: string } | undefined)?.mainImage,
      }),
  }),
}));
const appearance = { detailedStyle: { fill: { kind: "none" as const } } };
function mountPreview(assetUrls?: Map<string, string>) {
  return mount(SheetImagePreview, {
    props: { src: "blob:source", altText: "Synthetic", transform: { appearance }, assetUrls },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
async function loadSource(wrapper: ReturnType<typeof mountPreview>) {
  const probe = wrapper.get(".sheet-image-preview__probe");
  Object.defineProperties(probe.element, {
    naturalWidth: { value: 120 },
    naturalHeight: { value: 80 },
  });
  await probe.trigger("load");
  await flushPromises();
}
function unavailable() {
  return new PicturePaintUnavailableError({
    ...planDetailedPictureRaster({
      widthPx: 120,
      heightPx: 80,
      pixelDensity: 1,
      style: appearance.detailedStyle,
    }),
    kind: "unavailable",
    reason: "asset-unavailable",
    missingAssetIds: ["texture"],
  });
}
function encodedCanvas() {
  return {
    toBlob: (done: BlobCallback) => done(new Blob(["synthetic"], { type: "image/png" })),
  } as HTMLCanvasElement;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("a failed detailed preview visibly reports unavailable and never displays the unformatted source", async () => {
  vi.spyOn(appearances, "createPictureCanvas").mockImplementation(() => {
    throw unavailable();
  });
  const wrapper = mountPreview();
  await loadSource(wrapper);
  expect(wrapper.find("[data-viewer]").exists()).toBe(false);
  expect(wrapper.get("[data-paint-error]").text()).toBe("The image file is unavailable.");
  await wrapper.get("[data-paint-error]").trigger("click");
  expect(wrapper.emitted("close")).toEqual([[]]);
  wrapper.unmount();
});
test("ready detailed preview receives exact resources and presents its owned expanded bitmap", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:expanded");
  const build = vi.spyOn(appearances, "createPictureCanvas").mockReturnValue(encodedCanvas());
  const wrapper = mountPreview(new Map([["texture", "blob:texture"]]));
  await loadSource(wrapper);
  expect(build.mock.calls[0]![3]?.getAssetImage).toBeTypeOf("function");
  expect(wrapper.get("[data-viewer]").attributes("data-source")).toBe("blob:expanded");
  expect(wrapper.find("[data-paint-error]").exists()).toBe(false);
  wrapper.unmount();
});
test("a pending auxiliary image waits without an error flash, then rebuilds the current preview", async () => {
  class TestImage {
    complete = false;
    naturalWidth = 0;
    naturalHeight = 0;
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
  }
  const images: TestImage[] = [];
  vi.stubGlobal(
    "Image",
    class extends TestImage {
      constructor() {
        super();
        images.push(this);
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:expanded");
  const build = vi
    .spyOn(appearances, "createPictureCanvas")
    .mockImplementation((_image, _transform, _side, resources) => {
      if (!resources?.getAssetImage?.("texture")) throw unavailable();
      return encodedCanvas();
    });
  const wrapper = mountPreview(new Map([["texture", "blob:texture"]]));
  await loadSource(wrapper);
  expect(wrapper.find("[data-paint-error]").exists()).toBe(false);
  expect(wrapper.find("[data-viewer]").exists()).toBe(false);
  images[0]!.complete = true;
  images[0]!.naturalWidth = images[0]!.naturalHeight = 20;
  images[0]!.onload?.();
  await flushPromises();
  expect(build).toHaveBeenCalledTimes(2);
  expect(wrapper.get("[data-viewer]").attributes("data-source")).toBe("blob:expanded");
  wrapper.unmount();
});
test("an old asynchronous encoding cannot reopen or populate a replacement preview", async () => {
  let finish: BlobCallback | undefined;
  vi.spyOn(appearances, "createPictureCanvas").mockReturnValue({
    toBlob: (done: BlobCallback) => {
      finish = done;
    },
  } as HTMLCanvasElement);
  const createUrl = vi.spyOn(URL, "createObjectURL");
  const wrapper = mountPreview();
  await loadSource(wrapper);
  await wrapper.setProps({ src: "blob:replacement" });
  finish?.(new Blob(["old"]));
  await flushPromises();
  expect(createUrl).not.toHaveBeenCalled();
  expect(wrapper.find("[data-viewer]").exists()).toBe(false);
  wrapper.unmount();
});
