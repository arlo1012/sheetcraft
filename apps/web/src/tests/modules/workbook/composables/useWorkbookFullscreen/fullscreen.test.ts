import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useWorkbookFullscreen } from "../../../../../modules/workbook/composables/useWorkbookFullscreen";

function mountFullscreen(onError = vi.fn()) {
  let controls: ReturnType<typeof useWorkbookFullscreen> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        controls = useWorkbookFullscreen(onError);
        return () => null;
      },
    }),
  );
  if (!controls) throw new Error("Fullscreen controls were not initialized.");
  return { controls, onError, wrapper };
}

function setFullscreenApi(options: {
  enabled: boolean;
  element: Element | null;
  request?: () => Promise<void>;
  exit?: () => Promise<void>;
}): void {
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: options.enabled,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: options.element,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: options.request ?? vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: options.exit ?? vi.fn().mockResolvedValue(undefined),
  });
}

describe("useWorkbookFullscreen", () => {
  afterEach(() => vi.restoreAllMocks());

  test("syncs the browser fullscreen state after fullscreenchange and Escape", async () => {
    setFullscreenApi({ enabled: true, element: null });
    const { controls, wrapper } = mountFullscreen();
    expect(controls.fullscreenAvailable.value).toBe(true);
    expect(controls.fullscreen.value).toBe(false);

    setFullscreenApi({ enabled: true, element: document.documentElement });
    document.dispatchEvent(new Event("fullscreenchange"));
    await nextTick();
    expect(controls.fullscreen.value).toBe(true);

    setFullscreenApi({ enabled: true, element: null });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.dispatchEvent(new Event("fullscreenchange"));
    await nextTick();
    expect(controls.fullscreen.value).toBe(false);
    wrapper.unmount();
  });

  test("reports a rejected fullscreen request and clears its pending state", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("denied"));
    setFullscreenApi({ enabled: true, element: null, request: rejected });
    const { controls, onError, wrapper } = mountFullscreen();

    await controls.toggleFullscreen();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await controls.toggleFullscreen();
    expect(rejected).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
