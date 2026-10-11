import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SheetPictureCropOverlay from "../../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { canvasContext, fixture } from "./fixture";

const mounted: VueWrapper[] = [];
const images: TestImage[] = [];
class TestImage {
  complete = false;
  naturalWidth = 400;
  naturalHeight = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    images.push(this);
  }
}
let context: ReturnType<typeof canvasContext>;
beforeEach(() => {
  context = canvasContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal("Image", TestImage);
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  images.splice(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mountedFixture(assetUrl?: string, scale = 1) {
  const f = fixture();
  const wrapper = mount(SheetPictureCropOverlay, {
    attachTo: document.body,
    props: { picture: f.picture, geometry: f.resolved(), layout: f.layout, assetUrl, scale },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  mounted.push(wrapper);
  return { ...f, wrapper };
}

describe("arbitrary-angle crop overlay", () => {
  test("renders black crop controls on the actual rotated frame and no ordinary resize handles", () => {
    const { wrapper } = mountedFixture();
    expect(wrapper.attributes("data-picture-crop-owner")).toBe("crop-leaf");
    expect(wrapper.attributes("tabindex")).toBe("0");
    const handles = wrapper.findAll("[data-picture-crop-handle]");
    expect(handles).toHaveLength(8);
    expect(handles.map((handle) => handle.attributes("data-picture-crop-handle"))).toEqual([
      "n",
      "s",
      "w",
      "e",
      "nw",
      "ne",
      "sw",
      "se",
    ]);
    for (const handle of handles) expect(handle.attributes("style")).toContain("rotate(37deg)");
    expect(wrapper.find("[data-image-resize]").exists()).toBe(false);
    expect(wrapper.find("[data-picture-crop-source]").attributes("points")).toContain(",");
    expect(wrapper.find("path").attributes("d")!.match(/M/g)).toHaveLength(4);
  });

  test("only emits crop/source start and forwards keys for the host session", async () => {
    const { wrapper } = mountedFixture();
    const body = wrapper.get("[data-picture-crop-source]");
    await body.trigger("pointerdown", { button: 0, pointerId: 1 });
    for (const direction of ["n", "s", "w", "e", "nw", "ne", "sw", "se"])
      await wrapper
        .get(`[data-picture-crop-handle="${direction}"]`)
        .trigger("pointerdown", { button: 0, pointerId: 2 });
    expect(wrapper.emitted("start")!.map((event) => event[0])).toEqual([
      "source",
      "n",
      "s",
      "w",
      "e",
      "nw",
      "ne",
      "sw",
      "se",
    ]);
    expect(wrapper.emitted("resize")).toBeUndefined();
    expect(document.activeElement).toBe(wrapper.element);
    await body.trigger("pointerdown", { button: 2 });
    expect(wrapper.emitted("start")).toHaveLength(9);
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    wrapper.element.dispatchEvent(key);
    expect(wrapper.emitted("keydown")).toEqual([[key]]);
    expect(wrapper.emitted("cancel")).toBeUndefined();
  });

  test("backs preview with a viewport-sized canvas and repaints only the current cached asset", async () => {
    const { wrapper, layout } = mountedFixture("blob:current", 0.75);
    await nextTick();
    expect(images).toHaveLength(1);
    const old = images[0]!;
    expect(old.src).toBe("blob:current");
    old.complete = true;
    old.onload?.();
    await nextTick();
    expect(context.drawImage).toHaveBeenCalledWith(old, 0, 0, 400, 200, 0, 0, 320, 250);
    const surface = wrapper.get("canvas").element as HTMLCanvasElement;
    expect(surface.style.width).toBe(`${layout.viewportSize.width}px`);
    expect(surface.width).toBe(
      Math.floor(layout.viewportSize.width * Math.min(2, window.devicePixelRatio * 0.75)),
    );
    const staleCallback = old.onload;
    context.drawImage.mockClear();
    await wrapper.setProps({ assetUrl: "blob:replacement" });
    expect(old.onload).toBeNull();
    expect(old.onerror).toBeNull();
    expect(images).toHaveLength(2);
    staleCallback?.();
    await nextTick();
    expect(context.drawImage).not.toHaveBeenCalled();
    const current = images[1]!;
    current.complete = true;
    current.onload?.();
    await nextTick();
    expect(context.drawImage).toHaveBeenCalledWith(current, 0, 0, 400, 200, 0, 0, 320, 250);
    wrapper.unmount();
    expect(current.onload).toBeNull();
    expect(current.onerror).toBeNull();
  });
});
