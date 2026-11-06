// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import ScreenCaptureDialog from "../../../modules/insert-tools/components/ScreenCaptureDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(deferredEncoding = false) {
  const createObjectURL = vi.fn(() => "blob:capture-source");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const encodedCanvases: HTMLCanvasElement[] = [];
  let encode: BlobCallback | undefined;
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    encodedCanvases.push(this);
    if (deferredEncoding) encode = callback;
    else callback(new Blob(["cropped PNG"], { type: "image/png" }));
  });
  const file = new File(["original capture"], "original-capture.png", { type: "image/png" });
  const wrapper = mount(ScreenCaptureDialog, {
    attachTo: document.body,
    props: { file, busy: false },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mountedWrappers.push(wrapper);
  const image = wrapper.get<HTMLImageElement>("img");
  Object.defineProperties(image.element, {
    naturalWidth: { configurable: true, value: 1600 },
    naturalHeight: { configurable: true, value: 900 },
  });
  vi.spyOn(image.element, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 50,
    right: 900,
    bottom: 500,
    width: 800,
    height: 450,
  } as DOMRect);
  await image.trigger("load");
  return {
    wrapper,
    image,
    file,
    drawImage,
    toBlob,
    encodedCanvases,
    createObjectURL,
    revokeObjectURL,
    finishEncoding(blob: Blob | null) {
      expect(encode).toBeDefined();
      encode!(blob);
    },
    unmount() {
      mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1);
      wrapper.unmount();
    },
  };
}

function numberInput(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"], label: string) {
  const input = wrapper
    .findAllComponents(InputNumber)
    .find((candidate) => candidate.vm.$attrs["aria-label"] === label);
  expect(input).toBeDefined();
  return input!;
}
async function setNumber(
  wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"],
  label: string,
  value: number,
) {
  numberInput(wrapper, label).vm.$emit("update:modelValue", value);
  await nextTick();
}
function cropValues(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"]) {
  return ["Left (px)", "Top (px)", "Width (px)", "Height (px)"].map((label) =>
    numberInput(wrapper, label).props("modelValue"),
  );
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function confirm(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"]) {
  wrapper.getComponent(Dialog).vm.$emit("confirm");
}

describe("screen capture crop dialog", () => {
  test("defaults to the full source image and reuses its original File without encoding", async () => {
    const f = await fixture();
    expect(cropValues(f.wrapper)).toEqual([0, 0, 1600, 900]);
    confirm(f.wrapper);
    await flushPromises();
    expect(f.wrapper.emitted("confirm")).toEqual([[f.file]]);
    expect(f.wrapper.emitted("confirm")![0]![0]).toBe(f.file);
    expect(f.toBlob).not.toHaveBeenCalled();
    expect(f.drawImage).not.toHaveBeenCalled();
  });

  test("maps a reverse drag on the scaled preview to real source pixels and exports that size", async () => {
    const f = await fixture();
    pointer(f.image.element, "pointerdown", 700, 400);
    pointer(window, "pointermove", 300, 150);
    pointer(window, "pointerup", 300, 150);
    await nextTick();
    expect(cropValues(f.wrapper)).toEqual([400, 200, 800, 500]);

    confirm(f.wrapper);
    await flushPromises();

    expect(f.encodedCanvases).toHaveLength(1);
    expect(f.encodedCanvases[0]).toMatchObject({ width: 800, height: 500 });
    expect(f.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.image.element,
      400,
      200,
      800,
      500,
      0,
      0,
      800,
      500,
    );
    const result = f.wrapper.emitted("confirm")![0]![0] as File;
    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(f.file);
    expect(result.name).toBe("screenshot.png");
    expect(result.type).toBe("image/png");
  });

  test("edits the crop numerically in source pixels with integer dimensions", async () => {
    const f = await fixture();
    await setNumber(f.wrapper, "Left (px)", 125.4);
    await setNumber(f.wrapper, "Top (px)", 80.6);
    await setNumber(f.wrapper, "Width (px)", 500.4);
    await setNumber(f.wrapper, "Height (px)", 200.6);
    expect(cropValues(f.wrapper)).toEqual([125, 81, 500, 201]);
    confirm(f.wrapper);
    await flushPromises();
    expect(f.encodedCanvases[0]).toMatchObject({ width: 500, height: 201 });
    expect(f.drawImage).toHaveBeenCalledExactlyOnceWith(
      f.image.element,
      125,
      81,
      500,
      201,
      0,
      0,
      500,
      201,
    );
  });

  test("restores the full image through the select-all action", async () => {
    const f = await fixture();
    await setNumber(f.wrapper, "Width (px)", 100);
    const all = f.wrapper
      .findAllComponents(Button)
      .find((button) => button.text() === "Select entire image");
    expect(all).toBeDefined();
    await all!.trigger("click");
    expect(cropValues(f.wrapper)).toEqual([0, 0, 1600, 900]);
    confirm(f.wrapper);
    expect(f.wrapper.emitted("confirm")![0]![0]).toBe(f.file);
    expect(f.toBlob).not.toHaveBeenCalled();
  });

  test("cancels an unfinished drag without submitting or losing the previous crop", async () => {
    const f = await fixture();
    await setNumber(f.wrapper, "Width (px)", 300);
    pointer(f.image.element, "pointerdown", 700, 400);
    pointer(window, "pointermove", 300, 150);
    pointer(window, "pointercancel", 300, 150);
    await nextTick();
    expect(cropValues(f.wrapper)).toEqual([0, 0, 300, 900]);
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
  });

  test("closes without confirming a crop", async () => {
    const f = await fixture();
    await setNumber(f.wrapper, "Width (px)", 300);
    f.wrapper.getComponent(Dialog).vm.$emit("close");
    expect(f.wrapper.emitted("close")).toEqual([[]]);
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.toBlob).not.toHaveBeenCalled();
  });

  test("keeps the crop available after encoding fails and clears the error when a retry succeeds", async () => {
    const f = await fixture(true);
    await setNumber(f.wrapper, "Left (px)", 100);
    await setNumber(f.wrapper, "Top (px)", 50);
    await setNumber(f.wrapper, "Width (px)", 300);
    await setNumber(f.wrapper, "Height (px)", 200);
    const selected = cropValues(f.wrapper);
    confirm(f.wrapper);
    f.finishEncoding(null);
    await flushPromises();

    expect(f.toBlob).toHaveBeenCalledTimes(1);
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(cropValues(f.wrapper)).toEqual(selected);
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: false,
      loading: false,
    });

    confirm(f.wrapper);
    await nextTick();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(f.toBlob).toHaveBeenCalledTimes(2);
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
      loading: true,
    });
    f.finishEncoding(new Blob(["retried PNG"], { type: "image/png" }));
    await flushPromises();

    expect(f.wrapper.emitted("confirm")).toHaveLength(1);
    expect(f.wrapper.emitted("confirm")![0]![0]).toBeInstanceOf(File);
    expect(f.wrapper.emitted("confirm")![0]![0]).toMatchObject({
      name: "screenshot.png",
      type: "image/png",
    });
    expect(cropValues(f.wrapper)).toEqual(selected);
    expect(f.encodedCanvases).toHaveLength(2);
    for (const canvas of f.encodedCanvases)
      expect(canvas).toMatchObject({ width: 300, height: 200 });
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: false,
      loading: false,
    });
  });

  test("keeps confirmation disabled after the source image fails to load", async () => {
    const f = await fixture();
    await f.image.trigger("error");
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
    });

    confirm(f.wrapper);
    await flushPromises();

    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.toBlob).not.toHaveBeenCalled();
    expect(f.drawImage).not.toHaveBeenCalled();
  });

  test("does not submit a crop that finishes encoding after the dialog is unmounted", async () => {
    const f = await fixture(true);
    await setNumber(f.wrapper, "Width (px)", 300);
    confirm(f.wrapper);
    await nextTick();
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
      loading: true,
    });
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    f.unmount();
    f.finishEncoding(new Blob(["late PNG"], { type: "image/png" }));
    await flushPromises();

    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:capture-source");
  });
});
