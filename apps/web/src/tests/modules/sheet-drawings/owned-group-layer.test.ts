import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { framedShape } from "./framed-shape-fixture";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
function pointer(type: string, x: number, y: number, ctrlKey = false) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    ctrlKey,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event;
}
function shape(id: string, x: number, y: number, width = 120, height = 80) {
  const s = framedShape();
  s.id = id;
  s.name = id;
  s.rotation = 0;
  s.text = "";
  s.shapeGeometry = { preset: "rect" };
  s.shapeFrame.anchor = { mode: "fixed", x, y, size: { width, height } };
  return s;
}
function fixture(grouped = false, rejected = false, nested = false) {
  const workbook = reactive(createWorkbook({ id: "groups-ui", sheetId: "s" })),
    sheet = getActiveSheet(workbook),
    metrics = reactive(createPictureSheetMetrics(sheet));
  sheet.drawings = [shape("a", 80, 40), shape("b", 260, 60, 90, 60)];
  if (grouped)
    sheet.drawings = groupShapeRoots(
      sheet.drawings,
      ["a", "b"],
      { id: "g", name: "Group" },
      metrics,
    );
  if (nested)
    sheet.drawings = groupShapeRoots(
      [...sheet.drawings!, shape("c", 450, 140)],
      ["g", "c"],
      { id: "outer", name: "Outer" },
      metrics,
    );
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let revision = 0;
  let wrapper: VueWrapper;
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRevision: () => revision,
    getGeneration: () => 0,
    getMetrics: () => metrics,
    getAddress: () => ({ row: 0, column: 0 }),
    flush: () => true,
    isBusy: () => false,
    name: (kind) => kind,
    execute: (command) => (rejected ? false : executeWorkbookCommand(session, command)),
  });
  const sync = async () => {
    revision++;
    await wrapper.setProps({ drawings: [...(sheet.drawings ?? [])], revision });
    await nextTick();
  };
  const apply = vi.fn(
    (
      next: Parameters<typeof actions.replaceCollection>[0],
      expected: Parameters<typeof actions.replaceCollection>[1],
      m = metrics,
    ) => {
      const accepted = actions.replaceCollection(next, expected, m);
      if (accepted) void sync();
      return accepted;
    },
  );
  const applyOne = vi.fn(
    (
      next: Parameters<typeof actions.update>[0],
      expected: Parameters<typeof actions.update>[1],
    ) => {
      const accepted = actions.update(next, expected);
      if (accepted) void sync();
      return accepted;
    },
  );
  wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      sheet,
      metrics,
      revision,
      scale: 1,
      readOnly: false,
      applyCollection: apply,
      applyUpdate: applyOne,
      layout: createSheetViewportLayout({
        geometry: createSheetGeometry({
          rowCount: 30,
          columnCount: 12,
          rowHeight: 24,
          columnWidth: 80,
        }),
        rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 }),
        viewportSize: { width: 700, height: 500 },
      }),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const click = async (id: string, x: number, y: number, ctrl = false) => {
    wrapper
      .get(`[data-sheet-drawing-id="${id}"]`)
      .element.dispatchEvent(pointer("pointerdown", x, y, ctrl));
    window.dispatchEvent(pointer("pointerup", x, y, ctrl));
    await nextTick();
  };
  return { wrapper, workbook, sheet, metrics, session, apply, applyOne, click, sync };
}
function action(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  expect(el).not.toBeNull();
  el!.click();
}

test("real multi-select toolbar groups atomically; Undo/Redo and snapshot retain owned geometry", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(2);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="group"]');
  await nextTick();
  expect(f.sheet.drawings).toHaveLength(1);
  const root = f.sheet.drawings![0];
  expect(isShapeGroupDrawing(root)).toBe(true);
  expect(f.wrapper.findAll("[data-shape-group-id]")).toHaveLength(1);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(0);
  const grouped = serializeWorkbook(f.workbook);
  expect(grouped.version).toBe(61);
  expect(serializeWorkbook(deserializeWorkbook(grouped))).toEqual(grouped);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(grouped);
});

test("multi body drag moves every root; side resize applies same factor about each own edge", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(pointer("pointerdown", 130, 80));
  window.dispatchEvent(pointer("pointermove", 150, 95));
  window.dispatchEvent(pointer("pointerup", 150, 95));
  await nextTick();
  let a = resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect,
    b = resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect;
  expect(a.x).toBe(100);
  expect(a.y).toBe(55);
  expect(b.x).toBe(280);
  expect(b.y).toBe(75);
  f.wrapper
    .get('[data-sheet-drawing-id="a"] [data-shape-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 220, 95));
  window.dispatchEvent(pointer("pointerup", 250, 95));
  await nextTick();
  a = resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect;
  b = resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect;
  expect(a.width).toBe(150);
  expect(b.width).toBe(112.5);
  expect(a.height).toBe(80);
  expect(b.height).toBe(60);
  expect(a.x).toBe(100);
  expect(b.x).toBe(280);
});

test("group body drag transforms container; second stationary click selects member then Delete collapses owner", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  expect(f.wrapper.find('[data-shape-group-id="g"]')).toBeDefined();
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(pointer("pointerdown", 130, 80));
  window.dispatchEvent(pointer("pointerup", 150, 95));
  await nextTick();
  let root = f.sheet.drawings![0];
  if (!isShapeGroupDrawing(root)) throw Error("not group");
  let leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.x).toBe(100);
  expect(leaves[1]!.layout!.rect.x).toBe(280);
  await f.click("a", 150, 95);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(1);
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
  await nextTick();
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["b"]);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.x).toBe(280);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(isShapeGroupDrawing(f.sheet.drawings![0])).toBe(true);
});

test("group frame side resize updates all leaf layouts; Ungroup is one exact history command", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  f.wrapper
    .get('[data-shape-group-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 404, 80));
  await nextTick();
  const root = f.sheet.drawings![0];
  if (!isShapeGroupDrawing(root)) throw Error("not group");
  const group = serializeWorkbook(f.workbook),
    leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.width).toBeCloseTo(144);
  expect(leaves[1]!.layout!.rect.width).toBeCloseTo(108);
  action("[data-shape-group-ungroup]");
  await nextTick();
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["a", "b"]);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect).toEqual(
    leaves[0]!.layout!.rect,
  );
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(group);
});

test("rejected collection action preserves original forest/history and keeps a visible retryable selection", async () => {
  const f = fixture(false, true);
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="group"]');
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(undoWorkbookCommand(f.session)).toBe(false);
  expect(document.querySelector("[data-shape-selection-failure]")).not.toBeNull();
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(2);
});

test("owner/revision change cancels pending group gesture and readonly blocks collection controls", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  const before = serializeWorkbook(f.workbook);
  f.wrapper
    .get('[data-shape-group-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  await f.wrapper.setProps({ revision: 9 });
  window.dispatchEvent(pointer("pointerup", 404, 80));
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  await f.wrapper.setProps({ readOnly: true });
  expect(f.wrapper.find("[data-shape-group-resize]")).toBeDefined();
  expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});

test("owned member double-click emits the real root/path instead of editing a fake container", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  await f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .trigger("dblclick", { clientX: 130, clientY: 80 });
  const emitted = f.wrapper.emitted("editOwned");
  expect(emitted).toHaveLength(1);
  expect(emitted![0]![0]).toBe(f.sheet.drawings![0]);
  expect(emitted![0]![1]).toEqual(["g", "a"]);
});

test("keyboard focus on an unselected owner never deletes the old multi-selection", async () => {
  const f = fixture();
  const c = shape("c", 420, 40);
  f.sheet.drawings!.push(c);
  await f.sync();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  f.wrapper
    .get('[data-sheet-drawing-id="c"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
  expect(f.wrapper.emitted("delete")).toEqual([["c"]]);
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["a", "b", "c"]);
  expect(f.apply).not.toHaveBeenCalled();
});

test("retained member handle callbacks cannot edit a different current member selection", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  await f.click("a", 130, 80);
  const vnode = f.wrapper.getComponent(StandardShapeSelection).vm.$.vnode;
  const oldResize = vnode.props!.onResize as (direction: string, event: PointerEvent) => void;
  const oldNudge = vnode.props!.onNudgeRotation as (degrees: number) => void;
  await f.click("b", 300, 90);
  f.applyOne.mockClear();
  const before = serializeWorkbook(f.workbook);
  oldResize("e", pointer("pointerdown", 200, 80) as PointerEvent);
  window.dispatchEvent(pointer("pointerup", 260, 80));
  oldNudge(15);
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(f.applyOne).not.toHaveBeenCalled();
});

test("multi floating equal dimensions uses last selected owner and one reversible collection transaction", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="equal-width"]');
  await nextTick();
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.width).toBe(90);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.height).toBe(80);
  expect(resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect.width).toBe(90);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});
test("nested container is directly selectable, moves only its subtree, and one-level Ungroup preserves all world leaves", async () => {
  const f = fixture(true, false, true);
  await f.click("a", 130, 80);
  const beforeRoot = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(beforeRoot)) throw Error("group");
  const before = resolveShapeGroupProjection(beforeRoot, f.metrics).leaves;
  const border = f.wrapper.get('[data-shape-group-id="g"] [data-shape-group-move]');
  border.element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 350, 80));
  await nextTick();
  expect(
    f.wrapper.get('[data-shape-group-id="g"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(8);
  expect(
    f.wrapper.get('[data-shape-group-id="outer"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(0);
  border.element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 390, 100));
  await nextTick();
  const movedRoot = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(movedRoot)) throw Error("group");
  const moved = resolveShapeGroupProjection(movedRoot, f.metrics).leaves;
  expect(moved[0]!.layout!.rect.x).toBeCloseTo(before[0]!.layout!.rect.x + 40);
  expect(moved[1]!.layout!.rect.y).toBeCloseTo(before[1]!.layout!.rect.y + 20);
  expect(moved[2]!.layout!.rect).toEqual(before[2]!.layout!.rect);
  f.wrapper
    .get('[data-shape-group-id="g"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
    );
  expect(f.wrapper.emitted("formatGroup")!.at(-1)!).toEqual([movedRoot, ["outer", "g"]]);
  action("[data-shape-group-ungroup]");
  await nextTick();
  const result = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(result)) throw Error("group");
  expect(result.members.map((n) => n.id)).toEqual(["a", "b", "c"]);
  const after = resolveShapeGroupProjection(result, f.metrics).leaves;
  expect(after.map((l) => l.layout!.rect)).toEqual(moved.map((l) => l.layout!.rect));
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(f.sheet.drawings![0]).toEqual(movedRoot);
});

test("dragging a selected root group frame preserves and transforms every multi-selected root", async () => {
  const f = fixture(true);
  f.sheet.drawings = [...f.sheet.drawings!, shape("c", 450, 140)];
  await f.sync();
  await f.click("a", 130, 80);
  await f.click("c", 500, 180, true);
  const before = serializeWorkbook(f.workbook);
  f.wrapper
    .get('[data-shape-group-id="g"] [data-shape-group-move]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 380, 100));
  await nextTick();
  const root = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw Error("group");
  const leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.x).toBe(110);
  expect(leaves[1]!.layout!.rect.y).toBe(80);
  expect(resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect).toMatchObject({
    x: 480,
    y: 160,
  });
  expect(document.querySelectorAll('[data-shape-selection-action="group"]')).toHaveLength(1);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});
