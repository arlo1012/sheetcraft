import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { SheetDrawing, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import FreeShapePointSelection from "../../../modules/sheet-drawings/components/FreeShapePointSelection.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  listFreeShapePoints,
  type FreeShapePointDescriptor,
} from "../../../modules/sheet-drawings/free-shape-point-layout";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { createAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";

type Point = { x: number; y: number };
type PointAction = "add" | "delete" | "smooth" | "straight" | "corner" | "close" | "open" | "exit";
const scale = 2;
const layout = createSheetViewportLayout({
  geometry: createSheetGeometry({ rowCount: 40, columnCount: 20, rowHeight: 24, columnWidth: 80 }),
  rows: createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 24 }),
  viewportSize: { width: 800, height: 600 },
  freeze: { rows: 1, columns: 1 },
  bodyScrollPosition: { x: 80, y: 48 },
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function freeDrawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  const { shapeGeometry: _preset, ...base } = createGraphicDrawing(
    "free",
    "shape",
    "Authored curve",
    { row: 5, column: 4 },
  );
  return {
    ...base,
    offsetX: 4,
    offsetY: 6,
    width: 180,
    height: 90,
    rotation: 37,
    shapeFlipX: true,
    shapeFlipY: true,
    text: "Preserved label",
    strokeWidth: 2,
    shapeLineEnds: { end: { kind: "triangle", width: "large", length: "small" } },
    shapePath: {
      tool: "curve",
      viewBox: { width: 180, height: 90 },
      commands: [
        ["M", 0, 30],
        ["L", 30, 0],
        ["Q", 60, 90, 90, 45],
        ["C", 120, 0, 150, 90, 180, 30],
      ],
    },
    ...overrides,
  };
}

function fixture(source = freeDrawing(), readOnly = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = reactive(getActiveSheet(workbook));
  const other = createGraphicDrawing("other", "shape", "Untouched", { row: 20, column: 8 });
  sheet.drawings = [source, other];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => source.anchor,
    flush: () => true,
    execute: (command) => executeWorkbookCommand(session, command),
    isBusy: () => false,
    name: () => "Shape",
  });
  let wrapper: VueWrapper;
  const updates: SheetDrawing[] = [];
  const applyUpdate = (drawing: SheetDrawing, expected: SheetDrawing): boolean => {
    updates.push(drawing);
    const accepted = actions.update(drawing, expected);
    // This is the actual owning grid contract: a Core command publishes both
    // a replacement drawing list and its history revision back to the layer.
    if (accepted)
      void wrapper.setProps({ drawings: sheet.drawings, revision: session.history.revision });
    return accepted;
  };
  wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      selectedDrawingId: source.id,
      sheet,
      revision: session.history.revision,
      layout,
      scale,
      readOnly,
      applyUpdate,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  const current = () => sheet.drawings![0] as SheetGraphicDrawing;
  const publish = () =>
    wrapper.setProps({ drawings: sheet.drawings, revision: session.history.revision });
  return { wrapper, workbook, sheet, session, current, publish, other, updates, applyUpdate };
}

function localWorld(drawing: SheetGraphicDrawing, point: Point): Point {
  return pictureFrameLocalToWorld(
    getFloatingImageSheetRect(drawing, layout)!,
    drawing.rotation,
    standardShapeFlipPoint(drawing, point),
  );
}
function world(drawing: SheetGraphicDrawing, descriptor: FreeShapePointDescriptor): Point {
  const point = listFreeShapePoints(drawing).find(
    (item) => item.commandIndex === descriptor.commandIndex && item.role === descriptor.role,
  );
  if (!point) throw new Error("Missing authored point");
  return localWorld(drawing, point.position);
}
function viewport(point: Point): Point {
  const translation = getPicturePaneTranslation("body", layout);
  return { x: point.x + translation.x, y: point.y + translation.y };
}
function mouse(type: string, point: Point, extra: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x * scale,
    clientY: point.y * scale,
    ...extra,
  });
}
function pointer(type: string, point: Point): PointerEvent {
  const event = mouse(type, point);
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event as PointerEvent;
}
async function enter(wrapper: VueWrapper, drawing: SheetGraphicDrawing, type = "dblclick") {
  // The midpoint of the first authored L is a real painted stroke hit. An open
  // contour's nominal fill and its rectangular bounds are not entry targets.
  const hit = viewport(localWorld(drawing, { x: 15, y: 15 }));
  wrapper
    .get('[data-sheet-drawing-id="free"] [data-standard-shape-path]')
    .element.dispatchEvent(mouse(type, hit, type === "contextmenu" ? { button: 2 } : {}));
  await nextTick();
}
function menuAction(action: PointAction): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(
    `[data-free-shape-point-action="${action}"]`,
  );
  if (!element) throw new Error(`Missing point action: ${action}`);
  return element;
}
async function openPointMenu(wrapper: VueWrapper, index = 1) {
  await wrapper.get(`[data-free-shape-vertex="${index}"]`).trigger("contextmenu", {
    clientX: 300,
    clientY: 200,
  });
  await nextTick();
}
function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
}
function expectActive(wrapper: VueWrapper, drawing: SheetGraphicDrawing, index: number) {
  expect(wrapper.get(`[data-free-shape-vertex="${index}"]`).attributes("aria-pressed")).toBe(
    "true",
  );
  const controls = listFreeShapePoints(drawing).filter(
    (point) => point.role !== "vertex" && point.vertexIndex === index,
  );
  expect(wrapper.findAll("[data-free-shape-control]")).toHaveLength(controls.length);
  expect(wrapper.findAll("[data-free-shape-control-connector]")).toHaveLength(controls.length);
  for (const point of controls) {
    expect(
      wrapper
        .find(
          `[data-free-shape-control="${point.role}"][data-free-shape-command-index="${point.commandIndex}"]`,
        )
        .exists(),
    ).toBe(true);
  }
}

describe("free path actual layer and Core owner", () => {
  test.each(["dblclick", "contextmenu"])(
    "%s enters points only on a real open-path stroke",
    async (type) => {
      const source = freeDrawing();
      const { wrapper, session } = fixture(source);
      await nextTick();
      const object = wrapper.get('[data-sheet-drawing-id="free"]');
      const miss = viewport(localWorld(source, { x: 90, y: 5 }));
      const event = mouse(type, miss, type === "contextmenu" ? { button: 2 } : {});
      object.element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented).toBe(false);
      expect(wrapper.find("[data-free-shape-point-selection]").exists()).toBe(false);
      await enter(wrapper, source, type);
      expect(wrapper.findAll("[data-free-shape-vertex]")).toHaveLength(4);
      expect(wrapper.find("[data-shape-resize], [data-shape-rotate]").exists()).toBe(false);
      expect(wrapper.emitted("edit")).toBeUndefined();
      expect(session.history.undoStack).toHaveLength(0);
      expectActive(wrapper, source, 0);
    },
  );

  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "scaled frozen/scrolled point drag preserves world nodes and Core history with flips %s/%s",
    async (flipX, flipY) => {
      const source = freeDrawing();
      if (!flipX) delete source.shapeFlipX;
      if (!flipY) delete source.shapeFlipY;
      const { wrapper, workbook, sheet, session, current, publish, other, updates } =
        fixture(source);
      const before = serializeWorkbook(workbook);
      await enter(wrapper, source);
      const moved = { commandIndex: 2, role: "vertex" as const };
      const start = viewport(world(source, moved));
      const grab = { x: start.x + 3, y: start.y - 2 };
      const target = { x: grab.x + 40, y: grab.y + 20 };
      wrapper
        .get('[data-free-shape-vertex="2"]')
        .element.dispatchEvent(pointer("pointerdown", grab));
      window.dispatchEvent(pointer("pointermove", target));
      await nextTick();
      expect(updates).toHaveLength(0);
      expect(session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(workbook)).toEqual(before);
      window.dispatchEvent(pointer("pointerup", target));
      await nextTick();
      expect(updates).toHaveLength(1);
      expect(wrapper.emitted("update")).toBeUndefined();
      expect(session.history.undoStack).toHaveLength(1);
      for (const point of listFreeShapePoints(source).filter((point) => point.role === "vertex")) {
        const expected = world(source, point);
        if (point.commandIndex === moved.commandIndex) {
          expected.x += 40;
          expected.y += 20;
        }
        expectPoint(world(current(), point), expected);
      }
      expect(current().rotation).toBe(source.rotation);
      expect(current().shapeFlipX).toBe(source.shapeFlipX);
      expect(current().shapeFlipY).toBe(source.shapeFlipY);
      expect(current().shapeLineEnds).toEqual(source.shapeLineEnds);
      expect(current().text).toBe(source.text);
      expect(sheet.drawings![1]).toEqual(other);
      expectActive(wrapper, current(), 2);
      const after = serializeWorkbook(workbook);
      expect(after.version).toBe(59);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      expect(undoWorkbookCommand(session)).toBe(true);
      await publish();
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(wrapper.find("[data-free-shape-point-selection]").exists()).toBe(true);
      expect(redoWorkbookCommand(session)).toBe(true);
      await publish();
      expect(serializeWorkbook(workbook)).toEqual(after);
      expectActive(wrapper, current(), 2);
    },
  );

  test("keyboard nudge publishes owner/revision and retains the interior node for repeated edits", async () => {
    const source = freeDrawing();
    const { wrapper, current, session, updates } = fixture(source);
    await enter(wrapper, source);
    const descriptor = { commandIndex: 2, role: "vertex" as const };
    const origin = world(source, descriptor);
    await wrapper
      .get('[data-free-shape-vertex="2"]')
      .trigger("keydown", { key: "ArrowRight", shiftKey: true });
    expectPoint(world(current(), descriptor), { x: origin.x + 10, y: origin.y });
    expectActive(wrapper, current(), 2);
    await wrapper.get('[data-free-shape-vertex="2"]').trigger("keydown", { key: "ArrowDown" });
    expectPoint(world(current(), descriptor), { x: origin.x + 10, y: origin.y + 1 });
    expectActive(wrapper, current(), 2);
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
    ]) {
      await wrapper
        .get('[data-free-shape-vertex="2"]')
        .trigger("keydown", { key: "ArrowRight", ...modifiers });
    }
    expect(updates).toHaveLength(2);
    expect(session.history.undoStack).toHaveLength(2);
  });

  test("Smooth applies to the chosen interior node and preserves its active controls through real undo/redo", async () => {
    const source = freeDrawing();
    const { wrapper, workbook, current, session, publish } = fixture(source);
    const before = serializeWorkbook(workbook);
    await enter(wrapper, source);
    await openPointMenu(wrapper, 1);
    menuAction("smooth").click();
    await nextTick();
    expect(current().shapePath!.pointTypes).toEqual({ 1: "smooth" });
    expectActive(wrapper, current(), 1);
    expect(wrapper.findAll("[data-free-shape-control]")).toHaveLength(2);
    expect(document.body.querySelector("[data-free-shape-point-menu]")).toBeNull();
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(workbook);
    expect(after.version).toBe(59);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    await publish();
    expect(serializeWorkbook(workbook)).toEqual(before);
    expectActive(wrapper, current(), 1);
    expect(redoWorkbookCommand(session)).toBe(true);
    await publish();
    expect(serializeWorkbook(workbook)).toEqual(after);
    expectActive(wrapper, current(), 1);
    await openPointMenu(wrapper, 1);
    expect(menuAction("smooth").getAttribute("aria-checked")).toBe("true");
  });

  test.each(["add", "delete", "close", "open"] as const)(
    "%s remaps the active vertex and keeps editing after owner publication",
    async (action) => {
      const base = freeDrawing();
      const source =
        action === "open"
          ? freeDrawing({
              shapePath: { ...base.shapePath!, commands: [...base.shapePath!.commands, ["Z"]] },
            })
          : base;
      if (action === "open") delete source.shapeLineEnds;
      const { wrapper, current, session } = fixture(source);
      await enter(wrapper, source);
      await openPointMenu(wrapper, 1);
      menuAction(action).click();
      await nextTick();
      expect(session.history.undoStack).toHaveLength(1);
      expectActive(wrapper, current(), action === "add" ? 2 : action === "open" ? 0 : 1);
      expect(wrapper.findAll("[data-free-shape-vertex]")).toHaveLength(
        action === "add" ? 5 : action === "delete" ? 3 : action === "open" ? 5 : 4,
      );
      if (action === "close") expect(current().shapeLineEnds).toBeUndefined();
    },
  );
});

describe("free path actual layer cancellation and stale ownership", () => {
  test.each([
    "revision",
    "replacement",
    "deletion",
    "readonly",
    "sheet",
    "layout",
    "scale",
    "escape",
    "blur",
    "pointercancel",
  ] as const)("%s cancels the point preview without a Core command", async (change) => {
    const source = freeDrawing();
    const { wrapper, workbook, session, sheet } = fixture(source);
    const before = serializeWorkbook(workbook);
    await enter(wrapper, source);
    const start = viewport(world(source, { commandIndex: 2, role: "vertex" }));
    const target = { x: start.x + 40, y: start.y + 20 };
    wrapper
      .get('[data-free-shape-vertex="2"]')
      .element.dispatchEvent(pointer("pointerdown", start));
    window.dispatchEvent(pointer("pointermove", target));
    await nextTick();
    if (change === "revision") await wrapper.setProps({ revision: 99 });
    else if (change === "replacement")
      await wrapper.setProps({ drawings: [{ ...source, name: "Replacement" }] });
    else if (change === "deletion") await wrapper.setProps({ drawings: [] });
    else if (change === "readonly") await wrapper.setProps({ readOnly: true });
    else if (change === "sheet") await wrapper.setProps({ sheet: { ...sheet } });
    else if (change === "layout") await wrapper.setProps({ layout: { ...layout } });
    else if (change === "scale") await wrapper.setProps({ scale: 1 });
    else if (change === "escape")
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    else if (change === "blur") window.dispatchEvent(new Event("blur"));
    else window.dispatchEvent(pointer("pointercancel", target));
    window.dispatchEvent(pointer("pointerup", target));
    await nextTick();
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("idle Escape exits point mode without deleting or editing the drawing", async () => {
    const source = freeDrawing();
    const { wrapper, session } = fixture(source);
    await enter(wrapper, source);
    await wrapper.get('[data-sheet-drawing-id="free"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.find("[data-free-shape-point-selection]").exists()).toBe(false);
    expect(wrapper.find("[data-shape-resize]").exists()).toBe(true);
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(wrapper.emitted("edit")).toBeUndefined();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test.each(["replacement", "deletion", "readonly", "exit"] as const)(
    "retained point callbacks cannot edit after %s",
    async (change) => {
      const source = freeDrawing();
      const { wrapper, session } = fixture(source);
      await enter(wrapper, source);
      const props = wrapper.getComponent(FreeShapePointSelection).vm.$.vnode.props!;
      const move = props.onMove as (point: FreeShapePointDescriptor, event: PointerEvent) => void;
      const nudge = props.onNudge as (point: FreeShapePointDescriptor, delta: Point) => void;
      const handler = props.handler as (action: PointAction, index: number) => boolean;
      if (change === "replacement")
        await wrapper.setProps({ drawings: [{ ...source, name: "Replacement" }] });
      else if (change === "deletion") await wrapper.setProps({ drawings: [] });
      else if (change === "readonly") await wrapper.setProps({ readOnly: true });
      else {
        expect(handler("exit", 1)).toBe(true);
        await nextTick();
      }
      const descriptor = { commandIndex: 2, role: "vertex" as const };
      const start = viewport(world(source, descriptor));
      const target = { x: start.x + 40, y: start.y + 20 };
      move(descriptor, pointer("pointerdown", start));
      window.dispatchEvent(pointer("pointermove", target));
      window.dispatchEvent(pointer("pointerup", target));
      nudge(descriptor, { x: 1, y: 0 });
      expect(handler("smooth", 1)).toBe(false);
      await nextTick();
      expect(wrapper.emitted("update")).toBeUndefined();
      expect(session.history.undoStack).toHaveLength(0);
    },
  );

  test("a retained menu action never retargets a replacement drawing or a newer opening", async () => {
    const source = freeDrawing();
    const { wrapper, session } = fixture(source);
    await enter(wrapper, source);
    await openPointMenu(wrapper, 1);
    const item = wrapper
      .findAllComponents(MenuItem)
      .find((component) => component.attributes("data-free-shape-point-action") === "smooth")!;
    const retained = item.vm.$.vnode.props!.onSelect as () => void;
    const replacement = { ...source, name: "Replacement" };
    await wrapper.setProps({ drawings: [replacement] });
    await openPointMenu(wrapper, 2);
    retained();
    await nextTick();
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(session.history.undoStack).toHaveLength(0);
    expect(menuAction("corner").getAttribute("aria-checked")).toBe("true");
    expectActive(wrapper, replacement, 2);
  });

  test.each(["false", "throw"] as const)(
    "an owner %s acknowledgement preserves path/history/menu and allows a real Core retry",
    async (outcome) => {
      const source = freeDrawing();
      const { wrapper, workbook, current, session, applyUpdate } = fixture(source);
      await enter(wrapper, source);
      await openPointMenu(wrapper, 1);
      const before = serializeWorkbook(workbook);
      const panel = document.body.querySelector("[data-free-shape-point-menu]");
      await wrapper.setProps({
        applyUpdate: () => {
          if (outcome === "throw") throw new Error("Owner rejected the command");
          return false;
        },
      });
      menuAction("smooth").click();
      await nextTick();
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
      expect(session.history.redoStack).toHaveLength(0);
      expect(document.body.querySelector("[data-free-shape-point-menu]")).toBe(panel);
      expect(menuAction("corner").getAttribute("aria-checked")).toBe("true");
      expect(panel!.querySelector('[role="status"]')).not.toBeNull();
      expect(wrapper.find("[data-free-shape-update-rejected]").exists()).toBe(true);
      expectActive(wrapper, current(), 1);
      await wrapper.setProps({ applyUpdate });
      menuAction("smooth").click();
      await nextTick();
      expect(session.history.undoStack).toHaveLength(1);
      expect(current().shapePath!.pointTypes).toEqual({ 1: "smooth" });
      expectActive(wrapper, current(), 1);
      expect(wrapper.find("[data-free-shape-update-rejected]").exists()).toBe(false);
    },
  );

  test("Add at the last logical closed-seam vertex splits the actual authored closing cubic", async () => {
    const source = freeDrawing();
    delete source.shapeLineEnds;
    source.shapePath = {
      tool: "curve",
      viewBox: { width: 180, height: 90 },
      commands: [["M", 0, 30], ["C", 10, 0, 60, 30, 90, 45], ["C", 160, 90, 30, 70, 0, 30], ["Z"]],
    };
    const { wrapper, current, session } = fixture(source);
    // Direct entry hits the actual initial tangent rather than the open fixture's straight edge.
    const p = viewport(localWorld(source, { x: 0, y: 30 }));
    wrapper.get('[data-sheet-drawing-id="free"]').element.dispatchEvent(mouse("dblclick", p));
    await nextTick();
    await openPointMenu(wrapper, 1);
    menuAction("add").click();
    await nextTick();
    expect(session.history.undoStack).toHaveLength(1);
    expect(current().shapePath!.commands.map((c) => c[0])).toEqual(["M", "C", "C", "C", "Z"]);
    expectActive(wrapper, current(), 2);
  });

  test("an Exit callback cancels an already started node gesture without a trailing history command", async () => {
    const source = freeDrawing();
    const { wrapper, session } = fixture(source);
    await enter(wrapper, source);
    const selector = wrapper.getComponent(FreeShapePointSelection),
      handler = selector.props("handler");
    const node = wrapper.get('[data-free-shape-vertex="1"]');
    const descriptor = listFreeShapePoints(source).find(
      (p) => p.role === "vertex" && p.commandIndex === 1,
    )!;
    const origin = viewport(world(source, descriptor));
    node.element.dispatchEvent(pointer("pointerdown", origin));
    expect(handler("exit", 1)).toBe(true);
    await nextTick();
    window.dispatchEvent(pointer("pointerup", { x: origin.x + 20, y: origin.y + 10 }));
    await nextTick();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("Core owner comparison rejects an update when replacement precedes the next layer publication", async () => {
    const source = freeDrawing();
    const { wrapper, workbook, sheet, session, updates, other } = fixture(source);
    await enter(wrapper, source);
    sheet.drawings = [{ ...source, name: "New Core owner", stroke: "#abcdef" }, other];
    const before = serializeWorkbook(workbook);
    await wrapper.get('[data-free-shape-vertex="2"]').trigger("keydown", { key: "ArrowRight" });
    expect(updates).toHaveLength(1);
    expect(session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(wrapper.find("[data-free-shape-update-rejected]").exists()).toBe(true);
  });

  test("read-only entry and revoked object permission block an otherwise valid point update before execution", async () => {
    const source = freeDrawing();
    const { wrapper, sheet, workbook, session, updates } = fixture(source, true);
    await enter(wrapper, source);
    expect(wrapper.find("[data-free-shape-point-selection]").exists()).toBe(false);
    await wrapper.setProps({ readOnly: false });
    await enter(wrapper, source);
    sheet.properties.protected = true;
    const before = serializeWorkbook(workbook);
    await wrapper.get('[data-free-shape-vertex="2"]').trigger("keydown", { key: "ArrowRight" });
    expect(updates).toHaveLength(0);
    expect(wrapper.find("[data-free-shape-point-selection]").exists()).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
