import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, markRaw, nextTick, reactive, toRaw } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeSheetDrawings,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createSheetGeometry, type Point } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  createSheetPagination,
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
} from "@sheetcraft/sheet-engine/page-layout";
import SheetShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetShapeCreationLayer.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import {
  SHAPE_GALLERY,
  type ShapeLineChoice,
  type ShapeLineTool,
} from "../../../modules/sheet-drawings/shape-gallery";
import {
  useShapeCreation,
  type ShapeCreationDraft,
  type ShapeCreationRequest,
} from "../../../modules/sheet-drawings/useShapeCreation";
import {
  projectShapePointToViewport,
  shapePagePointFromViewport,
} from "../../../modules/sheet-drawings/shape-page-layout";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});
const choices = SHAPE_GALLERY.flatMap((group) => group.items).filter(
  (item): item is ShapeLineChoice => item.kind === "line",
);
function fixture(
  tool: ShapeLineTool = "line",
  options: {
    page?: boolean;
    group?: boolean;
    reject?: boolean;
    freeze?: boolean;
    scale?: number;
  } = {},
) {
  const workbook = reactive(createWorkbook({ id: "creation-book", sheetId: "creation-sheet" })),
    sheet = getActiveSheet(workbook);
  const target: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "target",
    name: "Rectangle",
    text: "",
    shapeGeometry: { preset: "rect" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 160, y: 120, size: { width: 80, height: 60 } },
    },
  };
  const other: SheetFramedGraphicDrawing = {
    ...target,
    id: "other",
    name: "Ellipse",
    shapeGeometry: { preset: "ellipse" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 420, y: 260, size: { width: 100, height: 80 } },
    },
  };
  const metrics = markRaw(createPictureSheetMetrics(sheet));
  sheet.drawings = normalizeSheetDrawings([target, other]);
  if (options.group) {
    const sibling: SheetFramedGraphicDrawing = {
      ...target,
      id: "sibling",
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 280, y: 160, size: { width: 40, height: 40 } },
      },
    };
    sheet.drawings = groupShapeRoots(
      [...sheet.drawings, sibling],
      ["target", "sibling"],
      { id: "owner", name: "Owner" },
      metrics,
    );
  }
  const geometry = createSheetGeometry({
    rowCount: 120,
    columnCount: 20,
    rowHeight: 24,
    columnWidth: 96,
  });
  const rows = createRowVisibilityIndex({ rowCount: 120, defaultRowHeight: 24 });
  const pagination = createSheetPagination({
    geometry,
    rows,
    setup: DEFAULT_SHEET_PAGE_SETUP,
    printRange: { start: { row: 0, column: 0 }, end: { row: 119, column: 19 } },
    layoutRange: { start: { row: 0, column: 0 }, end: { row: 119, column: 19 } },
  });
  const pageOptions = { geometry, rows, pagination, pagePadding: 12 };
  const pageProjection = options.page
    ? markRaw(createPageLayoutProjection(pageOptions))
    : undefined;
  const scroll = options.page
    ? { x: 20, y: 40 }
    : options.freeze
      ? { x: 96, y: 48 }
      : { x: 0, y: 0 };
  const layout = markRaw(
    options.page
      ? createPageLayoutViewportLayout({
          ...pageOptions,
          viewportSize: { width: 1900, height: 2400 },
          bodyScrollPosition: scroll,
        })
      : createSheetViewportLayout({
          geometry,
          rows,
          viewportSize: { width: 800, height: 600 },
          freeze: options.freeze ? { rows: 1, columns: 1 } : undefined,
          bodyScrollPosition: scroll,
        }),
  );
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let rejected = options.reject ?? false;
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) =>
    rejected ? false : executeWorkbookCommand(session, command),
  );
  const created = vi.fn();
  const scope = effectScope();
  const creation = scope.run(() =>
    useShapeCreation({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getMetrics: () => metrics,
      getAddress: () => ({ row: 0, column: 0 }),
      getRevision: () => 1,
      getGeneration: () => 0,
      isBusy: () => false,
      flush: () => true,
      execute,
      onCreated: created,
    }),
  )!;
  const choice = choices.find((value) => value.tool === tool)!;
  expect(creation.start(choice, false)).toBe(true);
  // Requests are metadata leases; do not let test-utils deep-reactivize their WeakMap identity.
  const request = markRaw(creation.request.value!);
  const commit = vi.fn((current: ShapeCreationRequest, draft: ShapeCreationDraft) =>
    creation.commit(current, draft),
  );
  const cancel = vi.fn((current: ShapeCreationRequest) => creation.cancel(current));
  const w = mount(SheetShapeCreationLayer, {
    attachTo: document.body,
    props: {
      request,
      layout,
      metrics,
      pageProjection,
      scale: options.scale ?? 2,
      revision: 1,
      readOnly: false,
      commit,
      cancel,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  cleanups.push(() => {
    w.unmount();
    scope.stop();
  });
  const origin = { x: 70, y: 30 },
    scale = options.scale ?? 2;
  vi.spyOn(w.element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(
      origin.x,
      origin.y,
      layout.viewportSize.width * scale,
      layout.viewportSize.height * scale,
    ),
  );
  const context = () => resolveSheetShapeConnections(sheet.drawings!, metrics);
  const begin = context().getTarget("target")!.sites[3]!,
    end = context().getTarget("other")!.sites[0]!;
  const viewport = (point: Point): Point => {
    if (pageProjection) {
      const mapped = projectShapePointToViewport(point, layout, pageProjection, metrics);
      if (!mapped) throw Error("Fixture point is outside visible paper content");
      return mapped.point;
    }
    const translation = getPicturePaneTranslation("body", layout);
    return { x: point.x + translation.x, y: point.y + translation.y };
  };
  const event = (type: string, point: Point) => {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: origin.x + point.x * scale,
      clientY: origin.y + point.y * scale,
    });
    Object.defineProperty(e, "pointerId", { value: 42 });
    return e;
  };
  const down = (point: Point) => w.element.dispatchEvent(event("pointerdown", point));
  const hover = (point: Point) => w.element.dispatchEvent(event("pointermove", point));
  const move = (point: Point) => window.dispatchEvent(event("pointermove", point));
  const up = (point: Point) => window.dispatchEvent(event("pointerup", point));
  const reject = (value: boolean) => {
    rejected = value;
  };
  const preview = () => w.getComponent(DrawingContent);
  const draft = () => commit.mock.calls.at(-1)![1] as SheetFramedGraphicDrawing;
  return {
    workbook,
    sheet,
    metrics,
    layout,
    pageProjection,
    session,
    creation,
    execute,
    commit,
    cancel,
    created,
    choice,
    request,
    w,
    begin,
    end,
    viewport,
    event,
    down,
    hover,
    move,
    up,
    reject,
    preview,
    draft,
  };
}
function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}
function expectSiteMarkers(f: ReturnType<typeof fixture>, targetId: string) {
  const sites = f.w.findAll(`[data-shape-connection-target="${targetId}"]`);
  const context = resolveSheetShapeConnections(f.sheet.drawings!, f.metrics),
    target = context.getTarget(targetId)!;
  const expected = target.sites.flatMap((site) => {
    if (f.pageProjection) {
      const mapped = projectShapePointToViewport(
        site.position,
        f.layout,
        f.pageProjection,
        f.metrics,
      );
      return mapped ? [{ index: site.identity.index, point: mapped.point }] : [];
    }
    return (["topLeft", "top", "left", "body"] as const).flatMap((paneId) => {
      const clip = f.layout.panes[paneId].clip,
        delta = getPicturePaneTranslation(paneId, f.layout);
      const point = { x: site.position.x + delta.x, y: site.position.y + delta.y };
      return point.x >= clip.x &&
        point.y >= clip.y &&
        point.x < clip.x + clip.width &&
        point.y < clip.y + clip.height
        ? [{ index: site.identity.index, point }]
        : [];
    });
  });
  expect(sites).toHaveLength(expected.length);
  expect(sites.length).toBeGreaterThan(0);
  const remaining = [...expected];
  for (const site of sites) {
    const index = Number(site.attributes("data-shape-connection-site"));
    const actual = {
      x: parseFloat((site.element as HTMLElement).style.left),
      y: parseFloat((site.element as HTMLElement).style.top),
    };
    // HappyDOM CSSOM serializes px positions to six decimal places; Core route tips below remain checked to 1e-9.
    const match = remaining.findIndex(
      (value) =>
        value.index === index &&
        Math.hypot(value.point.x - actual.x, value.point.y - actual.y) < 1e-6,
    );
    expect(match, JSON.stringify({ targetId, index, actual, remaining })).toBeGreaterThanOrEqual(0);
    remaining.splice(match, 1);
  }
  expect(remaining).toHaveLength(0);
}
describe("actual connector creation layer with source and session leases", () => {
  test.each(["line", "elbowArrowConnector", "curvedDoubleArrowConnector"] as const)(
    "%s shows exact real ports and bound route preview before one atomic insertion",
    async (tool) => {
      const f = fixture(tool);
      const before = structuredClone(toRaw(f.sheet.drawings!));
      f.hover(f.viewport({ x: 200, y: 150 }));
      await nextTick();
      expectSiteMarkers(f, "target");
      f.down(f.viewport(f.begin.position));
      f.move(f.viewport(f.end.position));
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expectSiteMarkers(f, "other");
      const content = f.preview(),
        route = content.props("connectorRoute")!;
      expectPoint(route.begin, f.begin.position);
      expectPoint(route.end, f.end.position);
      expect(content.props("drawing")).not.toHaveProperty("shapeConnector");
      const drawing = content.props("drawing");
      if (drawing.kind !== "shape") throw new Error("Expected connector paint view");
      expect(drawing.shapeGeometry?.preset).toBe(f.choice.preset);
      expect(drawing.shapeLineEnds ?? {}).toEqual({
        ...(f.choice.beginArrow === "triangle" ? { begin: { kind: "triangle" } } : {}),
        ...(f.choice.endArrow === "triangle" ? { end: { kind: "triangle" } } : {}),
      });
      f.up(f.viewport(f.end.position));
      await nextTick();
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.sheet.drawings!.slice(0, before.length)).toEqual(before);
      expect(f.draft().shapeConnector).toEqual({
        kind: "shape-connector-v1",
        begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
        end: { kind: "site", targetId: "other", preset: "ellipse", siteIndex: 0 },
      });
      expect(f.creation.request.value).toBeUndefined();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
    },
  );
  test("new relation binds an already-owned target through the entire source forest", async () => {
    const f = fixture("elbowConnector", { group: true });
    f.hover(f.viewport(f.begin.position));
    await nextTick();
    expectSiteMarkers(f, "target");
    f.down(f.viewport(f.begin.position));
    f.move(f.viewport(f.end.position));
    await nextTick();
    expectPoint(f.preview().props("connectorRoute")!.begin, f.begin.position);
    f.up(f.viewport(f.end.position));
    await nextTick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    const connector = resolveSheetShapeConnections(f.sheet.drawings!, f.metrics).getConnector(
      f.request.base.id,
    )!;
    expect(connector.begin.kind).toBe("site");
    expect(connector.end.kind).toBe("site");
    expect(
      resolveSheetShapeConnections(f.sheet.drawings!, f.metrics).getTarget("target")!.path,
    ).toEqual(["owner", "target"]);
  });
  test.each(["escape", "finish"] as const)(
    "%s cancels bound preview without commit or Core history",
    async (method) => {
      const f = fixture("curvedConnector");
      f.down(f.viewport(f.begin.position));
      f.move(f.viewport(f.end.position));
      await nextTick();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(true);
      if (method === "escape")
        f.w.element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      else
        await f.w
          .findAll("button")
          .find((button) => button.text() === "Finish drawing")!
          .trigger("click");
      f.up(f.viewport(f.end.position));
      await nextTick();
      expect(f.cancel).toHaveBeenCalledExactlyOnceWith(f.request);
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.creation.request.value).toBeUndefined();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
    },
  );
  test("execute false retains the exact bound draft and explicit retry inserts only once", async () => {
    const f = fixture("elbowArrowConnector", { reject: true });
    f.down(f.viewport(f.begin.position));
    f.up(f.viewport(f.end.position));
    await nextTick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.results[0]!.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.creation.request.value).toBe(f.request);
    const held = f.draft();
    expectPoint(f.preview().props("connectorRoute")!.begin, f.begin.position);
    expectPoint(f.preview().props("connectorRoute")!.end, f.end.position);
    expect(f.w.get('[role="status"]').text()).toContain("preserved");
    f.reject(false);
    await f.w
      .findAll("button")
      .find((button) => button.text() === "Retry insertion")!
      .trigger("click");
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.commit.mock.calls[1]![1]).toBe(held);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.created).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings!.filter((drawing) => drawing.id === held.id)).toHaveLength(1);
    expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
  });
  test.each(["same-array-target", "same-value-root", "same-value-owned-node"] as const)(
    "%s replacement invalidates the captured creation gesture",
    async (replacement) => {
      const f = fixture("line", { group: replacement === "same-value-owned-node" });
      f.down(f.viewport(f.begin.position));
      f.move(f.viewport(f.end.position));
      await nextTick();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(true);
      if (replacement === "same-array-target")
        f.sheet.drawings![0] = structuredClone(toRaw(f.sheet.drawings![0]!));
      else if (replacement === "same-value-root")
        f.sheet.drawings = structuredClone(toRaw(f.sheet.drawings!));
      else {
        const owner = f.sheet.drawings!.find((drawing) => drawing.id === "owner")!;
        if (owner.kind !== "shapeGroup") throw Error("Expected owner");
        const index = owner.members.findIndex((drawing) => drawing.id === "target");
        owner.members[index] = structuredClone(toRaw(owner.members[index]!));
      }
      f.up(f.viewport(f.end.position));
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
    },
  );
  test("same-value target replacement after rejection blocks stale retry", async () => {
    const f = fixture("line", { reject: true });
    f.down(f.viewport(f.begin.position));
    f.up(f.viewport(f.end.position));
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    f.reject(false);
    f.sheet.drawings![0] = structuredClone(toRaw(f.sheet.drawings![0]!));
    await f.w
      .findAll("button")
      .find((button) => button.text() === "Retry insertion")!
      .trigger("click");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("zoomed frozen body pane converts real site ports and ordered tips without counting the frozen-axis displacement", async () => {
    const f = fixture("curvedConnector", { freeze: true, scale: 2 });
    f.hover(f.viewport(f.begin.position));
    await nextTick();
    expectSiteMarkers(f, "target");
    f.down(f.viewport(f.begin.position));
    f.move(f.viewport(f.end.position));
    await nextTick();
    expectSiteMarkers(f, "other");
    expectPoint(f.preview().props("connectorRoute")!.begin, f.begin.position);
    expectPoint(f.preview().props("connectorRoute")!.end, f.end.position);
    f.up(f.viewport(f.end.position));
    await nextTick();
    const connector = resolveSheetShapeConnections(f.sheet.drawings!, f.metrics).getConnector(
      f.request.base.id,
    )!;
    expect(connector.begin).toMatchObject({ kind: "site", position: f.begin.position });
    expect(connector.end).toMatchObject({ kind: "site", position: f.end.position });
  });
  test("page route crossing uses continuous worksheet distance without adding paper margins or page gaps", async () => {
    const f = fixture("curvedConnector", { page: true });
    const projection = f.pageProjection!;
    const nextPage = projection.getPage(1, 0)!;
    const endViewport = {
      x: nextPage.contentRect.x + 180 - f.layout.bodyScrollPosition.x,
      y: nextPage.contentRect.y + 140 - f.layout.bodyScrollPosition.y,
    };
    const continuous = shapePagePointFromViewport(
      endViewport,
      f.layout,
      projection,
      f.metrics,
    )!.point;
    f.down(f.viewport(f.begin.position));
    f.move(endViewport);
    await nextTick();
    const preview = f.preview().props("connectorRoute")!;
    expectPoint(preview.begin, f.begin.position);
    expectPoint(preview.end, continuous);
    expect(f.w.findAll(".shape-creation-layer__fragment").length).toBeGreaterThan(1);
    f.up(endViewport);
    await nextTick();
    const connector = resolveSheetShapeConnections(f.sheet.drawings!, f.metrics).getConnector(
      f.request.base.id,
    )!;
    expect(connector.begin).toMatchObject({ kind: "site", position: f.begin.position });
    expect(connector.end.kind).toBe("free");
    if (connector.end.status !== "ready") throw Error("Expected ready tip");
    expectPoint(connector.end.position, continuous);
  });
  test.each(["margin", "gap"] as const)(
    "paper %s cannot supply creation start or captured endpoint geometry",
    async (space) => {
      const f = fixture("elbowConnector", { page: true });
      const projection = f.pageProjection!;
      const first = projection.getPage(0, 0)!,
        second = projection.getPage(1, 0)!;
      const point =
        space === "margin"
          ? {
              x: first.paperRect.x + 1 - f.layout.bodyScrollPosition.x,
              y: first.contentRect.y + 100 - f.layout.bodyScrollPosition.y,
            }
          : {
              x: first.contentRect.x + 100 - f.layout.bodyScrollPosition.x,
              y:
                (first.paperRect.y + first.paperRect.height + second.paperRect.y) / 2 -
                f.layout.bodyScrollPosition.y,
            };
      f.hover(point);
      f.down(point);
      f.up(point);
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
      expect(f.w.findAll("[data-shape-connection-site]")).toHaveLength(0);
      f.down(f.viewport(f.begin.position));
      f.move(point);
      await nextTick();
      expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
      f.up(point);
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
});
