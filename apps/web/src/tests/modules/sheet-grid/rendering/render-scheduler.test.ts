import { describe, expect, test, vi } from "vitest";
import { createSheetRenderScheduler } from "../../../../modules/sheet-grid/rendering/render-scheduler";

describe("sheet render scheduler", () => {
  test("coalesces invalidations into one paint", () => {
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

    scheduler.invalidate();
    scheduler.invalidate();

    expect(callback).toBeTypeOf("function");
    expect(paint).not.toHaveBeenCalled();
    callback?.(0);
    expect(paint).toHaveBeenCalledOnce();
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

    scheduler.invalidate();
    scheduler.dispose();
    callback?.(0);
    scheduler.invalidate();

    expect(cancel).toHaveBeenCalledWith(11);
    expect(paint).not.toHaveBeenCalled();
  });
});
