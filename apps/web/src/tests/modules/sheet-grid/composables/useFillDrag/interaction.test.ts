import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { useFillDrag } from "../../../../../modules/sheet-grid/composables/useFillDrag";

function event(type: string, options: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, options);
}

afterEach(() => {
  window.dispatchEvent(event("mouseup", { buttons: 0 }));
});

describe("useFillDrag", () => {
  test("previews only outside the source and commits on release", () => {
    const scope = effectScope();
    const preview = vi.fn();
    const commit = vi.fn();
    const drag = scope.run(() =>
      useFillDrag({
        getBounds: () => ({ rowCount: 20, columnCount: 10 }),
        getCaptureTarget: () => document.body,
        getCellAtClientPoint: (x) => ({ row: Math.floor(x / 10), column: 1 }),
        getSourceRange: () => ({
          start: { row: 2, column: 1 },
          end: { row: 3, column: 1 },
        }),
        getScroller: () => null,
        getViewportSize: () => ({ width: 320, height: 240 }),
        onCommit: commit,
        onEnsureGridExtentContains: vi.fn(),
        onEnsureGridExtentCoversViewport: vi.fn(),
        onPreviewChange: preview,
        onScrollPositionChange: vi.fn(),
      }),
    )!;
    try {
      drag.start(event("mousedown", { buttons: 1, clientX: 25 }));
      window.dispatchEvent(event("mousemove", { buttons: 1, clientX: 65 }));
      window.dispatchEvent(event("mouseup", { buttons: 0, clientX: 65 }));
      expect(preview).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "down",
          target: { start: { row: 4, column: 1 }, end: { row: 6, column: 1 } },
        }),
        { copy: false },
      );
      expect(commit).toHaveBeenCalledWith(expect.objectContaining({ direction: "down" }), {
        copy: false,
      });
    } finally {
      scope.stop();
    }
  });

  test("updates copy mode when Control is pressed and released during a drag", () => {
    const preview = vi.fn();
    const commit = vi.fn();
    const drag = useFillDrag({
      getBounds: () => ({ rowCount: 20, columnCount: 10 }),
      getCaptureTarget: () => document.body,
      getCellAtClientPoint: (x) => ({ row: Math.floor(x / 10), column: 1 }),
      getSourceRange: () => ({
        start: { row: 2, column: 1 },
        end: { row: 3, column: 1 },
      }),
      getScroller: () => null,
      getViewportSize: () => ({ width: 320, height: 240 }),
      onCommit: commit,
      onEnsureGridExtentContains: vi.fn(),
      onEnsureGridExtentCoversViewport: vi.fn(),
      onPreviewChange: preview,
      onScrollPositionChange: vi.fn(),
    });
    drag.start(event("mousedown", { buttons: 1, clientX: 25 }));
    window.dispatchEvent(event("mousemove", { buttons: 1, clientX: 65 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
    window.dispatchEvent(event("mouseup", { buttons: 0, clientX: 65 }));

    expect(preview).toHaveBeenCalledWith(expect.anything(), { copy: true });
    expect(preview).toHaveBeenCalledWith(expect.anything(), { copy: false });
    expect(commit).toHaveBeenCalledWith(expect.anything(), { copy: false });
  });

  test("locks to the first axis while allowing the drag to reverse direction", () => {
    const previews: string[] = [];
    const drag = useFillDrag({
      getBounds: () => ({ rowCount: 20, columnCount: 10 }),
      getCaptureTarget: () => document.body,
      getCellAtClientPoint: (_x, y) => ({
        row: Math.floor(y / 10),
        column: 1,
      }),
      getSourceRange: () => ({
        start: { row: 2, column: 1 },
        end: { row: 3, column: 1 },
      }),
      getScroller: () => null,
      getViewportSize: () => ({ width: 320, height: 240 }),
      onCommit: vi.fn(),
      onEnsureGridExtentContains: vi.fn(),
      onEnsureGridExtentCoversViewport: vi.fn(),
      onPreviewChange: (fill) => {
        if (fill) previews.push(fill.direction);
      },
      onScrollPositionChange: vi.fn(),
    });
    drag.start(event("mousedown", { buttons: 1, clientX: 25, clientY: 25 }));
    window.dispatchEvent(event("mousemove", { buttons: 1, clientX: 25, clientY: 65 }));
    window.dispatchEvent(event("mousemove", { buttons: 1, clientX: 25, clientY: 15 }));
    drag.stop();

    expect(previews).toEqual(["down", "up"]);
  });

  test("Esc cancels without committing", () => {
    const commit = vi.fn();
    const drag = useFillDrag({
      getBounds: () => ({ rowCount: 20, columnCount: 10 }),
      getCaptureTarget: () => document.body,
      getCellAtClientPoint: (x) => ({ row: Math.floor(x / 10), column: 1 }),
      getSourceRange: () => ({
        start: { row: 2, column: 1 },
        end: { row: 3, column: 1 },
      }),
      getScroller: () => null,
      getViewportSize: () => ({ width: 320, height: 240 }),
      onCommit: commit,
      onEnsureGridExtentContains: vi.fn(),
      onEnsureGridExtentCoversViewport: vi.fn(),
      onScrollPositionChange: vi.fn(),
    });
    drag.start(event("mousedown", { buttons: 1, clientX: 25 }));
    window.dispatchEvent(event("mousemove", { buttons: 1, clientX: 65 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(commit).not.toHaveBeenCalled();
    expect(drag.preview.value).toBeUndefined();
  });

  test("captures on the handle so an unmoved first click can produce dblclick", () => {
    const handle = document.createElement("button");
    const root = document.createElement("div");
    const capture = vi.fn();
    Object.defineProperty(handle, "setPointerCapture", { value: capture });
    const drag = useFillDrag({
      getBounds: () => ({ rowCount: 20, columnCount: 10 }),
      getCaptureTarget: () => root,
      getCellAtClientPoint: () => ({ row: 2, column: 1 }),
      getSourceRange: () => ({
        start: { row: 2, column: 1 },
        end: { row: 3, column: 1 },
      }),
      getScroller: () => null,
      getViewportSize: () => ({ width: 320, height: 240 }),
      onCommit: vi.fn(),
      onEnsureGridExtentContains: vi.fn(),
      onEnsureGridExtentCoversViewport: vi.fn(),
      onScrollPositionChange: vi.fn(),
    });
    handle.addEventListener("pointerdown", (pointerEvent) => drag.start(pointerEvent));
    const down = event("pointerdown", { buttons: 1 }) as PointerEvent;
    Object.defineProperty(down, "pointerId", { value: 4 });
    handle.dispatchEvent(down);

    expect(capture).toHaveBeenCalledWith(4);
    drag.stop();
  });
});
