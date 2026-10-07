import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet } from "@idea10/core/workbook";
import WorkbookStatusBar from "../../../../../modules/workbook/components/WorkbookStatusBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  notify(width: number): void {
    const target = this.observe.mock.calls[0]?.[0];
    this.callback(
      [{ contentRect: { width }, target } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const mounted: VueWrapper[] = [];

function mountStatusBar(): VueWrapper {
  const wrapper = mount(WorkbookStatusBar, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      sheets: [createSheet("Sheet1", "sheet-1")],
      activeSheetId: "sheet-1",
      selectionSummary: {
        average: 0,
        count: 0,
        maximum: 0,
        minimum: 0,
        numericCount: 0,
        selectedCellCount: 1,
        sum: 0,
      },
    },
    slots: { "horizontal-scrollbar": '<div data-horizontal-scrollbar="true" />' },
  });
  mounted.push(wrapper);
  return wrapper;
}

function pointerEvent(
  type: string,
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function separator(wrapper: VueWrapper): HTMLElement {
  return wrapper.get<HTMLElement>(".workbook-status-bar__splitter").element;
}

function notifyContainerWidth(width: number): void {
  MockResizeObserver.instances
    .find((observer) =>
      observer.observe.mock.calls.some(([target]) =>
        (target as Element).classList.contains("workbook-status-bar__top-row"),
      ),
    )
    ?.notify(width);
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  MockResizeObserver.instances = [];
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WorkbookStatusBar sheet tabs resize", () => {
  test("exposes the sheet tabs splitter with its bounded default width", async () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const wrapper = mountStatusBar();
    const topRow = wrapper.get<HTMLElement>(".workbook-status-bar__top-row");
    const sheets = wrapper.get<HTMLElement>(".workbook-status-bar__sheets");
    notifyContainerWidth(800);
    await nextTick();

    const control = separator(wrapper);
    expect(control.getAttribute("role")).toBe("separator");
    expect(control.getAttribute("tabindex")).toBe("0");
    expect(control.getAttribute("aria-orientation")).toBe("vertical");
    expect(control.getAttribute("aria-label")).toBe("Resize sheet tabs area");
    expect(sheets.element.id).toBe(control.getAttribute("aria-controls"));
    expect(control.getAttribute("aria-valuemin")).toBe("200");
    expect(control.getAttribute("aria-valuemax")).toBe("552");
    expect(control.getAttribute("aria-valuenow")).toBe("200");
    expect(topRow.element.style.getPropertyValue("--sheet-tabs-width")).toBe("200px");
  });

  test("drags only with the active primary pointer and restores its start width on cancel", async () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const wrapper = mountStatusBar();
    notifyContainerWidth(800);
    await nextTick();
    const control = separator(wrapper);
    const capture = vi.fn();
    const release = vi.fn();
    Object.defineProperties(control, {
      setPointerCapture: { configurable: true, value: capture },
      releasePointerCapture: { configurable: true, value: release },
      hasPointerCapture: { configurable: true, value: () => true },
    });

    control.dispatchEvent(pointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 200 }));
    control.dispatchEvent(pointerEvent("pointermove", { pointerId: 9, clientX: 500 }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("200");

    control.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientX: 320 }));
    await nextTick();
    expect(capture).toHaveBeenCalledWith(7);
    expect(control.getAttribute("aria-valuenow")).toBe("320");

    control.dispatchEvent(pointerEvent("pointercancel", { pointerId: 7 }));
    await nextTick();
    expect(release).toHaveBeenCalledWith(7);
    expect(control.getAttribute("aria-valuenow")).toBe("200");

    control.dispatchEvent(pointerEvent("pointerdown", { button: 2, pointerId: 8, clientX: 200 }));
    control.dispatchEvent(pointerEvent("pointermove", { pointerId: 8, clientX: 400 }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("200");
  });

  test("supports bounded unmodified keyboard resizing", async () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const wrapper = mountStatusBar();
    notifyContainerWidth(800);
    await nextTick();
    const control = separator(wrapper);

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("216");

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("216");

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("552");

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("200");
  });

  test("clamps for container changes, restores the preferred width, and cleans up observers", async () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const wrapper = mountStatusBar();
    notifyContainerWidth(800);
    await nextTick();
    const control = separator(wrapper);
    const release = vi.fn();
    Object.defineProperties(control, {
      releasePointerCapture: { configurable: true, value: release },
      hasPointerCapture: { configurable: true, value: () => true },
    });

    control.dispatchEvent(pointerEvent("pointerdown", { button: 0, pointerId: 3, clientX: 200 }));
    control.dispatchEvent(pointerEvent("pointermove", { pointerId: 3, clientX: 500 }));
    control.dispatchEvent(pointerEvent("pointerup", { pointerId: 3 }));
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("500");

    notifyContainerWidth(300);
    await nextTick();
    expect(control.getAttribute("aria-valuemax")).toBe("192");
    expect(control.getAttribute("aria-valuenow")).toBe("192");

    notifyContainerWidth(800);
    await nextTick();
    expect(control.getAttribute("aria-valuenow")).toBe("500");

    control.dispatchEvent(pointerEvent("pointerdown", { button: 0, pointerId: 4, clientX: 500 }));
    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    expect(release).toHaveBeenCalledWith(4);
    expect(MockResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
