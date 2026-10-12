import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetFreeShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetFreeShapeCreationLayer.vue";
import {
  createFreeShapeDrawingFromPoints,
  MAX_FREE_SHAPE_POINTS,
} from "../../../modules/sheet-drawings/free-shape-creation";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import type { ShapeCreationRequest } from "../../../modules/sheet-drawings/useShapeCreation";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../modules/sheet-drawings/free-shape-creation", async (original) => {
  const module =
    await original<typeof import("../../../modules/sheet-drawings/free-shape-creation")>();
  return {
    ...module,
    createFreeShapeDrawingFromPoints: vi.fn(module.createFreeShapeDrawingFromPoints),
  };
});
function layout(frozen = false) {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 60,
      columnCount: 30,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 60, defaultRowHeight: 24 }),
    viewportSize: { width: 600, height: 400 },
    ...(frozen ? { freeze: { rows: 2, columns: 2 }, bodyScrollPosition: { x: 40, y: 24 } } : {}),
  });
}
const cleanup: Array<() => void> = [];
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});
function fixture(tool: "curve" | "freeform" | "scribble" = "freeform", frozen = false) {
  const workbook = createWorkbook({ id: "free-test", sheetId: "free-sheet" });
  const sheet = getActiveSheet(workbook);
  const choice = SHAPE_GALLERY.flatMap((group) => group.items).find(
    (item) => item.kind === "drawingTool" && item.tool === tool,
  )!;
  const request: ShapeCreationRequest = {
    workbook,
    sheet,
    requestId: 1,
    revision: 1,
    choice,
    continuous: false,
    base: createGraphicDrawing("free-new", "shape", tool, { row: 0, column: 0 }),
  };
  const commit = vi.fn((_request: ShapeCreationRequest, _drawing: SheetGraphicDrawing) => true);
  const cancel = vi.fn();
  const viewport = layout(frozen);
  const w = mount(SheetFreeShapeCreationLayer, {
    attachTo: document.body,
    props: { request, layout: viewport, scale: 1, revision: 1, readOnly: false, commit, cancel },
    global: { plugins: [createAppI18n("en-US")] },
  });
  cleanup.push(() => w.unmount());
  return { w, request, commit, cancel, viewport, el: w.element as HTMLElement };
}
function pointer(type: string, x: number, y: number, detail = 1, pointerId = 7) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    detail,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}
function click(el: HTMLElement, x: number, y: number, detail = 1) {
  el.dispatchEvent(pointer("pointerdown", x, y, detail));
  window.dispatchEvent(pointer("pointerup", x, y, detail));
}
function doubleClick(el: HTMLElement, x: number, y: number) {
  click(el, x, y);
  click(el, x + 2, y + 1, 2);
  el.dispatchEvent(
    new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      detail: 2,
      clientX: x + 2,
      clientY: y + 1,
    }),
  );
}
function finalPoints() {
  return vi.mocked(createFreeShapeDrawingFromPoints).mock.calls.at(-1)![0].points;
}
function key(target: EventTarget, name: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}
describe("free-drawing creation sessions", () => {
  test("curve keeps click nodes separate from drag and hover, and deduplicates the browser double-click endpoint", async () => {
    const f = fixture("curve");
    expect(document.activeElement).toBe(f.el);
    f.el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 80, 90));
    await nextTick();
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(true);
    expect(f.el.dataset.freeShapePoints).toBe("1");
    window.dispatchEvent(pointer("pointerup", 80, 90));
    click(f.el, 100, 110);
    f.el.dispatchEvent(pointer("pointermove", 550, 300));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    doubleClick(f.el, 200, 150);
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(finalPoints()).toEqual([
      { x: 50, y: 50 },
      { x: 100, y: 110 },
      { x: 200, y: 150 },
    ]);
    expect(f.commit.mock.calls[0]![1].shapePath?.commands.map((command) => command[0])).toEqual([
      "M",
      "C",
      "C",
    ]);
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
  });
  test("freeform supports click, click, dense drag, another click, then double-click completion", async () => {
    const f = fixture();
    click(f.el, 50, 50);
    click(f.el, 100, 80);
    f.el.dispatchEvent(pointer("pointerdown", 150, 100));
    for (let i = 1; i <= 20; i++)
      window.dispatchEvent(pointer("pointermove", 150 + i * 5, 100 + i * 2));
    window.dispatchEvent(pointer("pointerup", 255, 145));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(Number(f.el.dataset.freeShapePoints)).toBeGreaterThan(20);
    click(f.el, 300, 180);
    doubleClick(f.el, 350, 200);
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    const nodes = finalPoints();
    expect(nodes.slice(0, 3)).toEqual([
      { x: 50, y: 50 },
      { x: 100, y: 80 },
      { x: 150, y: 100 },
    ]);
    expect(nodes).toContainEqual({ x: 255, y: 145 });
    expect(nodes.slice(-2)).toEqual([
      { x: 300, y: 180 },
      { x: 350, y: 200 },
    ]);
    expect(
      f.commit.mock.calls[0]![1].shapePath?.commands.every(
        (command) => command[0] === "M" || command[0] === "L",
      ),
    ).toBe(true);
  });
  test("scribble samples coalesced pointer motion, ignores other pointers, and commits once on release", async () => {
    const f = fixture("scribble");
    f.el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 500, 300, 1, 8));
    const motion = pointer("pointermove", 90, 75);
    Object.defineProperty(motion, "getCoalescedEvents", {
      value: () => [pointer("pointermove", 65, 60), pointer("pointermove", 80, 68)],
    });
    window.dispatchEvent(motion);
    expect(f.commit).not.toHaveBeenCalled();
    window.dispatchEvent(pointer("pointerup", 105, 90));
    window.dispatchEvent(pointer("pointerup", 105, 90));
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(finalPoints()).toEqual([
      { x: 50, y: 50 },
      { x: 65, y: 60 },
      { x: 80, y: 68 },
      { x: 90, y: 75 },
      { x: 105, y: 90 },
    ]);
  });
  test.each(["button", "first node"])(
    "%s closes one path and excludes the rubber-band cursor",
    async (method) => {
      const f = fixture();
      click(f.el, 50, 50);
      click(f.el, 150, 60);
      click(f.el, 100, 150);
      f.el.dispatchEvent(pointer("pointermove", 400, 300));
      await nextTick();
      if (method === "button") await f.w.get("[data-free-shape-close]").trigger("click");
      else f.el.dispatchEvent(pointer("pointerdown", 53, 52));
      await nextTick();
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(finalPoints()).toEqual([
        { x: 50, y: 50 },
        { x: 150, y: 60 },
        { x: 100, y: 150 },
      ]);
      expect(f.commit.mock.calls[0]![1].shapePath?.commands.at(-1)).toEqual(["Z"]);
    },
  );
  test("explicit Finish and own-root Enter complete open paths; Backspace only edits the draft", async () => {
    const f = fixture();
    click(f.el, 50, 50);
    click(f.el, 100, 100);
    click(f.el, 200, 150);
    expect(key(f.el, "Backspace").defaultPrevented).toBe(true);
    await nextTick();
    expect(f.el.dataset.freeShapePoints).toBe("2");
    expect(f.commit).not.toHaveBeenCalled();
    await f.w.get("[data-free-shape-finish]").trigger("click");
    expect(f.commit).toHaveBeenCalledTimes(1);
    click(f.el, 60, 60);
    click(f.el, 130, 130);
    key(f.el, "Enter");
    expect(f.commit).toHaveBeenCalledTimes(2);
  });
  test.each([false, "throw"] as const)(
    "rejection %s preserves the exact final preview and retries the same drawing",
    async (result) => {
      const f = fixture();
      if (result === "throw")
        f.commit.mockImplementation(() => {
          throw new Error("rejected");
        });
      else f.commit.mockReturnValue(false);
      click(f.el, 50, 50);
      click(f.el, 150, 100);
      await nextTick();
      await f.w.get("[data-free-shape-finish]").trigger("click");
      const failed = f.commit.mock.calls[0]![1];
      expect(f.w.get('[role="status"]').text()).toContain("preserved");
      const pathBefore = f.w.get("[data-standard-shape-content]").html();
      f.el.dispatchEvent(pointer("pointermove", 500, 300));
      click(f.el, 400, 250);
      await nextTick();
      expect(f.w.get("[data-standard-shape-content]").html()).toBe(pathBefore);
      f.commit.mockReturnValue(true);
      await f.w.get("[data-free-shape-retry]").trigger("click");
      expect(f.commit).toHaveBeenCalledTimes(2);
      expect(f.commit.mock.calls[1]![1]).toBe(failed);
      expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
    },
  );
  test("continuous success reinitializes for a fresh request identity", async () => {
    const f = fixture();
    await f.w.setProps({ request: { ...f.request, continuous: true } });
    click(f.el, 50, 50);
    click(f.el, 150, 100);
    await nextTick();
    await f.w.get("[data-free-shape-finish]").trigger("click");
    const next = {
      ...f.request,
      requestId: 2,
      continuous: true,
      base: { ...f.request.base, id: "free-second" },
    };
    await f.w.setProps({ request: next });
    click(f.el, 70, 80);
    click(f.el, 170, 180);
    await nextTick();
    await f.w.get("[data-free-shape-finish]").trigger("click");
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.commit.mock.calls[1]![0]).toBe(f.w.props("request"));
    expect(f.commit.mock.calls[1]![1].id).toBe("free-second");
    expect(finalPoints()).toEqual([
      { x: 70, y: 80 },
      { x: 170, y: 180 },
    ]);
  });
  test("the first point's frozen pane remains authoritative through later clicks", async () => {
    const f = fixture("freeform", true);
    const translation = getPicturePaneTranslation("body", f.viewport);
    click(f.el, 250, 150);
    click(f.el, 100, 30);
    await nextTick();
    await f.w.get("[data-free-shape-finish]").trigger("click");
    expect(finalPoints()).toEqual([
      { x: 250 - translation.x, y: 150 - translation.y },
      { x: 100 - translation.x, y: 30 - translation.y },
    ]);
  });
  test.each([
    "request",
    "revision",
    "readOnly",
    "layout",
    "scale",
    "blur",
    "Escape",
    "unmount",
  ] as const)("%s invalidates the whole multipoint lease without committing", async (change) => {
    const f = fixture();
    click(f.el, 50, 50);
    click(f.el, 150, 100);
    f.el.dispatchEvent(pointer("pointerdown", 180, 120));
    window.dispatchEvent(pointer("pointermove", 200, 150));
    if (change === "request") await f.w.setProps({ request: { ...f.request, requestId: 2 } });
    if (change === "revision") await f.w.setProps({ revision: 2 });
    if (change === "readOnly") await f.w.setProps({ readOnly: true });
    if (change === "layout") await f.w.setProps({ layout: layout() });
    if (change === "scale") await f.w.setProps({ scale: 2 });
    if (change === "blur") window.dispatchEvent(new Event("blur"));
    if (change === "Escape") key(f.el, "Escape");
    if (change === "unmount") {
      f.w.unmount();
      cleanup.pop();
    }
    window.dispatchEvent(pointer("pointerup", 200, 150));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    if (change !== "unmount")
      expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
    if (change === "Escape" || change === "blur")
      expect(f.cancel).toHaveBeenCalledExactlyOnceWith(f.request);
  });
  test("IME, forms, dialogs, menus, and unrelated shortcuts remain untouched during capture", async () => {
    const f = fixture();
    f.el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 100, 100));
    expect(key(f.el, "Escape", { isComposing: true }).defaultPrevented).toBe(false);
    for (const kind of ["form", "dialog", "menu", "input"] as const) {
      const target = document.createElement(
        kind === "input" ? "input" : kind === "form" ? "form" : "div",
      );
      if (kind === "dialog" || kind === "menu") target.setAttribute("role", kind);
      document.body.append(target);
      expect(key(target, "Escape").defaultPrevented).toBe(false);
      expect(key(target, "Enter").defaultPrevented).toBe(false);
      expect(key(target, "Backspace").defaultPrevented).toBe(false);
      target.remove();
    }
    expect(key(f.el, "z", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    window.dispatchEvent(pointer("pointerup", 100, 100));
    await nextTick();
    expect(f.el.dataset.freeShapePoints).toBe("2");
  });
  test.each(["raw", "stored"] as const)(
    "%s budget failure never inserts a truncated path and can restart",
    async (budget) => {
      const f = fixture("scribble");
      f.el.dispatchEvent(pointer("pointerdown", 50, 50));
      const event = pointer("pointermove", 400, 100);
      const count = budget === "raw" ? 4097 : MAX_FREE_SHAPE_POINTS + 1;
      Object.defineProperty(event, "getCoalescedEvents", {
        value: () =>
          Array.from({ length: count }, (_, index) =>
            pointer("pointermove", 80 + (index % 400), 100 + (index % 2) * 50),
          ),
      });
      window.dispatchEvent(event);
      window.dispatchEvent(pointer("pointerup", 400, 100));
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.w.get('[role="status"]').text()).toContain("No truncated path");
      const restart = f.w.findAll("button").find((button) => button.text() === "Start again")!;
      await restart.trigger("click");
      f.el.dispatchEvent(pointer("pointerdown", 60, 60));
      window.dispatchEvent(pointer("pointermove", 120, 100));
      window.dispatchEvent(pointer("pointerup", 160, 150));
      expect(f.commit).toHaveBeenCalledTimes(1);
    },
  );
  test.each(["curve", "freeform", "scribble"] as const)(
    "%s duplicates and extremely short drafts create no history",
    async (mode) => {
      const f = fixture(mode);
      click(f.el, 50, 50);
      click(f.el, 50, 50);
      click(f.el, 50.2, 50.1);
      if (mode !== "scribble") key(f.el, "Enter");
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
    },
  );
  test("controls, non-free choices, and read-only sheets cannot start a draft", async () => {
    const f = fixture();
    f.w.get("[data-shape-creation-controls]").element.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointerup", 200, 100));
    expect(f.el.dataset.freeShapePoints).toBe("0");
    await f.w.setProps({ readOnly: true });
    click(f.el, 50, 50);
    expect(f.el.dataset.freeShapePoints).toBe("0");
    const choice = SHAPE_GALLERY.flatMap((group) => group.items).find(
      (item) => item.kind === "preset",
    )!;
    await f.w.setProps({ readOnly: false, request: { ...f.request, choice } });
    click(f.el, 50, 50);
    expect(f.el.dataset.freeShapePoints).toBe("0");
    expect(f.commit).not.toHaveBeenCalled();
  });
});
