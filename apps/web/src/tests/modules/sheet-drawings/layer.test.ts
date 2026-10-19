import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import type { SheetDrawing, SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";

const drawing: SheetDrawing = {
  id: "drawing",
  kind: "shape",
  name: "Rectangle",
  anchor: { row: 1, column: 1 },
  offsetX: 4,
  offsetY: 6,
  width: 100,
  height: 50,
  text: "",
  shape: "rectangle",
  fill: "#abcdef",
  stroke: "#000000",
  strokeWidth: 1,
  color: "#000000",
  fontSize: 20,
  bold: false,
  italic: false,
  rotation: 0,
};
function fixture(readOnly = false) {
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    viewportSize: { width: 400, height: 200 },
  });
  return mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: { drawings: [drawing], layout, scale: 1, readOnly },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

describe("drawing layer", () => {
  test("missing chart selection stays safe when the source owner is unavailable", async () => {
    const wrapper = fixture();
    // Force the lookup boundary: a stale visible fragment can outlive its source owner.
    const { setupState } = wrapper.vm.$ as unknown as {
      setupState: { sourceOwner: (drawing: SheetDrawing) => SheetDrawing | undefined };
    };
    const lookup = vi.spyOn(setupState, "sourceOwner").mockReturnValue(undefined);
    try {
      await wrapper.setProps({ selectedDrawingId: drawing.id });
      expect(lookup).toHaveBeenCalled();
      expect(wrapper.getComponent(DrawingContent).props("chartSelectedElement")).toBeUndefined();
    } finally {
      lookup.mockRestore();
      wrapper.unmount();
    }
  });

  test("chart selection requires the current source identity and selected drawing id", async () => {
    const wrapper = fixture();
    const chart: SheetChartDrawing = {
      ...drawing,
      kind: "chart",
      chart: {
        type: "column",
        range: null,
        title: "Sales",
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: true,
        labels: false,
        stacked: false,
        showHidden: false,
      },
    };
    try {
      await wrapper.setProps({ drawings: [chart], selectedDrawingId: chart.id });
      const content = () => wrapper.getComponent(DrawingContent).props("chartSelectedElement");
      expect(content()).toBeUndefined();
      await wrapper.setProps({
        chartElementSelection: { owner: chart, target: { kind: "title" } },
      });
      expect(content()).toEqual({ kind: "title" });
      await wrapper.setProps({
        chartElementSelection: { owner: { ...chart }, target: { kind: "legend" } },
      });
      expect(content()).toBeUndefined();
      await wrapper.setProps({
        chartElementSelection: { owner: chart, target: { kind: "title" } },
        selectedDrawingId: "other",
      });
      expect(content()).toBeUndefined();
      await wrapper.setProps({ selectedDrawingId: chart.id, chartElementSelection: undefined });
      expect(content()).toBeUndefined();
      await wrapper.setProps({ drawings: [] });
      expect(wrapper.findComponent(DrawingContent).exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  test("routes keyboard delete, movement, and edit to the selected drawing", async () => {
    const wrapper = fixture();
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    await object.trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("delete")).toEqual([[drawing.id]]);
    await object.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    expect(wrapper.emitted("update")?.[0]?.[0]).toMatchObject({
      id: drawing.id,
      offsetX: 14,
      offsetY: 6,
    });
    await object.trigger("keydown", { key: "F2" });
    expect(wrapper.emitted("edit")).toEqual([[drawing]]);
    await object.trigger("dblclick");
    expect(wrapper.emitted("edit")).toHaveLength(2);
    wrapper.unmount();
  });

  test("cancels a drag without submitting preview geometry", async () => {
    const wrapper = fixture();
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    object.element.dispatchEvent(pointer("pointerdown", 90, 30));
    document.dispatchEvent(pointer("pointermove", 120, 50));
    await nextTick();
    document.dispatchEvent(pointer("pointercancel", 120, 50));
    await nextTick();
    expect(wrapper.emitted("select")).toHaveLength(1);
    expect(wrapper.emitted("update")).toBeUndefined();
    wrapper.unmount();
  });

  test("blocks editing, deletion and movement in read-only mode", async () => {
    const wrapper = fixture(true);
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    for (const key of ["Delete", "ArrowRight", "Enter"]) await object.trigger("keydown", { key });
    await object.trigger("dblclick");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(wrapper.emitted("edit")).toBeUndefined();
    wrapper.unmount();
  });
});

test("chart clicks stay on the inner native target without drawing capture or history updates", async () => {
  const wrapper = fixture();
  const chart: SheetChartDrawing = {
    ...drawing,
    kind: "chart",
    chart: {
      type: "bar",
      range: null,
      title: "",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: false,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
  await wrapper.setProps({ drawings: [chart] });
  const object = wrapper.get('[data-sheet-drawing-id="drawing"]').element as HTMLElement;
  const capture = vi.fn();
  Object.defineProperty(object, "setPointerCapture", { value: capture });
  const inner = document.createElement("div");
  object.append(inner);
  const clicked = vi.fn();
  inner.addEventListener("click", clicked);
  const doubleClicked = vi.fn((event: Event) => event.stopPropagation());
  inner.addEventListener("dblclick", doubleClicked);
  try {
    const down = pointer("pointerdown", 90, 30);
    inner.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    inner.dispatchEvent(pointer("pointerup", 90, 30));
    await nextTick();
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toHaveBeenCalledOnce();
    inner.dispatchEvent(pointer("pointerdown", 90, 30));
    inner.dispatchEvent(pointer("pointerup", 90, 30));
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    inner.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(doubleClicked).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
    expect(wrapper.emitted("update")).toBeUndefined();
  } finally {
    window.dispatchEvent(pointer("pointercancel", 90, 30));
    wrapper.unmount();
  }
});

test.each([0.5, 1, 2])(
  "chart drag activates beyond 4 screen CSS pixels at scale %s",
  async (scale) => {
    const wrapper = fixture();
    const chart: SheetChartDrawing = {
      ...drawing,
      kind: "chart",
      chart: {
        type: "bar",
        range: null,
        title: "",
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: false,
        labels: false,
        stacked: false,
        showHidden: false,
      },
    };
    await wrapper.setProps({ drawings: [chart], scale });
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]').element as HTMLElement;
    const capture = vi.fn();
    Object.defineProperty(object, "setPointerCapture", { value: capture });
    const x = 90 * scale,
      y = 30 * scale;
    try {
      object.dispatchEvent(pointer("pointerdown", x, y));
      window.dispatchEvent(pointer("pointermove", x + 4, y));
      await nextTick();
      expect(capture).not.toHaveBeenCalled();
      expect(wrapper.emitted("update")).toBeUndefined();
      window.dispatchEvent(pointer("pointermove", x + 5, y));
      expect(capture).toHaveBeenCalledExactlyOnceWith(1);
      window.dispatchEvent(pointer("pointerup", x + 5, y));
      await nextTick();
      expect(wrapper.emitted("update")).toHaveLength(1);
      expect(wrapper.emitted("update")![0]![0]).toMatchObject({
        offsetX: 4 + 5 / scale,
        offsetY: 6,
      });
    } finally {
      window.dispatchEvent(pointer("pointercancel", x, y));
      wrapper.unmount();
    }
  },
);

test("chart resize handles keep immediate capture and sub-threshold size edits", async () => {
  const wrapper = fixture();
  const chart: SheetChartDrawing = {
    ...drawing,
    kind: "chart",
    chart: {
      type: "bar",
      range: null,
      title: "",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: false,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
  await wrapper.setProps({ drawings: [chart], selectedDrawingId: chart.id });
  const handle = wrapper.get('[data-image-resize="e"]').element as HTMLElement;
  const capture = vi.fn();
  Object.defineProperty(handle, "setPointerCapture", { value: capture });
  try {
    handle.dispatchEvent(pointer("pointerdown", 184, 51));
    expect(capture).toHaveBeenCalledExactlyOnceWith(1);
    window.dispatchEvent(pointer("pointermove", 185, 51));
    window.dispatchEvent(pointer("pointerup", 185, 51));
    await nextTick();
    expect(wrapper.emitted("update")).toHaveLength(1);
    expect(wrapper.emitted("update")![0]![0]).toMatchObject({ width: 101 });
  } finally {
    window.dispatchEvent(pointer("pointercancel", 185, 51));
    wrapper.unmount();
  }
});
