import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useShapeClipboard } from "../../../modules/sheet-drawings/useShapeClipboard";
import { useShapeDrawingTransfer } from "../../../modules/sheet-drawings/useShapeDrawingTransfer";
import { createAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";

// Only the chart renderer is replaced. Selection, native menus, clipboard
// capture/planning, collection admission and Core history stay real.
const ChartContentProbe = defineComponent({
  name: "ChartContent",
  setup: () => () => h("div", { "data-chart-content-probe": "" }),
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function drawing(id = "chart-one", column = 0): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: id,
    anchor: { row: 1, column },
    offsetX: 7,
    offsetY: 9,
    width: 160,
    height: 110,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#d1d5db",
    strokeWidth: 1,
    color: "#111827",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "sales",
            colorIndex: 0,
            name: { kind: "literal", text: "Sales" },
            values: { kind: "literal", values: [10, 20] },
          },
        ],
      },
      elements: { titlePosition: "overlay", legendPosition: "right" },
      format: { title: { color: "#123456", fontSize: 22 }, bar: { gapWidth: 60 } },
    },
  };
}

function pointer(type: string, x = 30, y = 50) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event;
}

function fixture(locale: "en-US" | "zh-CN" = "en-US") {
  const workbook = createWorkbook({ id: "chart-entry", sheetId: "source" });
  let sheet = getActiveSheet(workbook),
    metrics = createPictureSheetMetrics(sheet),
    revision = 0,
    rejected = false,
    flushRejected = false,
    ids = 0;
  sheet.drawings = [drawing(), drawing("chart-two", 3)];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let wrapper: VueWrapper<InstanceType<typeof SheetDrawingLayer>>;
  const sync = async () => {
    await wrapper.setProps({ drawings: sheet.drawings ?? [], sheet, metrics, revision });
    await nextTick();
  };
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    if (rejected) return false;
    const accepted = executeWorkbookCommand(session, command);
    if (accepted) {
      revision++;
      void sync();
    }
    return accepted;
  });
  const options = {
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => 0,
    getRevision: () => revision,
    getMetrics: () => metrics,
    getAddress: () => ({ row: 7, column: 1 }),
    flush: () => !flushRejected,
    isBusy: () => false,
    execute,
  };
  const actions = useDrawingActions({ ...options, name: (kind) => kind });
  const transfer = useShapeDrawingTransfer({
    ...options,
    prepareDrawing: (_sheet, _metrics, candidate) => candidate,
    preflightConnectedCollection: () => true,
  });
  const clipboard = useShapeClipboard({
    ...options,
    getDocumentRevision: () => session.history.revision,
    getSelectedPaths: () => wrapper.vm.getObjectSelectionPaths(),
    getTargetAddress: options.getAddress,
    createId: () => `pasted-chart-${++ids}`,
    replaceCollection: actions.replaceCollectionPreservingGeometry,
    replaceCollections: transfer.replaceCollections,
    onCopy: () => void wrapper.setProps({ canPasteObjects: true }),
    onSelect: (paths) =>
      void nextTick(() => {
        wrapper.vm.selectObjectPaths(paths);
        void wrapper.setProps({ canPasteObjects: clipboard.hasPending() });
      }),
  });
  const copy = vi.fn((paths: readonly ShapeGroupPath[]) => clipboard.copy(paths)),
    cut = vi.fn((paths: readonly ShapeGroupPath[]) => clipboard.cut(paths)),
    paste = vi.fn(() => clipboard.paste());
  wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      sheet,
      metrics,
      revision,
      scale: 1,
      readOnly: false,
      locale,
      copyObjects: copy,
      cutObjects: cut,
      pasteObjects: paste,
      canPasteObjects: false,
      applyCollection: actions.replaceCollectionPreservingGeometry,
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
    global: { plugins: [createAppI18n(locale)], stubs: { ChartContent: ChartContentProbe } },
  });
  mounted.push(wrapper);
  return {
    wrapper,
    workbook,
    session,
    clipboard,
    execute,
    copy,
    cut,
    paste,
    sheet: () => sheet,
    sync,
    reject(value: boolean) {
      rejected = value;
    },
    rejectFlush(value: boolean) {
      flushRejected = value;
    },
    async change(kind: "root" | "sheet" | "revision" | "metrics") {
      if (kind === "root") sheet.drawings = sheet.drawings!.map((root) => structuredClone(root));
      if (kind === "sheet") {
        sheet = structuredClone(sheet);
        workbook.sheets.set(sheet.id, sheet);
      }
      if (kind === "revision") revision++;
      if (kind === "metrics") metrics = createPictureSheetMetrics(sheet);
      await sync();
    },
  };
}

async function select(wrapper: VueWrapper, id = "chart-one") {
  const object = wrapper.get(`[data-sheet-drawing-id="${id}"]`);
  object.element.dispatchEvent(pointer("pointerdown"));
  window.dispatchEvent(pointer("pointercancel"));
  await flushPromises();
}
async function open(wrapper: VueWrapper, id = "chart-one", keyboard = false) {
  const object = wrapper.get(`[data-sheet-drawing-id="${id}"]`);
  if (keyboard) await object.trigger("keydown", { key: "ContextMenu" });
  else await object.trigger("contextmenu", { clientX: 30, clientY: 50, button: 2 });
  await flushPromises();
}
function menuItem(wrapper: VueWrapper, label: string) {
  const item = wrapper.findAllComponents(MenuItem).find((entry) => entry.text() === label);
  expect(item, `Missing native Chart menu command ${label}`).toBeDefined();
  return item!;
}
async function activate(wrapper: VueWrapper, label: string, keyboard = false) {
  const item = menuItem(wrapper, label);
  if (keyboard) await item.trigger("keydown", { key: "Enter" });
  else await item.trigger("click");
  await flushPromises();
}

describe("Chart clipboard through the real drawing-layer entry", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s native menu exposes only Chart Copy, Cut and Paste; keyboard menu selection is admitted",
    async (locale) => {
      const f = fixture(locale),
        labels = locale === "zh-CN" ? ["复制", "剪切", "粘贴"] : ["Copy", "Cut", "Paste"];
      await select(f.wrapper);
      expect(f.wrapper.vm.getObjectSelectionPaths()).toEqual([["chart-one"]]);
      expect(f.wrapper.emitted("objectSelectionChange")?.at(-1)).toEqual([[["chart-one"]]]);
      await open(f.wrapper, "chart-one", true);
      const native = new DOMWrapper(document.querySelector('[role="menu"]')!);
      expect(native.attributes("aria-label")).toBe(
        locale === "zh-CN" ? "图表操作" : "Chart actions",
      );
      expect(native.findAll('[role="menuitem"]').map((item) => item.text())).toEqual(labels);
      expect(menuItem(f.wrapper, labels[2]!).attributes("aria-disabled")).toBe("true");
      const before = serializeWorkbook(f.workbook);
      await activate(f.wrapper, labels[0]!, true);
      expect(f.copy).toHaveBeenCalledExactlyOnceWith([["chart-one"]]);
      expect(f.clipboard.hasPending()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(document.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test("rejected native Paste keeps the source, clipboard identity and history, then retries the same menu", async () => {
    const f = fixture();
    await open(f.wrapper);
    await activate(f.wrapper, "Copy");
    const identity = f.clipboard.getIdentity(),
      before = serializeWorkbook(f.workbook),
      source = f.sheet().drawings![0];
    await open(f.wrapper);
    f.reject(true);
    await activate(f.wrapper, "Paste");
    expect(f.paste).toHaveReturnedWith(false);
    expect(f.clipboard.getIdentity()).toEqual(identity);
    expect(f.sheet().drawings![0]).toBe(source);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    f.reject(false);
    await activate(f.wrapper, "Paste");
    expect(f.paste).toHaveLastReturnedWith(true);
    expect(f.sheet().drawings).toHaveLength(3);
    const inserted = f.sheet().drawings!.at(-1)!;
    expect(inserted).toMatchObject({
      kind: "chart",
      id: "pasted-chart-2",
      chart: source!.kind === "chart" ? source!.chart : undefined,
    });
    expect(f.clipboard.getIdentity()).toEqual(identity);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("native Cut remains non-destructive until Paste accepts one history command", async () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook);
    await open(f.wrapper);
    await activate(f.wrapper, "Cut");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    await open(f.wrapper);
    await activate(f.wrapper, "Paste", true);
    expect(f.sheet().drawings!.map((root) => root.id)).toEqual(["chart-two", "pasted-chart-1"]);
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["Copy", "Cut"] as const)(
    "rejected native %s retains the earlier clipboard and can retry the same menu",
    async (action) => {
      const f = fixture();
      await open(f.wrapper);
      await activate(f.wrapper, "Copy");
      const identity = f.clipboard.getIdentity(),
        before = serializeWorkbook(f.workbook),
        source = f.sheet().drawings![0];
      await open(f.wrapper);
      f.rejectFlush(true);
      await activate(f.wrapper, action);
      expect(action === "Copy" ? f.copy : f.cut).toHaveLastReturnedWith(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.sheet().drawings![0]).toBe(source);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(document.querySelector('[role="menu"]')).not.toBeNull();
      f.rejectFlush(false);
      await activate(f.wrapper, action);
      expect(action === "Copy" ? f.copy : f.cut).toHaveLastReturnedWith(true);
      expect(f.clipboard.getIdentity()).not.toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(document.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test.each(["Copy", "Cut", "Paste"] as const)(
    "retained %s callbacks cannot run after target, root, sheet, revision, metrics or handler replacement",
    async (action) => {
      for (const change of ["target", "root", "sheet", "revision", "metrics", "handler"] as const) {
        const f = fixture();
        await open(f.wrapper);
        await activate(f.wrapper, "Copy");
        const identity = f.clipboard.getIdentity();
        await open(f.wrapper);
        const old = menuItem(f.wrapper, action).vm.$.vnode.props!.onSelect as () => boolean;
        const handler = action === "Copy" ? f.copy : action === "Cut" ? f.cut : f.paste;
        const calls = handler.mock.calls.length;
        const replacement = vi.fn(() => true);
        if (change === "target") await select(f.wrapper, "chart-two");
        else if (change === "handler")
          await f.wrapper.setProps({
            [action === "Copy" ? "copyObjects" : action === "Cut" ? "cutObjects" : "pasteObjects"]:
              replacement,
          });
        else await f.change(change);
        const before = serializeWorkbook(f.workbook);
        expect(old(), `${action} must reject stale ${change}`).toBe(false);
        expect(handler.mock.calls).toHaveLength(calls);
        expect(replacement).not.toHaveBeenCalled();
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(f.session.history.undoStack).toHaveLength(0);
        f.wrapper.unmount();
        mounted.splice(mounted.indexOf(f.wrapper), 1);
      }
    },
  );
});
