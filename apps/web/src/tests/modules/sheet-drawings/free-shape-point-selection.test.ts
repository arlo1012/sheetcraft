import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapeFreePath } from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import FreeShapePointSelection from "../../../modules/sheet-drawings/components/FreeShapePointSelection.vue";
import { listFreeShapePoints } from "../../../modules/sheet-drawings/free-shape-point-layout";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";
import MenuItem from "../../../shared/menu/MenuItem.vue";

import type { FreeShapePointAction as PointAction } from "../../../modules/sheet-drawings/free-shape-edit-actions";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function path(closed = false, coincident = false): ShapeFreePath {
  return {
    tool: "curve",
    viewBox: { width: 100, height: 80 },
    commands: [
      ["M", 10, 15],
      ["C", 20, 5, 30, 10, 45, 30],
      ["Q", 55, 60, 70, 40],
      ["C", 80, 20, 95, 70, 100, 80],
      ...(coincident ? [["C", 85, 65, 25, 35, 10, 15] as const] : []),
      ...(closed ? [["Z"] as const] : []),
    ],
  };
}
function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "free",
    kind: "shape",
    name: "Curve",
    anchor: { row: 5, column: 4 },
    offsetX: 4,
    offsetY: 6,
    width: 200,
    height: 160,
    rotation: 0,
    text: "Retain text",
    shape: "line",
    shapePath: path(),
    fill: "#dbeafe",
    stroke: "#2563eb",
    strokeWidth: 2,
    color: "#1e3a8a",
    fontSize: 20,
    bold: false,
    italic: false,
    ...overrides,
  };
}
const fragment: FloatingImageViewportFragment = {
  paneId: "body",
  rect: { x: 100, y: 80, width: 200, height: 160 },
  clippedRect: { x: 90, y: 60, width: 240, height: 210 },
};
const paneClip: Rect = { x: 0, y: 0, width: 800, height: 600 };
function fixture(
  options: {
    drawing?: SheetGraphicDrawing;
    activeVertex?: number;
    locale?: "en-US" | "zh-CN";
    disabled?: boolean;
    paneClip?: Rect;
    fragment?: FloatingImageViewportFragment;
  } = {},
) {
  const handler = vi.fn((_action: PointAction, _vertex: number) => true);
  const source = options.drawing ?? drawing();
  const wrapper = mount(FreeShapePointSelection, {
    attachTo: document.body,
    props: { drawing: source, fragment, paneClip, handler, ...options },
  });
  wrappers.push(wrapper);
  return { wrapper, handler, source };
}
function menu(): HTMLElement | null {
  return document.body.querySelector("[data-free-shape-point-menu]");
}
function action(name: PointAction): HTMLElement {
  const item = menu()?.querySelector<HTMLElement>(`[data-free-shape-point-action="${name}"]`);
  if (!item) throw new Error(`Missing point action: ${name}`);
  return item;
}
async function open(wrapper: VueWrapper, index = 1, keyboard = false): Promise<HTMLElement> {
  const vertex = wrapper.get(`[data-free-shape-vertex="${index}"]`);
  if (keyboard) await vertex.trigger("keydown", { key: "F10", shiftKey: true });
  else await vertex.trigger("contextmenu", { clientX: 180, clientY: 150 });
  await nextTick();
  return menu()!;
}
function key(element: HTMLElement, name: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  element.dispatchEvent(event);
  return event;
}
function staleAction(wrapper: VueWrapper, name: PointAction): () => void {
  const item = wrapper
    .findAllComponents(MenuItem)
    .find((item) => item.attributes("data-free-shape-point-action") === name);
  if (!item) throw new Error(`Missing component for point action: ${name}`);
  return item.vm.$.vnode.props!.onSelect as () => void;
}

describe("free path actual point selection", () => {
  test("edit overlay follows exact path with owner projection, rotation and flips without intercepting pointers", () => {
    const { wrapper: w } = fixture({ drawing: drawing({ rotation: 37, shapeFlipX: true }) });
    expect(w.findAll("[data-free-shape-edit-path]")).toHaveLength(1);
    expect(w.get("[data-free-shape-edit-path]").attributes("d")).toContain("C");
    expect(w.get("[data-free-shape-edit-path]").attributes("fill")).toBe("none");
    expect(
      w.get("[data-free-shape-edit-path]").element.parentElement!.getAttribute("transform"),
    ).toContain("rotate(37");
  });
  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "projects actual vertices and only the active vertex controls with flips %s/%s and rotation",
    (shapeFlipX, shapeFlipY) => {
      const source = drawing({
        rotation: 37,
        shapeFlipX: shapeFlipX || undefined,
        shapeFlipY: shapeFlipY || undefined,
      });
      const { wrapper } = fixture({ drawing: source, activeVertex: 1 });
      const points = listFreeShapePoints(source);
      expect(wrapper.findAll("[data-free-shape-vertex]")).toHaveLength(4);
      const controls = points.filter((point) => point.role !== "vertex" && point.vertexIndex === 1);
      expect(wrapper.findAll("[data-free-shape-control]")).toHaveLength(controls.length);
      expect(wrapper.findAll("[data-free-shape-control-connector]")).toHaveLength(controls.length);
      for (const point of points.filter(
        (point) => point.role === "vertex" || point.vertexIndex === 1,
      )) {
        const world = pictureFrameLocalToWorld(
          fragment.rect,
          source.rotation,
          standardShapeFlipPoint(source, point.position),
        );
        const selector =
          point.role === "vertex"
            ? `[data-free-shape-vertex="${point.vertexIndex}"]`
            : `[data-free-shape-control="${point.role}"][data-free-shape-command-index="${point.commandIndex}"]`;
        const button = wrapper.get(selector).element as HTMLButtonElement;
        expect(parseFloat(button.style.left)).toBeCloseTo(world.x - fragment.clippedRect.x, 5);
        expect(parseFloat(button.style.top)).toBeCloseTo(world.y - fragment.clippedRect.y, 5);
        expect(button.getAttribute("aria-label")).toContain(
          point.role === "vertex" ? "Edit point" : "Edit control",
        );
      }
      expect(
        wrapper
          .find("[data-shape-resize], [data-shape-rotate], .standard-shape-selection__outline")
          .exists(),
      ).toBe(false);
      expect(wrapper.get('[data-free-shape-vertex="1"]').attributes("aria-pressed")).toBe("true");
      expect(wrapper.get('[data-free-shape-vertex="0"]').attributes("aria-pressed")).toBe("false");
    },
  );
  test("half-open pane ownership exposes boundary points once and clips control connectors to the pane", () => {
    const source = drawing();
    const boundary = 100 + 45 * 2;
    const left = fixture({
      drawing: source,
      activeVertex: 1,
      paneClip: { x: 0, y: 0, width: boundary, height: 600 },
    }).wrapper;
    const right = fixture({
      drawing: source,
      activeVertex: 1,
      paneClip: { x: boundary, y: 0, width: 610, height: 600 },
    }).wrapper;
    expect(left.find('[data-free-shape-vertex="1"]').exists()).toBe(false);
    expect(right.find('[data-free-shape-vertex="1"]').exists()).toBe(true);
    expect(left.findAll("[data-free-shape-vertex]")).toHaveLength(1);
    expect(right.findAll("[data-free-shape-vertex]")).toHaveLength(3);
    const svg = right.get("svg").element as SVGElement;
    expect(svg.style.left).toBe(`${boundary - fragment.clippedRect.x}px`);
    expect(svg.style.width).toBe("610px");
    // Both panes draw the same canonical connector, with each SVG viewport clipping its piece.
    expect(left.findAll("line")).toHaveLength(2);
    expect(right.findAll("line")).toHaveLength(2);
    const line = right.findAll("line")[0]!;
    expect(Number(line.attributes("x1"))).toBe(0);
    expect(Number(line.attributes("x2"))).toBeLessThan(0);
  });
  test("closed coincident cubic seam is one vertex while open coincident endpoints stay independent", async () => {
    const { wrapper } = fixture({ drawing: drawing({ shapePath: path(true, true) }) });
    expect(wrapper.findAll("[data-free-shape-vertex]")).toHaveLength(4);
    expect(wrapper.find('[data-free-shape-vertex="4"]').exists()).toBe(false);
    expect(
      wrapper
        .find('[data-free-shape-control="control2"][data-free-shape-command-index="4"]')
        .exists(),
    ).toBe(true);
    await wrapper.setProps({ drawing: drawing({ shapePath: path(false, true) }), activeVertex: 4 });
    expect(wrapper.findAll("[data-free-shape-vertex]")).toHaveLength(5);
    const first = wrapper.get('[data-free-shape-vertex="0"]').element as HTMLElement;
    const last = wrapper.get('[data-free-shape-vertex="4"]').element as HTMLElement;
    expect(parseFloat(last.style.left) - parseFloat(first.style.left)).toBe(6);
    expect(first.getAttribute("data-free-shape-endpoint")).toBe("start");
    expect(last.getAttribute("data-free-shape-endpoint")).toBe("end");
    expect(first.getAttribute("aria-label")).toContain("start point");
    expect(last.getAttribute("aria-label")).toContain("end point");
    expect(wrapper.findAll("[data-free-shape-endpoint-guide]")).toHaveLength(2);
    expect(first.style.top).toBe(last.style.top);
    expect(last.getAttribute("aria-pressed")).toBe("true");
    expect(first.getAttribute("aria-pressed")).toBe("false");
  });
  test("pointer and keyboard controls emit canonical descriptors without mutating a model or finishing a tool", async () => {
    const { wrapper, source, handler } = fixture({ activeVertex: 1 });
    const before = structuredClone(source);
    const vertex = wrapper.get('[data-free-shape-vertex="1"]');
    const control = wrapper.get(
      '[data-free-shape-control="control2"][data-free-shape-command-index="1"]',
    );
    await vertex.trigger("pointerdown", { button: 0 });
    await control.trigger("pointerdown", { button: 0 });
    expect(wrapper.emitted("move")!.map((entry) => entry[0])).toEqual([
      listFreeShapePoints(source).find(
        (point) => point.role === "vertex" && point.commandIndex === 1,
      ),
      listFreeShapePoints(source).find(
        (point) => point.role === "control2" && point.commandIndex === 1,
      ),
    ]);
    expect(wrapper.emitted("selectVertex")).toEqual([[1], [1]]);
    expect(key(control.element as HTMLElement, "ArrowLeft").defaultPrevented).toBe(true);
    expect(
      key(vertex.element as HTMLElement, "ArrowDown", { shiftKey: true }).defaultPrevented,
    ).toBe(true);
    expect(wrapper.emitted("nudge")!.map((entry) => entry[1])).toEqual([
      { x: -1, y: 0 },
      { x: 0, y: 10 },
    ]);
    for (const extra of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
    ]) {
      expect(key(vertex.element as HTMLElement, "ArrowRight", extra).defaultPrevented).toBe(false);
    }
    await vertex.trigger("pointerdown", { button: 2 });
    await vertex.trigger("dblclick");
    expect(wrapper.emitted("move")).toHaveLength(2);
    expect(wrapper.emitted("nudge")).toHaveLength(2);
    expect(handler).not.toHaveBeenCalled();
    expect(source).toEqual(before);
    await wrapper.setProps({ disabled: true });
    key(vertex.element as HTMLElement, "ArrowRight");
    await vertex.trigger("pointerdown", { button: 0 });
    expect(wrapper.emitted("move")).toHaveLength(2);
    expect(wrapper.emitted("nudge")).toHaveLength(2);
  });
});

describe("free path shared point context menu", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s composes real point operations and checked sparse point types",
    async (locale) => {
      const source = drawing({ shapePath: { ...path(), pointTypes: { 1: "smooth" } } });
      const { wrapper, handler } = fixture({ drawing: source, locale });
      const before = structuredClone(source);
      const panel = await open(wrapper);
      expect(panel.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).toHaveLength(7);
      expect(panel.style.position).toBe("fixed");
      expect(panel.style.zIndex).toBe("");
      expect(action("smooth").getAttribute("role")).toBe("menuitemradio");
      expect(action("smooth").getAttribute("aria-checked")).toBe("true");
      expect(action("straight").getAttribute("aria-checked")).toBe("false");
      expect(action("corner").getAttribute("aria-checked")).toBe("false");
      expect(action("add").textContent).toContain(locale === "en-US" ? "Add Point" : "添加顶点");
      expect(action("close").textContent).toContain(locale === "en-US" ? "Close Path" : "闭合路径");
      expect(document.activeElement).toBe(action("add"));
      action("straight").click();
      await nextTick();
      expect(handler).toHaveBeenCalledExactlyOnceWith("straight", 1);
      expect(menu()).toBeNull();
      expect(source).toEqual(before);
      await open(wrapper, 0);
      expect(action("corner").getAttribute("aria-checked")).toBe("true");
    },
  );
  test("closed paths offer Open Path and each successful operation reports exactly the selected vertex", async () => {
    const { wrapper, handler } = fixture({ drawing: drawing({ shapePath: path(true) }) });
    for (const name of ["add", "delete", "smooth", "straight", "corner", "open", "exit"] as const) {
      await open(wrapper, 2);
      expect(menu()!.querySelector('[data-free-shape-point-action="close"]')).toBeNull();
      action(name).click();
      await nextTick();
      expect(handler).toHaveBeenLastCalledWith(name, 2);
      expect(menu()).toBeNull();
    }
    expect(handler).toHaveBeenCalledTimes(7);
  });
  test.each([false, "throw"] as const)(
    "%s retains the same menu, checked value and localized retry feedback",
    async (outcome) => {
      const { wrapper, handler, source } = fixture({ locale: "zh-CN" });
      const before = structuredClone(source);
      if (outcome === "throw")
        handler.mockImplementation(() => {
          throw new Error("Rejected");
        });
      else handler.mockReturnValue(false);
      const panel = await open(wrapper);
      action("smooth").click();
      await nextTick();
      expect(menu()).toBe(panel);
      expect(action("corner").getAttribute("aria-checked")).toBe("true");
      expect(menu()!.querySelector('[role="status"]')!.textContent).toContain(
        "已保留当前顶点和路径",
      );
      expect(source).toEqual(before);
      handler.mockReturnValue(true);
      action("smooth").click();
      await nextTick();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(menu()).toBeNull();
    },
  );
  test("keyboard context menus use the focused button and shared Escape focus restoration", async () => {
    const { wrapper } = fixture();
    const vertex = wrapper.get('[data-free-shape-vertex="1"]').element as HTMLElement;
    vertex.focus();
    await open(wrapper, 1, true);
    expect(document.activeElement).toBe(action("add"));
    expect(key(action("add"), "Escape").defaultPrevented).toBe(true);
    await nextTick();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(vertex);
    key(vertex, "ContextMenu");
    await nextTick();
    expect(menu()).not.toBeNull();
    action("add").click();
    await nextTick();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(vertex);
  });
  test("outside pointer and focus dismiss through the shared menu contract", async () => {
    const { wrapper } = fixture();
    await open(wrapper);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menu()).toBeNull();
    await open(wrapper, 1, true);
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    await nextTick();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(other);
  });
  test.each(["drawing", "handler", "disabled", "path", "unmount"] as const)(
    "%s invalidates retained callbacks without retargeting another owner",
    async (change) => {
      const { wrapper, handler, source } = fixture({ drawing: reactive(drawing()) });
      await open(wrapper);
      const retained = staleAction(wrapper, "add");
      const nextHandler = vi.fn((_action: PointAction, _vertex: number) => true);
      if (change === "drawing") await wrapper.setProps({ drawing: { ...source, id: "other" } });
      else if (change === "handler") await wrapper.setProps({ handler: nextHandler });
      else if (change === "disabled") await wrapper.setProps({ disabled: true });
      else if (change === "path") {
        const owner = wrapper.props("drawing");
        owner.shapePath = path(true);
        await nextTick();
      } else wrapper.unmount();
      expect(menu()).toBeNull();
      if (change !== "unmount") {
        if (change === "disabled") await wrapper.setProps({ disabled: false });
        await open(wrapper, 2);
      }
      retained();
      expect(handler).not.toHaveBeenCalled();
      expect(nextHandler).not.toHaveBeenCalled();
      if (change !== "unmount") {
        action("add").click();
        await nextTick();
        expect(change === "handler" ? nextHandler : handler).toHaveBeenCalledExactlyOnceWith(
          "add",
          2,
        );
      }
    },
  );
  test("dismissed and superseded opening callbacks cannot act on a newer vertex", async () => {
    const { wrapper, handler } = fixture();
    await open(wrapper, 1);
    const first = staleAction(wrapper, "delete");
    await open(wrapper, 2);
    const second = staleAction(wrapper, "add");
    first();
    expect(handler).not.toHaveBeenCalled();
    key(action("add"), "Escape");
    await nextTick();
    await open(wrapper, 0);
    second();
    expect(handler).not.toHaveBeenCalled();
    action("add").click();
    await nextTick();
    expect(handler).toHaveBeenCalledExactlyOnceWith("add", 0);
  });
});

describe("free path selected segment menu", () => {
  function segmentItem(name: string): HTMLElement {
    const item = menu()?.querySelector<HTMLElement>(`[data-free-shape-point-action="${name}"]`);
    if (!item) throw new Error(`Missing segment action: ${name}`);
    return item;
  }
  async function openSegment(wrapper: VueWrapper, index: number, keyboard = false) {
    const segment = wrapper.get(`[data-free-shape-segment="${index}"]`);
    if (keyboard) await segment.trigger("keydown", { key: "ContextMenu" });
    else await segment.trigger("contextmenu", { clientX: 175, clientY: 150 });
    await nextTick();
    return menu()!;
  }
  test.each(["en-US", "zh-CN"] as const)(
    "%s exposes the exact selected cubic and closing segment",
    async (locale) => {
      const { wrapper, handler } = fixture({ drawing: drawing({ shapePath: path(true) }), locale });
      expect(wrapper.findAll("[data-free-shape-segment]")).toHaveLength(4);
      const panel = await openSegment(wrapper, 1);
      expect(panel.querySelector('[data-free-shape-point-action="smooth"]')).toBeNull();
      expect(segmentItem("curved-segment").getAttribute("aria-checked")).toBe("true");
      expect(segmentItem("straight-segment").getAttribute("aria-checked")).toBe("false");
      expect(segmentItem("straight-segment").textContent).toContain(
        locale === "en-US" ? "Straight Segment" : "直线段",
      );
      expect(segmentItem("delete-segment").getAttribute("aria-disabled")).toBe("false");
      segmentItem("straight-segment").click();
      await nextTick();
      expect(handler).toHaveBeenCalledExactlyOnceWith("straight-segment", 1);
      expect(menu()).toBeNull();
      await openSegment(wrapper, 4, true);
      expect(segmentItem("straight-segment").getAttribute("aria-checked")).toBe("true");
      segmentItem("curved-segment").click();
      await nextTick();
      expect(handler).toHaveBeenLastCalledWith("curved-segment", 4);
    },
  );
  test("closed Delete Segment uses the captured edge once; rejection preserves retry and open paths stay disabled", async () => {
    const { wrapper, handler } = fixture({ drawing: drawing({ shapePath: path(true) }) });
    handler.mockReturnValue(false);
    const panel = await openSegment(wrapper, 4);
    const stale = staleAction(wrapper, "delete-segment");
    segmentItem("delete-segment").click();
    await nextTick();
    expect(handler).toHaveBeenCalledExactlyOnceWith("delete-segment", 4);
    expect(menu()).toBe(panel);
    expect(panel.querySelector('[role="status"]')).not.toBeNull();
    await wrapper.setProps({ drawing: drawing() });
    stale();
    expect(handler).toHaveBeenCalledTimes(1);
    await openSegment(wrapper, 1);
    expect(segmentItem("delete-segment").getAttribute("aria-disabled")).toBe("true");
    segmentItem("delete-segment").click();
    await nextTick();
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test("segment failure keeps checked geometry and feedback; Escape dismisses without edits", async () => {
    const { wrapper, handler, source } = fixture();
    handler.mockReturnValue(false);
    const before = structuredClone(source);
    const panel = await openSegment(wrapper, 2);
    segmentItem("straight-segment").click();
    await nextTick();
    expect(menu()).toBe(panel);
    expect(segmentItem("curved-segment").getAttribute("aria-checked")).toBe("true");
    expect(panel.querySelector('[role="status"]')).not.toBeNull();
    expect(source).toEqual(before);
    key(segmentItem("straight-segment"), "Escape");
    await nextTick();
    expect(menu()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test.each([
    "drawing",
    "handler",
    "path",
    "disabled",
    "fragment",
    "clip",
    "opening",
    "unmount",
  ] as const)("%s invalidates the retained selected segment callback", async (change) => {
    const { wrapper, handler, source } = fixture();
    await openSegment(wrapper, 1);
    const item = wrapper
      .findAllComponents(MenuItem)
      .find((entry) => entry.attributes("data-free-shape-point-action") === "straight-segment")!;
    const old = item.vm.$.vnode.props!.onSelect as () => void;
    const replacement = vi.fn(() => true);
    if (change === "drawing") await wrapper.setProps({ drawing: { ...source, id: "replacement" } });
    else if (change === "handler") await wrapper.setProps({ handler: replacement });
    else if (change === "path")
      await wrapper.setProps({ drawing: { ...source, shapePath: path(true) } });
    else if (change === "disabled") await wrapper.setProps({ disabled: true });
    else if (change === "fragment")
      await wrapper.setProps({ fragment: { ...fragment, rect: { ...fragment.rect, x: 110 } } });
    else if (change === "clip") await wrapper.setProps({ paneClip: { ...paneClip, x: 10 } });
    else if (change === "opening") await openSegment(wrapper, 2);
    else wrapper.unmount();
    old();
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });
});

test("explicit curved closing seam selects the canonical start vertex while editing its segment command", async () => {
  const { wrapper, handler } = fixture({
    drawing: drawing({ shapePath: path(true, true) }),
    activeVertex: 2,
  });
  await wrapper
    .get('[data-free-shape-segment="4"]')
    .trigger("contextmenu", { clientX: 120, clientY: 110 });
  await nextTick();
  expect(wrapper.emitted("selectVertex")!.at(-1)).toEqual([0]);
  document.body
    .querySelector<HTMLElement>('[data-free-shape-point-action="straight-segment"]')!
    .click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith("straight-segment", 4);
});

test("keyboard segment menu Escape restores focus to its exact SVG segment", async () => {
  const { wrapper, handler } = fixture();
  const segment = wrapper.get('[data-free-shape-segment="1"]').element as SVGElement;
  segment.focus();
  await wrapper.get('[data-free-shape-segment="1"]').trigger("keydown", { key: "ContextMenu" });
  await nextTick();
  const first = document.body.querySelector<HTMLElement>('[data-free-shape-point-action="add"]')!;
  expect(document.activeElement).toBe(first);
  key(first, "Escape");
  await nextTick();
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(segment);
  expect(handler).not.toHaveBeenCalled();
});

test("fully clipped segments do not leave invisible keyboard targets while crossing curves remain addressable", () => {
  const hidden = fixture({ paneClip: { x: 600, y: 500, width: 50, height: 50 } });
  expect(hidden.wrapper.findAll("[data-free-shape-segment]")).toHaveLength(0);
  const crossing = fixture({ paneClip: { x: 180, y: 130, width: 30, height: 25 } });
  expect(crossing.wrapper.find('[data-free-shape-segment="2"]').exists()).toBe(true);
});
