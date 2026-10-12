import { afterEach, describe, expect, test, vi } from "vitest";
import { startPointerSession } from "../../../shared/sheet-input/pointer-session";

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  pointerId = 1,
): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true }) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

afterEach(() => {
  window.dispatchEvent(pointerEvent("pointercancel", 1));
  window.dispatchEvent(pointerEvent("pointercancel", 2));
});

describe("startPointerSession", () => {
  test("cancels the active gesture before starting a replacement", () => {
    const first = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
    const second = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };

    startPointerSession({ event: pointerEvent("pointerdown", 1), ...first });
    startPointerSession({ event: pointerEvent("pointerdown", 2), ...second });
    window.dispatchEvent(pointerEvent("pointermove", 1));
    window.dispatchEvent(pointerEvent("pointermove", 2));
    window.dispatchEvent(pointerEvent("pointerup", 2));

    expect(first.onCancel).toHaveBeenCalledOnce();
    expect(first.onMove).not.toHaveBeenCalled();
    expect(second.onMove).toHaveBeenCalledOnce();
    expect(second.onEnd).toHaveBeenCalledOnce();
  });

  test("releases capture and cancels on Escape or window blur", () => {
    const target = document.createElement("div");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(target, {
      setPointerCapture: { value: setPointerCapture },
      releasePointerCapture: { value: releasePointerCapture },
      hasPointerCapture: { value: () => true },
    });
    const firstCancel = vi.fn();
    startPointerSession({
      event: pointerEvent("pointerdown"),
      captureTarget: target,
      onMove: () => undefined,
      onEnd: () => undefined,
      onCancel: firstCancel,
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    const secondCancel = vi.fn();
    startPointerSession({
      event: pointerEvent("pointerdown", 2),
      onMove: () => undefined,
      onEnd: () => undefined,
      onCancel: secondCancel,
    });
    window.dispatchEvent(new Event("blur"));

    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(firstCancel).toHaveBeenCalledOnce();
    expect(secondCancel).toHaveBeenCalledOnce();
  });

  test("composing, prevented or another control's Escape never cancels a sheet gesture", () => {
    const cancel = vi.fn();
    const session = startPointerSession({
      event: pointerEvent("pointerdown"),
      onMove: () => undefined,
      onEnd: () => undefined,
      onCancel: cancel,
    });
    const composing = new KeyboardEvent("keydown", {
      key: "Escape",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(false);
    const prevented = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    prevented.preventDefault();
    window.dispatchEvent(prevented);
    for (const tag of ["form", "input", "textarea", "select"]) {
      const control = document.createElement(tag);
      document.body.append(control);
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      control.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      control.remove();
    }
    expect(session.active).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    session.cancel();
  });

  test("uses mouse listeners for callers that still start from mousedown", () => {
    const move = vi.fn();
    const end = vi.fn();
    startPointerSession({
      event: new MouseEvent("mousedown"),
      onMove: move,
      onEnd: end,
      onCancel: () => undefined,
    });

    window.dispatchEvent(new MouseEvent("mousemove"));
    window.dispatchEvent(new MouseEvent("mouseup"));

    expect(move).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  test("continues cleanup when pointer capture is unavailable", () => {
    const target = document.createElement("div");
    Object.defineProperties(target, {
      setPointerCapture: {
        value: () => {
          throw new DOMException("detached");
        },
      },
      hasPointerCapture: {
        value: () => {
          throw new DOMException("detached");
        },
      },
    });
    const cancel = vi.fn();

    expect(() =>
      startPointerSession({
        event: pointerEvent("pointerdown"),
        captureTarget: target,
        onMove: () => undefined,
        onEnd: () => undefined,
        onCancel: cancel,
      }).cancel(),
    ).not.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
