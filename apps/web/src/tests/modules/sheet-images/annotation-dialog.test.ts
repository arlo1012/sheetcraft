import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Input } from "tdesign-vue-next/es/input";
import { RadioGroup } from "tdesign-vue-next/es/radio";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import type { PictureObject, StandalonePictureObject } from "@sheetcraft/core/picture-object";
import type { FloatingImage } from "@sheetcraft/core/workbook";
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
function requireStandalone(image: PictureObject): StandalonePictureObject {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
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
  const result = requireStandalone(f.wrapper.emitted("confirm")![0]![0] as FloatingImage);
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
  expect(
    requireStandalone(f.wrapper.emitted("confirm")![0]![0] as FloatingImage).transform?.annotations,
  ).toEqual(f.image.transform?.annotations);
});
test("command failure shows an alert while preserving the loaded annotation draft", async () => {
  const f = await fixture();
  pointer(f.canvas, "pointerdown", 40, 20);
  pointer(window, "pointermove", 80, 60);
  pointer(window, "pointerup", 100, 70);
  await f.wrapper.setProps({ error: "Annotations could not be applied" });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Annotations could not be applied",
  );
  expect(document.querySelector(".picture-annotation canvas")).toBe(f.canvas);
  await confirm();
  expect(
    requireStandalone(f.wrapper.emitted("confirm")![0]![0] as FloatingImage).transform?.annotations,
  ).toHaveLength(2);
});

test.each(["busy", "confirming"])(
  "annotation options consistently disable while %s",
  async (state) => {
    const { wrapper } = await fixture();
    wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", "text");
    await wrapper.vm.$nextTick();
    const numbers = wrapper.findAllComponents(InputNumber);
    expect(numbers).toHaveLength(2);
    for (const number of numbers) {
      expect(number.props("theme")).toBe("column");
      expect(number.classes()).toContain("sheetcraft-input-number--persistent-controls");
      expect(number.element.closest("label")).toBeNull();
      expect(number.element.closest('[role="group"]')?.getAttribute("aria-label")).toBeTruthy();
      expect(number.props("disabled")).toBe(false);
    }
    if (state === "busy") await wrapper.setProps({ busy: true });
    else await confirm();
    await wrapper.vm.$nextTick();
    for (const number of numbers) expect(number.props("disabled")).toBe(true);
    expect(wrapper.getComponent(Input).props("disabled")).toBe(true);
    expect((document.querySelector('input[type="color"]') as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.getComponent(RadioGroup).props("disabled")).toBe(true);
  },
);
