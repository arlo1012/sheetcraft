import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { nextTick, type ShallowRef } from "vue";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import WatermarkDialog from "../../../modules/page-decorations/components/WatermarkDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const state = vi.hoisted(() => ({
  revision: undefined as ShallowRef<number> | undefined,
  paint: vi.fn(),
}));
vi.mock("../../../shared/cell-text/useFontCatalog", async () => {
  const { shallowRef } = await import("vue");
  state.revision = shallowRef(0);
  return {
    useFontCatalog: () => ({ fontOptions: shallowRef([]), fontResourceRevision: state.revision }),
  };
});
vi.mock("../../../modules/page-decorations/page-decoration-painter", () => ({
  paintWatermarkInRect: state.paint,
}));
afterEach(() => vi.restoreAllMocks());

test("watermark preview redraws when the selected exact font resource becomes ready", async () => {
  const context = { setTransform: vi.fn(), clearRect: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const family = `SheetcraftLocal_${"a".repeat(64)}`;
  const wrapper = mount(WatermarkDialog, {
    props: { visible: true, watermark: { ...DEFAULT_SHEET_WATERMARK, fontFamily: family } },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    expect(state.paint).toHaveBeenCalled();
    state.paint.mockClear();
    state.revision!.value++;
    await nextTick();
    await nextTick();
    expect(state.paint).toHaveBeenCalledOnce();
    expect(state.paint.mock.calls[0]![1].fontFamily).toBe(family);
  } finally {
    wrapper.unmount();
  }
});
