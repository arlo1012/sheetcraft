import { afterEach, describe, expect, test } from "vitest";
import { useDimensionResize } from "../../../../modules/sheet-grid/composables/useDimensionResize";

function createPointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup",
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

describe("useDimensionResize", () => {
  afterEach(() => {
    window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1 }));
  });

  test("removes global listeners when a resize is stopped before pointer release", () => {
    const committed: Array<{ axis: string; index: number; size: number }> = [];
    const resize = useDimensionResize({
      onBeforeStart: () => undefined,
      onCommit: (payload) => committed.push(payload),
    });
    const handle = document.createElement("span");
    handle.addEventListener("pointerdown", (event) => {
      resize.start("column", {
        index: 2,
        event: event as PointerEvent,
        startSize: 96,
      });
    });

    handle.dispatchEvent(createPointerEvent("pointerdown", { pointerId: 1, clientX: 96 }));
    window.dispatchEvent(createPointerEvent("pointermove", { pointerId: 1, clientX: 128 }));

    expect(resize.dimensionResize.value?.previewSize).toBe(128);
    resize.stop();
    window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 1, clientX: 128 }));

    expect(resize.dimensionResize.value).toBeUndefined();
    expect(committed).toEqual([]);
  });
});
