import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import type { FloatingImage } from "@idea10/core/workbook";
import PictureAnnotationDialog from "../../../modules/sheet-images/components/PictureAnnotationDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../shared/images/imageAppearance", () => ({ paintImagePresentation: vi.fn() }));
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((item) => item.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture() {
  class ImageStub {
    naturalWidth = 200;
    naturalHeight = 100;
    onload?: () => void;
    onerror?: () => void;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", ImageStub);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const image: FloatingImage = {
    id: "a",
    assetId: "asset",
    altText: "test",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
    transform: {
      rotation: 90,
      appearance: { opacity: 0.5 },
      annotations: [{ kind: "pen", color: "#FF0000", width: 0.01, points: [{ x: 0.1, y: 0.1 }] }],
    },
  };
  const wrapper = mount(PictureAnnotationDialog, {
    attachTo: document.body,
    props: { image, source: "blob:fixture" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const canvas = document.querySelector(".picture-annotation canvas") as HTMLCanvasElement;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  return { wrapper, image, canvas };
}
function button(text: string) {
  return new DOMWrapper(
    [...document.querySelectorAll(".picture-annotation button")].find(
      (item) => item.textContent?.trim() === text,
    )!,
  );
}
async function confirm() {
  await new DOMWrapper(
    document.querySelector(".t-dialog__footer .t-button--theme-primary")!,
  ).trigger("click");
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }),
  );
}
test("draft drawing confirms a single transformed image without mutating its source", async () => {
  const f = await fixture();
  pointer(f.canvas, "pointerdown", 40, 20);
  pointer(window, "pointermove", 80, 60);
  pointer(window, "pointerup", 100, 70);
  await confirm();
  const result = f.wrapper.emitted("confirm")![0]![0] as FloatingImage;
  expect(result.transform?.annotations).toHaveLength(2);
  expect(result.transform?.annotations?.[1]?.points[0]).toEqual({ x: 0.2, y: 0.8 });
  expect(result.transform?.rotation).toBe(90);
  expect(result.transform?.appearance).toEqual({ opacity: 0.5 });
  expect(f.image.transform?.annotations).toHaveLength(1);
});
test("pointer cancellation discards the unfinished stroke, and clear can be undone", async () => {
  const f = await fixture();
  pointer(f.canvas, "pointerdown", 30, 30);
  pointer(window, "pointermove", 60, 60);
  pointer(window, "pointercancel", 60, 60);
  await button("Clear annotations").trigger("click");
  await button("Undo annotation").trigger("click");
  await confirm();
  expect((f.wrapper.emitted("confirm")![0]![0] as FloatingImage).transform?.annotations).toEqual(
    f.image.transform?.annotations,
  );
});
