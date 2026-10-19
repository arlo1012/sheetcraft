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

function locatedPointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
  touch = false,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    clientX: x,
    clientY: y,
  }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: touch ? "touch" : "mouse" },
  });
  return event;
}

describe("deferred native-chart drag capture", () => {
  test.each([false, true])(
    "leaves click and sub-threshold jitter uncaptured (touch=%s)",
    (touch) => {
      const target = document.createElement("div");
      const capture = vi.fn();
      Object.defineProperty(target, "setPointerCapture", { value: capture });
      const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
      startPointerSession({
        event: locatedPointer("pointerdown", 100, 100, touch),
        captureTarget: target,
        dragThreshold: 4,
        ...callbacks,
      });
      window.dispatchEvent(locatedPointer("pointermove", 104, 100, touch));
      window.dispatchEvent(locatedPointer("pointerup", 103, 100, touch));
      expect(capture).not.toHaveBeenCalled();
      expect(callbacks.onMove).not.toHaveBeenCalled();
      expect(callbacks.onEnd).not.toHaveBeenCalled();
      expect(callbacks.onCancel).toHaveBeenCalledOnce();
    },
  );
  test.each([false, true])(
    "captures once beyond screen-pixel threshold and commits (touch=%s)",
    (touch) => {
      const target = document.createElement("div");
      const capture = vi.fn(),
        release = vi.fn();
      Object.defineProperties(target, {
        setPointerCapture: { value: capture },
        hasPointerCapture: { value: () => true },
        releasePointerCapture: { value: release },
      });
      const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
      startPointerSession({
        event: locatedPointer("pointerdown", 100, 100, touch),
        captureTarget: target,
        dragThreshold: 4,
        ...callbacks,
      });
      window.dispatchEvent(locatedPointer("pointermove", 103, 103, touch));
      window.dispatchEvent(locatedPointer("pointermove", 110, 110, touch));
      window.dispatchEvent(locatedPointer("pointerup", 110, 110, touch));
      expect(capture).toHaveBeenCalledExactlyOnceWith(1);
      expect(release).toHaveBeenCalledExactlyOnceWith(1);
      expect(callbacks.onMove).toHaveBeenCalledTimes(2);
      expect(callbacks.onEnd).toHaveBeenCalledOnce();
      expect(callbacks.onCancel).not.toHaveBeenCalled();
    },
  );
  test.each(["pointercancel", "lostpointercapture", "Escape", "blur"])(
    "cancels activated drag on %s",
    (reason) => {
      const target = document.createElement("div");
      const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
      startPointerSession({
        event: locatedPointer("pointerdown", 0, 0),
        captureTarget: target,
        dragThreshold: 4,
        ...callbacks,
      });
      window.dispatchEvent(locatedPointer("pointermove", 10, 0));
      if (reason === "lostpointercapture") {
        const e = new Event(reason);
        Object.defineProperty(e, "pointerId", { value: 1 });
        target.dispatchEvent(e);
      } else if (reason === "Escape")
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      else if (reason === "blur") window.dispatchEvent(new Event("blur"));
      else window.dispatchEvent(locatedPointer("pointercancel", 10, 0));
      window.dispatchEvent(locatedPointer("pointerup", 10, 0));
      expect(callbacks.onCancel).toHaveBeenCalledOnce();
      expect(callbacks.onEnd).not.toHaveBeenCalled();
    },
  );
  test("legacy mouse fallback also distinguishes click from drag", () => {
    const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
    startPointerSession({
      event: new MouseEvent("mousedown", { clientX: 10, clientY: 10 }),
      dragThreshold: 4,
      ...callbacks,
    });
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 13, clientY: 10, buttons: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 13, clientY: 10 }));
    expect(callbacks.onMove).not.toHaveBeenCalled();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
  });
});

test.each([false, true])(
  "deferred drag cancels a missed outside release (already active=%s)",
  (active) => {
    const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
    startPointerSession({
      event: locatedPointer("pointerdown", 0, 0),
      dragThreshold: 4,
      ...callbacks,
    });
    if (active) window.dispatchEvent(locatedPointer("pointermove", 5, 0));
    const hover = new MouseEvent("pointermove", { clientX: 20, clientY: 0, buttons: 0 });
    Object.defineProperty(hover, "pointerId", { value: 1 });
    window.dispatchEvent(hover);
    window.dispatchEvent(locatedPointer("pointerup", 20, 0));
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(callbacks.onMove).toHaveBeenCalledTimes(active ? 1 : 0);
  },
);
test("deferred mouse fallback cancels hover after a missed release", () => {
  const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
  startPointerSession({
    event: new MouseEvent("mousedown", { buttons: 1 }),
    dragThreshold: 4,
    ...callbacks,
  });
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, buttons: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: 20 }));
  expect(callbacks.onCancel).toHaveBeenCalledOnce();
  expect(callbacks.onEnd).not.toHaveBeenCalled();
  expect(callbacks.onMove).not.toHaveBeenCalled();
});
test("touch capture transfer ignores a descendant lostcapture but honors its own", () => {
  const target = document.createElement("div"),
    child = document.createElement("div");
  target.append(child);
  const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() };
  const lost = () => {
    const e = new Event("lostpointercapture", { bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    return e;
  };
  Object.defineProperty(target, "setPointerCapture", { value: () => child.dispatchEvent(lost()) });
  startPointerSession({
    event: locatedPointer("pointerdown", 0, 0, true),
    captureTarget: target,
    dragThreshold: 4,
    ...callbacks,
  });
  window.dispatchEvent(locatedPointer("pointermove", 5, 0, true));
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  expect(callbacks.onMove).toHaveBeenCalledOnce();
  target.dispatchEvent(lost());
  expect(callbacks.onCancel).toHaveBeenCalledOnce();
  window.dispatchEvent(locatedPointer("pointerup", 5, 0, true));
  expect(callbacks.onEnd).not.toHaveBeenCalled();
});
