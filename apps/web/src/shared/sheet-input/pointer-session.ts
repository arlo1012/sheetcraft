/**
 * Owns the one document-level drag gesture that may be active in a sheet.
 * Controllers keep their domain state; this module owns capture, listeners,
 * cancellation, and replacement when a new gesture begins.
 */
export type GestureEvent = PointerEvent | MouseEvent;

export type PointerSessionOptions = {
  event: GestureEvent;
  captureTarget?: HTMLElement | null;
  /** Delay capture and drag callbacks until movement exceeds this CSS-pixel distance.
   * An unactivated release cancels the gesture, leaving native click/dblclick intact. */
  dragThreshold?: number;
  onMove: (event: GestureEvent) => void;
  onEnd: (event: GestureEvent) => void;
  onCancel: () => void;
};

export type PointerSession = {
  readonly active: boolean;
  cancel: () => void;
};

let activeSession: ActivePointerSession | undefined;

class ActivePointerSession implements PointerSession {
  private ended = false;
  private readonly pointerId: number | undefined;
  private readonly usesPointerEvents: boolean;
  private activated: boolean;

  constructor(private readonly options: PointerSessionOptions) {
    if (
      options.dragThreshold !== undefined &&
      (!Number.isFinite(options.dragThreshold) || options.dragThreshold < 0)
    )
      throw new RangeError("Pointer drag threshold must be finite and nonnegative.");
    this.activated = options.dragThreshold === undefined;
    this.pointerId = (options.event as PointerEvent).pointerId;
    this.usesPointerEvents = typeof this.pointerId === "number";
    if (this.usesPointerEvents) {
      if (this.activated) this.capturePointer();
      options.captureTarget?.addEventListener("lostpointercapture", this.onLostPointerCapture);
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerCancel);
    } else {
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("mouseup", this.onMouseUp);
    }
    window.addEventListener("keydown", this.onKeydown, true);
    window.addEventListener("blur", this.cancel);
  }

  get active(): boolean {
    return !this.ended;
  }

  cancel = (): void => {
    this.finish("cancel");
  };

  private matchesPointer(event: PointerEvent): boolean {
    return this.pointerId === event.pointerId;
  }

  private capturePointer(): void {
    try {
      this.options.captureTarget?.setPointerCapture?.(this.pointerId!);
    } catch {
      // The source may have unmounted between pointerdown and capture.
    }
  }

  private releasePointer(): void {
    try {
      const target = this.options.captureTarget;
      if (target?.hasPointerCapture?.(this.pointerId!))
        target.releasePointerCapture(this.pointerId!);
    } catch {
      // Capture can be released by the browser before cleanup runs.
    }
  }

  private activate(event: GestureEvent, capture: boolean): boolean {
    if (
      !this.activated &&
      Math.hypot(
        event.clientX - this.options.event.clientX,
        event.clientY - this.options.event.clientY,
      ) > this.options.dragThreshold!
    ) {
      this.activated = true;
      if (capture && this.usesPointerEvents) this.capturePointer();
    }
    return this.activated && !this.ended;
  }

  private releasedDuringMove(event: GestureEvent): boolean {
    // Deferred capture can miss a release outside the document. A later hover
    // must not activate (or continue) a chart drag and submit stale geometry.
    if (this.options.dragThreshold !== undefined && !(event.buttons & 1)) {
      this.cancel();
      return true;
    }
    return false;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.matchesPointer(event)) return;
    if (!this.releasedDuringMove(event) && this.activate(event, true)) this.options.onMove(event);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.matchesPointer(event)) return;
    this.finish(this.activate(event, false) ? "end" : "cancel", event);
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.matchesPointer(event)) this.finish("cancel");
  };

  private onLostPointerCapture = (event: PointerEvent): void => {
    if (event.target === this.options.captureTarget && this.matchesPointer(event))
      this.finish("cancel");
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.releasedDuringMove(event) && this.activate(event, true)) this.options.onMove(event);
  };

  private onMouseUp = (event: MouseEvent): void => {
    this.finish(this.activate(event, false) ? "end" : "cancel", event);
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        '[role="dialog"], [role="menu"], form, input, textarea, select, [role="textbox"], [contenteditable="true"]',
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.finish("cancel");
  };

  private finish(kind: "end" | "cancel", event?: GestureEvent): void {
    if (this.ended) return;
    this.ended = true;
    if (activeSession === this) activeSession = undefined;
    const target = this.options.captureTarget;
    if (this.usesPointerEvents) {
      target?.removeEventListener("lostpointercapture", this.onLostPointerCapture);
      if (this.activated) this.releasePointer();
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerCancel);
    } else {
      window.removeEventListener("mousemove", this.onMouseMove);
      window.removeEventListener("mouseup", this.onMouseUp);
    }
    window.removeEventListener("keydown", this.onKeydown, true);
    window.removeEventListener("blur", this.cancel);
    if (kind === "end" && event) this.options.onEnd(event);
    else this.options.onCancel();
  }
}

export function startPointerSession(options: PointerSessionOptions): PointerSession {
  activeSession?.cancel();
  const session = new ActivePointerSession(options);
  activeSession = session;
  return session;
}
