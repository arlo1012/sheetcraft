import { describe, expect, test, vi } from "vitest";
import { createSheetRenderScheduler } from "../../../../modules/sheet-grid/rendering/render-scheduler";

describe("sheet render scheduler", () => {
  test("coalesces invalidations and preserves only requested paint layers", () => {
    const paint = vi.fn();
    let callback: FrameRequestCallback | undefined;
    const scheduler = createSheetRenderScheduler(
      paint,
      (next) => {
        callback = next;
        return 7;
      },
      vi.fn(),
    );

    scheduler.invalidate("overlay");
    scheduler.invalidate("overlay", "borders");

    expect(callback).toBeTypeOf("function");
    expect(paint).not.toHaveBeenCalled();
    callback?.(0);
    expect(paint).toHaveBeenCalledWith(new Set(["overlay", "borders"]));
    expect(paint.mock.calls[0]?.[0]).not.toContain("content");
  });

  test("cancels a queued frame and suppresses future work after disposal", () => {
    const cancel = vi.fn();
    let callback: FrameRequestCallback | undefined;
    const paint = vi.fn();
    const scheduler = createSheetRenderScheduler(
      paint,
      (next) => {
        callback = next;
        return 11;
      },
      cancel,
    );

    scheduler.invalidate("content");
    scheduler.dispose();
    callback?.(0);
    scheduler.invalidate("overlay");

    expect(cancel).toHaveBeenCalledWith(11);
    expect(paint).not.toHaveBeenCalled();
  });
});
