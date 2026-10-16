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

test("an invalidation during paint schedules a following frame instead of being swallowed", () => {
  const frames: FrameRequestCallback[] = [];
  const paint = vi.fn(() => {
    if (paint.mock.calls.length === 1) scheduler.invalidate();
  });
  const scheduler = createSheetRenderScheduler(
    paint,
    (callback) => {
      frames.push(callback);
      return frames.length;
    },
    vi.fn(),
  );
  scheduler.invalidate();
  frames[0]!(0);
  expect(paint).toHaveBeenCalledOnce();
  expect(frames).toHaveLength(2);
  frames[1]!(1);
  expect(paint).toHaveBeenCalledTimes(2);
  expect(frames).toHaveLength(2);
  scheduler.dispose();
});
