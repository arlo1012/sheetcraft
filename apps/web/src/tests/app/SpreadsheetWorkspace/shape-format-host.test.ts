import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { createWorkbookSession } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type {
  ShapeFormatIntent,
  ShapeFormatSnapshot,
} from "../../../modules/sheet-drawings/shape-format-pane-model";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
async function fixture() {
  const workbook = createWorkbook({ id: "format-host", sheetId: "shapes" });
  getActiveSheet(workbook).drawings = ["one", "two"].map((id) =>
    createGraphicDrawing(id, "shape", id, { row: 0, column: 0 }),
  );
  const wrapper = mount(SpreadsheetWorkspace, {
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const state = (
    wrapper.vm.$ as unknown as {
      setupState: {
        session: ReturnType<typeof createWorkbookSession>;
        undo: () => void;
        redo: () => void;
      };
    }
  ).setupState;
  return {
    wrapper,
    state,
    grid: wrapper.getComponent(SheetGrid),
    sheet: getActiveSheet(state.session.workbook),
  };
}
function fillIntent(before: ShapeFormatSnapshot): ShapeFormatIntent {
  return {
    owner: { ...before.owner },
    baseRevision: before.revision,
    intentId: "host-fill",
    type: "set-style",
    target: "shape",
    category: "fill",
    value: {
      kind: "value",
      value: { kind: "solid", color: { kind: "rgb", rgb: "#abcdef" }, opacity: 0.5 },
    },
  };
}
test("real Workspace connects selection, detailed pane command, Undo/Redo and stable pane ownership", async () => {
  const { wrapper, state, grid, sheet } = await fixture();
  grid.vm.$emit("formatDrawing", sheet.drawings![0]);
  await flushPromises();
  const pane = wrapper.getComponent(ShapeFormatPane),
    uid = pane.vm.$.uid;
  const intent = fillIntent(pane.props("snapshot")!),
    submit = pane.props("onIntent");
  const before = serializeWorkbook(state.session.workbook);
  expect(submit(intent)).toBe(true);
  await flushPromises();
  expect(wrapper.getComponent(ShapeFormatPane).vm.$.uid).toBe(uid);
  expect(pane.props("snapshot")?.acceptedIntentId).toBe("host-fill");
  const after = serializeWorkbook(state.session.workbook);
  expect(after.version).toBe(59);
  expect(state.session.history.undoStack).toHaveLength(1);
  expect(submit(intent)).toBe(false);
  expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  state.undo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  state.redo();
  await flushPromises();
  expect(serializeWorkbook(state.session.workbook)).toEqual(after);
  pane.vm.$emit("close");
  await flushPromises();
  expect(wrapper.findComponent(ShapeFormatPane).exists()).toBe(false);
  expect(submit(intent)).toBe(false);
});
test("old pane callback cannot edit a new selection or a newly protected real workbook", async () => {
  const { wrapper, state, grid, sheet } = await fixture();
  grid.vm.$emit("formatDrawing", sheet.drawings![0]);
  await flushPromises();
  const old = wrapper.getComponent(ShapeFormatPane),
    intent = fillIntent(old.props("snapshot")!),
    submit = old.props("onIntent");
  grid.vm.$emit("selectedDrawingChange", "two");
  await flushPromises();
  expect(wrapper.findComponent(ShapeFormatPane).exists()).toBe(false);
  grid.vm.$emit("formatDrawing", sheet.drawings![1]);
  await flushPromises();
  const before = serializeWorkbook(state.session.workbook);
  expect(submit(intent)).toBe(false);
  expect(serializeWorkbook(state.session.workbook)).toEqual(before);
  const current = wrapper.getComponent(ShapeFormatPane),
    currentIntent = fillIntent(current.props("snapshot")!);
  sheet.properties.protected = true;
  expect(current.props("onIntent")(currentIntent)).toBe(false);
  expect(state.session.history.undoStack).toHaveLength(0);
  expect(sheet.drawings?.map((d) => (d.kind === "shape" ? d.shapeStyle : undefined))).toEqual([
    undefined,
    undefined,
  ]);
});
