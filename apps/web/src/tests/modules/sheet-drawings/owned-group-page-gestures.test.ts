import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { getActiveSheet } from "@sheetcraft/core/workbook";
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
import type { ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeGroupSelection from "../../../modules/sheet-drawings/components/ShapeGroupSelection.vue";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import {
  projectShapePointToViewport,
  shapePagePointFromViewport,
} from "../../../modules/sheet-drawings/shape-page-layout";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
import { shapePageFixture } from "./shape-page-fixture";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function shape(id: string, rect: ShapeFrameRect) {
  const drawing = framedShape();
  drawing.id = id;
  drawing.name = id;
  drawing.rotation = 0;
  drawing.text = "";
  drawing.shapeGeometry = { preset: "rect" };
  drawing.shapeFrame.anchor = {
    mode: "fixed",
    x: rect.x,
    y: rect.y,
    size: { width: rect.width, height: rect.height },
  };
  return drawing;
}

function fixture(whiteSpace = true, scrolled = false) {
  const page = shapePageFixture(whiteSpace),
    workbook = reactive(page.workbook),
    sheet = getActiveSheet(workbook),
    metrics = reactive(createPictureSheetMetrics(sheet)),
    first = page.projection.getPage(0, 0)!,
    y = first.sheetRect.y + first.sheetRect.height - 100;
  sheet.drawings = groupShapeRoots(
    [
      shape("a", { x: 80, y, width: 120, height: 60 }),
      shape("b", { x: 240, y: y + 20, width: 90, height: 50 }),
    ],
    ["a", "b"],
    { id: "g", name: "Group" },
    metrics,
  );
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
    execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) =>
      executeWorkbookCommand(session, command),
    ),
    viewport = scrolled ? page.layout({ x: 30, y: 40 }) : page.viewport;
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
    execute,
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
      expectedMetrics = metrics,
    ) => {
      const accepted = actions.replaceCollection(next, expected, expectedMetrics);
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
      pageProjection: page.projection,
      layout: viewport,
      revision,
      scale: 2,
      readOnly: false,
      applyCollection: apply,
      applyUpdate: applyOne,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const project = (point: { x: number; y: number }) => {
    const result = projectShapePointToViewport(point, viewport, page.projection, metrics);
    if (!result) throw new Error("Expected the fixture point to belong to visible page content.");
    return result.point;
  };
  const pointer = (type: string, point: { x: number; y: number }, sheetPoint = true) => {
    const projected = sheetPoint ? project(point) : point;
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: projected.x * 2,
      clientY: projected.y * 2,
    });
    Object.defineProperty(event, "pointerId", { value: 7 });
    return event;
  };
  const root = () => {
    const current = sheet.drawings![0];
    if (!isShapeGroupDrawing(current)) throw new Error("Expected the same owned group root.");
    return current;
  };
  return {
    ...page,
    workbook,
    sheet,
    metrics,
    viewport,
    wrapper,
    session,
    execute,
    apply,
    applyOne,
    sync,
    project,
    pointer,
    root,
    from: { x: 140, y: y + 30 },
  };
}

test.each([
  { whiteSpace: true, scrolled: false },
  { whiteSpace: false, scrolled: false },
  { whiteSpace: true, scrolled: true },
])(
  "group body drag crosses real row/column pages at scale 2 and commits one continuous sheet-space command, %j",
  async ({ whiteSpace, scrolled }) => {
    const f = fixture(whiteSpace, scrolled),
      source = f.root(),
      before = serializeWorkbook(f.workbook),
      projection = resolveShapeGroupProjection(source, f.metrics),
      second = f.projection.getPage(1, 1)!,
      to = { x: second.sheetRect.x + 40, y: second.sheetRect.y + 40 },
      delta = { x: to.x - f.from.x, y: to.y - f.from.y },
      paperFrom = f.project(f.from),
      paperTo = f.project(to);
    // Both axes cross physical whitespace. Scaling and scrolling must not add
    // the paper gaps to any persisted frame or member placement.
    expect(paperTo.x - paperFrom.x).toBeGreaterThan(delta.x);
    expect(paperTo.y - paperFrom.y).toBeGreaterThan(delta.y);
    f.wrapper
      .get('[data-sheet-drawing-id="a"]')
      .element.dispatchEvent(f.pointer("pointerdown", f.from));
    window.dispatchEvent(f.pointer("pointermove", to));
    await nextTick();
    const preview = f.wrapper.getComponent(ShapeGroupSelection).props("rect") as ShapeFrameRect;
    expect(preview.x).toBeCloseTo(projection.layout.rect.x + delta.x);
    expect(preview.y).toBeCloseTo(projection.layout.rect.y + delta.y);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    window.dispatchEvent(f.pointer("pointerup", to));
    await nextTick();
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(f.apply.mock.calls[0]![1][0]).toBe(source);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.session.history.redoStack).toHaveLength(0);
    const moved = resolveShapeGroupProjection(f.root(), f.metrics);
    expect(moved.layout.rect).toMatchObject({
      width: projection.layout.rect.width,
      height: projection.layout.rect.height,
    });
    expect(moved.layout.rect.x).toBeCloseTo(projection.layout.rect.x + delta.x);
    expect(moved.layout.rect.y).toBeCloseTo(projection.layout.rect.y + delta.y);
    expect(f.root().members).toEqual(source.members);
    for (const [index, leaf] of moved.leaves.entries()) {
      const original = projection.leaves[index]!;
      expect(leaf.path).toEqual(original.path);
      expect(leaf.layout!.rect.x).toBeCloseTo(original.layout!.rect.x + delta.x);
      expect(leaf.layout!.rect.y).toBeCloseTo(original.layout!.rect.y + delta.y);
      expect(leaf.layout!.rect.width).toBeCloseTo(original.layout!.rect.width);
      expect(leaf.layout!.rect.height).toBeCloseTo(original.layout!.rect.height);
    }
    const after = serializeWorkbook(f.workbook);
    expect(after.version).toBe(61);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    await f.sync();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(undoWorkbookCommand(f.session)).toBe(false);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    await f.sync();
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  },
);

test.each(["row", "column"] as const)(
  "group body release in a %s page gap discards a valid cross-page preview without command or history",
  async (axis) => {
    const f = fixture(),
      source = f.root(),
      before = serializeWorkbook(f.workbook),
      first = f.projection.getPage(0, 0)!,
      nextRow = f.projection.getPage(1, 0)!,
      nextColumn = f.projection.getPage(0, 1)!,
      second = f.projection.getPage(1, 1)!,
      to = { x: second.sheetRect.x + 40, y: second.sheetRect.y + 40 },
      gap =
        axis === "row"
          ? {
              x: first.contentRect.x + 100,
              y: (first.contentRect.y + first.sheetRect.height + nextRow.contentRect.y) / 2,
            }
          : {
              x: (first.contentRect.x + first.sheetRect.width + nextColumn.contentRect.x) / 2,
              y: first.contentRect.y + 100,
            };
    expect(shapePagePointFromViewport(gap, f.viewport, f.projection, f.metrics)).toBeNull();
    f.wrapper
      .get('[data-sheet-drawing-id="a"]')
      .element.dispatchEvent(f.pointer("pointerdown", f.from));
    window.dispatchEvent(f.pointer("pointermove", to));
    await nextTick();
    const original = resolveShapeGroupProjection(source, f.metrics).layout.rect,
      preview = f.wrapper.getComponent(ShapeGroupSelection).props("rect") as ShapeFrameRect;
    expect(preview.x).toBeCloseTo(original.x + to.x - f.from.x);
    expect(preview.y).toBeCloseTo(original.y + to.y - f.from.y);
    window.dispatchEvent(f.pointer("pointerup", gap, false));
    await nextTick();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.root()).toBe(source);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
    expect(undoWorkbookCommand(f.session)).toBe(false);
    expect(f.wrapper.getComponent(ShapeGroupSelection).props("rect")).toEqual(original);
    expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(0);
  },
);
