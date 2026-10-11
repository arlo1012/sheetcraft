import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import ImageInsertMenu from "../../../modules/home-tools/components/ImageInsertMenu.vue";
import * as imagePreparation from "../../../modules/image-assets/prepareImageAsset";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  getCellContent,
  getCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import SymbolDialog from "../../../modules/insert-tools/components/SymbolDialog.vue";
import CellEditor from "../../../modules/sheet-grid/components/CellEditor.vue";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import SparklineDialog from "../../../modules/sparklines/components/SparklineDialog.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import HyperlinkDialog from "../../../modules/hyperlinks/components/HyperlinkDialog.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { triggerCanvasCell } from "../canvas-interaction";
import { createAppI18n } from "../../../shared/i18n";
import catalogData from "../../../modules/insert-tools/symbols/assets/unicode-catalog.json";
import type { UnicodeCatalogData } from "../../../modules/insert-tools/symbols/unicode-catalog";
import {
  defaultSymbolPreferences,
  useSymbolPreferences,
} from "../../../modules/insert-tools/symbols/symbol-preferences";

// Observe the real controller and command history without replacing their behavior.
const captured = vi.hoisted(() => ({
  ensureFont: vi.fn(async (_family: string): Promise<void> => undefined),
  controller: undefined as
    | ReturnType<
        typeof import("../../../app/composables/useSpreadsheetWorkspaceController").useSpreadsheetWorkspaceController
      >
    | undefined,
}));
vi.mock("../../../shared/cell-text/font-resources", async (original) => ({
  ...(await original<object>()),
  ensureCellFontResource: captured.ensureFont,
}));
vi.mock("../../../modules/insert-tools/symbols/unicode-catalog", async (original) => {
  const actual =
    await original<typeof import("../../../modules/insert-tools/symbols/unicode-catalog")>();
  return {
    ...actual,
    loadSymbolUnicodeCatalog: async () =>
      new actual.SymbolUnicodeCatalog(catalogData as unknown as UnicodeCatalogData),
  };
});
vi.mock("../../../app/composables/useSpreadsheetWorkspaceController", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../app/composables/useSpreadsheetWorkspaceController")
    >();
  return {
    ...actual,
    useSpreadsheetWorkspaceController(
      ...args: Parameters<typeof actual.useSpreadsheetWorkspaceController>
    ) {
      const controller = actual.useSpreadsheetWorkspaceController(...args);
      captured.controller = controller;
      return controller;
    },
  };
});
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  captured.ensureFont.mockReset();
  captured.ensureFont.mockResolvedValue(undefined);
  useSymbolPreferences().update(defaultSymbolPreferences());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function fixture(withData = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  if (withData) {
    const sheet = getActiveSheet(workbook);
    [
      ["Region", "Amount"],
      ["East", 10],
      ["East", 20],
      ["West", 40],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  return wrapper;
}

async function openFullSymbolDialog(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-insert-tool="symbol"]').trigger("click");
  await flushPromises();
  const more = [
    ...document.body.querySelectorAll<HTMLElement>('.symbol-menu [role="menuitem"]'),
  ].find((item) => item.textContent?.includes("More symbols"));
  if (!more) throw new Error("The Symbol menu must expose More symbols.");
  more.click();
  await flushPromises();
}

describe("workspace insert entry points", () => {
  test("repeated synchronous picture batch failures remain visible each time", async () => {
    const error = vi.spyOn(MessagePlugin, "error").mockResolvedValue({ close: vi.fn() });
    const wrapper = await fixture();
    const input = wrapper.get<HTMLInputElement>(".spreadsheet-workspace__image-input");
    vi.spyOn(input.element, "click").mockImplementation(() => undefined);
    Object.defineProperty(input.element, "files", {
      value: Array.from({ length: 101 }, () => new File(["x"], "test.png", { type: "image/png" })),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      wrapper.getComponent(ImageInsertMenu).vm.$emit("insertImage", "floating");
      await input.trigger("change");
      await flushPromises();
    }
    expect(
      error.mock.calls.filter(([text]) => text === "Insert up to 100 pictures at a time."),
    ).toHaveLength(2);
    expect(captured.controller!.session.history.undoStack).toHaveLength(0);
  });
  test("picture feedback from the actual insertion action is presented as an error", async () => {
    const error = vi.spyOn(MessagePlugin, "error").mockResolvedValue({ close: vi.fn() });
    const success = vi.spyOn(MessagePlugin, "success").mockResolvedValue({ close: vi.fn() });
    vi.spyOn(imagePreparation, "prepareImageAsset").mockRejectedValue(
      new imagePreparation.ImageAssetError("decode-failed"),
    );
    const wrapper = await fixture();
    const input = wrapper.get<HTMLInputElement>(".spreadsheet-workspace__image-input");
    vi.spyOn(input.element, "click").mockImplementation(() => undefined);
    wrapper.getComponent(ImageInsertMenu).vm.$emit("insertImage", "floating");
    Object.defineProperty(input.element, "files", {
      value: [new File(["invalid"], "test.png", { type: "image/png" })],
    });
    await input.trigger("change");
    await flushPromises();
    expect(error).toHaveBeenCalledWith("This image could not be read.");
    expect(success).not.toHaveBeenCalled();
    expect(captured.controller!.session.history.undoStack).toHaveLength(0);
  });
  test("picture feedback from Grid is visible and unchanged results are informational", async () => {
    const error = vi.spyOn(MessagePlugin, "error").mockResolvedValue({ close: vi.fn() });
    const info = vi.spyOn(MessagePlugin, "info").mockResolvedValue({ close: vi.fn() });
    const success = vi.spyOn(MessagePlugin, "success").mockResolvedValue({ close: vi.fn() });
    const wrapper = await fixture();
    const grid = wrapper.getComponent(SheetGrid);
    grid.vm.$emit("imageFeedback", "image.copyFailed");
    expect(error).toHaveBeenCalledWith("The image could not be copied.");
    grid.vm.$emit("imageFeedback", "image.unchanged");
    expect(info).toHaveBeenCalledWith(
      "The image already has these settings. No changes were made.",
    );
    expect(success).not.toHaveBeenCalled();
    grid.vm.$emit("imageFeedback", "image.inserted");
    expect(success).toHaveBeenCalledWith("Image inserted.");
  });
  test.each(["confirm", "cancel"] as const)(
    "Sparkline replaces and detaches an old range-picker %s",
    async (action) => {
      const wrapper = await fixture(true);
      await wrapper.get('[role="button"][aria-label="Sparklines"]').trigger("click");
      await flushPromises();
      const first = wrapper.getComponent(SparklineDialog);
      const firstUid = first.vm.$.uid;
      const firstSelection = first.props("selectReference")("A1:C2");
      await flushPromises();
      const oldPicker = wrapper.getComponent(RangeReferencePicker).vm.$.vnode.props!;
      await wrapper.get('[role="button"][aria-label="Sparklines"]').trigger("click");
      await flushPromises();
      const current = wrapper.getComponent(SparklineDialog);
      expect(current.props("suspended")).toBe(false);
      expect(current.vm.$.uid).not.toBe(firstUid);
      expect(wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
      expect(await firstSelection).toBeUndefined();
      expect(await first.props("selectReference")("A5:C5")).toBeUndefined();
      expect(wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
      const selection = current.props("selectReference")("A1:C2");
      await flushPromises();
      const picker = wrapper.getComponent(RangeReferencePicker);
      const pickerUid = picker.vm.$.uid;
      const before = serializeWorkbook(captured.controller!.session.workbook);
      (oldPicker[action === "confirm" ? "onConfirm" : "onCancel"] as () => void)();
      await flushPromises();
      expect(wrapper.getComponent(RangeReferencePicker).vm.$.uid).toBe(pickerUid);
      expect(current.props("suspended")).toBe(true);
      expect(serializeWorkbook(captured.controller!.session.workbook)).toEqual(before);
      expect(captured.controller!.session.history.undoStack).toHaveLength(0);
      picker.vm.$emit("cancel");
      expect(await selection).toBeUndefined();
      await flushPromises();
      expect(current.props("suspended")).toBe(false);
    },
  );

  test("Hyperlink uses instance-bound callbacks from the actual Insert ribbon", async () => {
    const wrapper = await fixture(true);
    const controller = captured.controller!;
    await wrapper.get('[data-insert-tool="hyperlink"]').trigger("click");
    await flushPromises();
    const old = wrapper.getComponent(HyperlinkDialog).vm.$.vnode.props!;
    (old.onCancel as () => void)();
    await flushPromises();
    await wrapper.get('[data-insert-tool="hyperlink"]').trigger("click");
    await flushPromises();
    const current = wrapper.getComponent(HyperlinkDialog);
    const uid = current.vm.$.uid;
    const before = serializeWorkbook(controller.session.workbook);
    (old.onConfirm as (value: { target: string; displayText: string; tooltip: string }) => void)({
      target: "https://example.test/stale",
      displayText: "stale",
      tooltip: "",
    });
    (old.onCancel as () => void)();
    await flushPromises();
    expect(wrapper.getComponent(HyperlinkDialog).vm.$.uid).toBe(uid);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    current.vm.$emit("confirm", {
      target: "#Sheet1!B3",
      displayText: "Internal report",
      tooltip: "Synthetic",
    });
    await flushPromises();
    expect(wrapper.findComponent(HyperlinkDialog).exists()).toBe(false);
    expect(getCellValue(controller.activeSheet.value, { row: 0, column: 0 })).toBe(
      "Internal report",
    );
    expect(controller.session.history.undoStack).toHaveLength(1);
  });
  test.each(["cancel", "reopen", "navigation"] as const)(
    "old Symbol callbacks cannot change the draft or a newer dialog after %s",
    async (action) => {
      const wrapper = await fixture(true);
      const controller = captured.controller!;
      const session = wrapper.getComponent(SheetGrid).props("editSession")!;
      const before = serializeWorkbook(controller.session.workbook);
      await openFullSymbolDialog(wrapper);
      const callbacks = wrapper.getComponent(SymbolDialog).vm.$.vnode.props!;
      const insert = wrapper.getComponent(SymbolDialog).props("insertText")!;
      const close = callbacks.onClose as () => void;
      if (action === "navigation") {
        controller.addSheet();
        await flushPromises();
      } else {
        close();
        await flushPromises();
      }
      const afterDismiss = serializeWorkbook(controller.session.workbook);
      const historyLength = controller.session.history.undoStack.length;
      if (action === "reopen") {
        await openFullSymbolDialog(wrapper);
        close();
        await flushPromises();
        expect(wrapper.findComponent(SymbolDialog).exists()).toBe(true);
      }
      const draftBefore = session.state.draft;
      const revisionBefore = session.state.revision;
      expect(insert({ text: "stale" })).toBe(false);
      await flushPromises();
      expect(session.state.draft).toBe(draftBefore);
      expect(session.state.revision).toBe(revisionBefore);
      expect(serializeWorkbook(controller.session.workbook)).toEqual(afterDismiss);
      expect(controller.session.history.undoStack).toHaveLength(historyLength);
      if (action !== "navigation") expect(afterDismiss).toEqual(before);
      expect(wrapper.findComponent(SymbolDialog).exists()).toBe(action === "reopen");
    },
  );
  test("Symbol replaces the retained editor selection as draft, with cancel and one commit history", async () => {
    const wrapper = await fixture(true);
    const controller = captured.controller!;
    const grid = wrapper.getComponent(SheetGrid);
    const session = grid.props("editSession")!;
    const sheet = controller.activeSheet.value;
    const before = serializeWorkbook(controller.session.workbook);
    session.begin(
      { sheetId: sheet.id, address: { row: 0, column: 0 }, input: "Region" },
      { surface: "grid", mode: "append" },
    );
    await flushPromises();
    const editor = grid.get('[data-cell-editor="A1"]').element as HTMLTextAreaElement;
    editor.setSelectionRange(2, 4);
    session.setSelection(2, 4);
    await openFullSymbolDialog(wrapper);
    wrapper.getComponent(SymbolDialog).vm.$emit("close");
    await flushPromises();
    expect(session.state.draft).toBe("Region");
    expect(session.state.selection).toMatchObject({ start: 2, end: 4 });
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    await openFullSymbolDialog(wrapper);
    expect(
      wrapper.getComponent(SymbolDialog).props("insertText")!({
        text: "π",
        fontFamily: "Noto Sans Math",
      }),
    ).toBe(true);
    await flushPromises();
    expect(session.state.draft).toBe("Reπon");
    expect(session.state.selection).toMatchObject({ start: 3, end: 3 });
    expect(wrapper.findComponent(SymbolDialog).exists()).toBe(true);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    expect(controller.session.history.undoStack).toHaveLength(0);
    wrapper.getComponent(SymbolDialog).vm.$emit("close");
    await flushPromises();
    session.cancel();
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    await openFullSymbolDialog(wrapper);
    expect(
      wrapper.getComponent(SymbolDialog).props("insertText")!({
        text: "Ω🙂",
        fontFamily: "Noto Sans Symbols 2",
      }),
    ).toBe(true);
    await flushPromises();
    expect(session.state.draft).toBe("RegionΩ🙂");
    wrapper.getComponent(SymbolDialog).vm.$emit("close");
    await flushPromises();
    expect(session.finish()).toBe(true);
    await flushPromises();
    expect(getCellValue(controller.activeSheet.value, { row: 0, column: 0 })).toBe("RegionΩ🙂");
    expect(getCellContent(controller.activeSheet.value, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "RegionΩ🙂",
      fontRuns: [{ start: 6, end: 9, fontFamily: "Noto Sans Symbols 2" }],
    });
    expect(controller.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(controller.session.workbook);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    await flushPromises();
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
    await flushPromises();
    expect(serializeWorkbook(controller.session.workbook)).toEqual(after);
  });
  test("Text-format plain grid edits do not invoke formula completion", async () => {
    const wrapper = await fixture();
    const controller = captured.controller!;
    const sheet = controller.activeSheet.value;
    const address = { row: 0, column: 0 };
    setCellStyle(sheet, address, { numberFormat: { kind: "text" } });
    expect(controller.commitCell({ address, input: "'=SU" })).toBe(true);
    await flushPromises();
    await wrapper.get(".cell-editor").trigger("keydown", { key: "F2" });
    const input = wrapper.get("textarea.cell-editor.is-editing");
    await input.setValue("=SU");
    const session = wrapper.getComponent(SheetGrid).props("editSession")!;
    expect(session.state.asText).toBe(true);
    expect(wrapper.getComponent(CellEditor).getComponent(FormulaInputAssist).props("active")).toBe(
      false,
    );
    await input.trigger("keydown", { key: "Tab" });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "=SU" });
  });
  test.each(["Enter", "Tab"])(
    "Symbol preserves incomplete formula-looking Text and its font through grid %s",
    async (key) => {
      const wrapper = await fixture();
      const controller = captured.controller!;
      const sheet = controller.activeSheet.value;
      const address = { row: 0, column: 0 };
      setCellStyle(sheet, address, { numberFormat: { kind: "text" } });
      const session = wrapper.getComponent(SheetGrid).props("editSession")!;
      session.begin(
        { sheetId: sheet.id, address, input: "", content: null },
        { surface: "grid", mode: "append" },
      );
      session.replaceSelection("=SUM(A");
      await openFullSymbolDialog(wrapper);
      expect(
        wrapper.getComponent(SymbolDialog).props("insertText")!({
          text: "1",
          fontFamily: "Noto Sans Math",
        }),
      ).toBe(true);
      wrapper.getComponent(SymbolDialog).vm.$emit("close");
      await flushPromises();
      // Text format still owns literal parsing if the user removes the editor escape.
      session.prepareInput(0, 1, "deleteContentForward");
      session.setDraft("=SUM(A1");
      await flushPromises();
      await wrapper.get(".cell-editor.is-editing").trigger("keydown", { key });
      expect(getCellContent(sheet, address)).toEqual({
        kind: "literal",
        value: "=SUM(A1",
        fontRuns: [{ start: 6, end: 7, fontFamily: "Noto Sans Math" }],
      });
    },
  );
  test("a delayed Symbol shortcut cannot insert after the same document target is undone", async () => {
    const wrapper = await fixture();
    const controller = captured.controller!;
    const address = { row: 0, column: 0 };
    expect(controller.commitCell({ address, input: "original" })).toBe(true);
    await flushPromises();
    const prefs = useSymbolPreferences();
    prefs.update({
      ...defaultSymbolPreferences(),
      custom: [
        { text: "Ω", fontFamily: "Noto Sans Math", visible: false, shortcut: "Ctrl+Shift+F11" },
      ],
    });
    const recent = prefs.preferences.value.recent;
    let resolve!: () => void;
    captured.ensureFont.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    await wrapper
      .get("[data-sheet-canvas]")
      .trigger("keydown", { key: "F11", ctrlKey: true, shiftKey: true });
    expect(captured.ensureFont).toHaveBeenCalledWith("Noto Sans Math");
    expect(controller.undo()).toBe(true);
    await flushPromises();
    const session = wrapper.getComponent(SheetGrid).props("editSession")!;
    const snapshot = serializeWorkbook(controller.session.workbook);
    const state = { ...session.state, selection: { ...session.state.selection } };
    resolve();
    await flushPromises();
    expect(session.state).toEqual(state);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(snapshot);
    expect(controller.session.history.undoStack).toHaveLength(0);
    expect(prefs.preferences.value.recent).toEqual(recent);
  });
  test.each([
    { tool: "shape", selector: '[data-insert-tool="shape"]', dialog: ".drawing-editor" },
    { tool: "text box", selector: '[data-insert-tool="text-box"]', dialog: ".drawing-editor" },
    { tool: "WordArt", selector: '[data-insert-tool="wordArt"]', dialog: ".drawing-editor" },
    {
      tool: "chart",
      selector: '.chart-insert-tools [role="button"][aria-label="Column"]',
      dialog: ".chart-editor",
    },
    { tool: "camera", selector: '[data-insert-tool="camera"]', dialog: ".camera-editor" },
    { tool: "control", selector: '[data-insert-tool="control"]', dialog: ".form-control-editor" },
    { tool: "pivot table", selector: '[data-insert-tool="pivot-table"]', dialog: ".pivot-create" },
    { tool: "pivot chart", selector: '[data-insert-tool="pivot-chart"]', dialog: ".pivot-create" },
  ])("opens the $tool editor from the actual Insert ribbon", async ({ selector, dialog }) => {
    const wrapper = await fixture();
    expect(document.querySelector(dialog)).toBeNull();
    await wrapper.get(selector).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.querySelector(dialog)).not.toBeNull(), {
      timeout: 10000,
    });
  });
  test.each([false, true])(
    "creates an empty report, configures it through the field pane, and leaves its contextual tools, chart=%s",
    async (chart) => {
      const wrapper = await fixture(true);
      const controller = captured.controller!;
      expect(controller.session.history.undoStack).toHaveLength(0);
      const sourceId = (wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id;
      const before = serializeWorkbook(controller.session.workbook);
      await wrapper
        .get(`[data-insert-tool="${chart ? "pivot-chart" : "pivot-table"}"]`)
        .trigger("click");
      await vi.waitFor(() => expect(document.querySelector(".pivot-create")).not.toBeNull());
      const dialog = document.querySelector(".pivot-create")!.closest(".t-dialog")!;
      const confirm = dialog.querySelector<HTMLButtonElement>(
        ".t-dialog__footer .t-button--theme-primary",
      )!;
      expect(confirm.disabled).toBe(false);
      confirm.click();
      await flushPromises();
      await vi.waitFor(() =>
        expect((wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id).not.toBe(sourceId),
      );
      let output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(output.pivotTables).toHaveLength(1);
      expect(output.pivotTables![0]!.anchor).toEqual({ row: 2, column: 0 });
      expect(controller.activeAddress.value).toEqual(output.pivotTables![0]!.anchor);
      expect(controller.session.history.undoStack).toHaveLength(1);
      expect(output.pivotTables![0]!.outputRange).toBeNull();
      expect(output.cells.size).toBe(0);
      expect(output.drawings).toHaveLength(Number(chart));
      if (chart)
        expect(output.drawings![0]).toMatchObject({
          kind: "chart",
          chart: { pivotTableId: output.pivotTables![0]!.id, range: null },
        });
      expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(true);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
      expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(true);
      expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(true);
      const empty = serializeWorkbook(controller.session.workbook);
      await wrapper.get('[data-ribbon-category="home"]').trigger("click");
      await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
      await flushPromises();
      expect(controller.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
      expect(controller.activeSheet.value.id).toBe(sourceId);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
      await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
      await flushPromises();
      expect(controller.session.history.undoStack).toHaveLength(1);
      expect(serializeWorkbook(controller.session.workbook)).toEqual(empty);
      output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(controller.activeAddress.value).toEqual(output.pivotTables![0]!.anchor);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
      await wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]').setValue(true);
      await wrapper.get('[data-pivot-source-field="1"] input[type="checkbox"]').setValue(true);
      await flushPromises();
      expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(false);

      const report = output.pivotTables![0]!;
      const anchor = report.anchor;
      expect(report.outputRange).toEqual({
        start: anchor,
        end: { row: anchor.row + 3, column: anchor.column + 1 },
      });
      expect(getCellValue(output, { row: 0, column: 0 })).toBeNull();
      expect(getCellValue(output, { row: 1, column: 0 })).toBeNull();
      expect(getCellValue(output, { row: anchor.row + 1, column: anchor.column + 1 })).toBe(30);
      expect(getCellValue(output, { row: anchor.row + 2, column: anchor.column + 1 })).toBe(40);
      expect(getCellValue(output, { row: anchor.row + 3, column: anchor.column + 1 })).toBe(70);
      expect(controller.activeAddress.value).toEqual(anchor);
      expect(controller.session.history.undoStack).toHaveLength(3);
      if (chart)
        expect(output.drawings![0]).toMatchObject({ chart: { range: report.outputRange } });
      await triggerCanvasCell(wrapper, { row: 5, column: 4 }, "mousedown", { button: 0 });
      await flushPromises();
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
      expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(false);
      expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(false);
      expect(controller.activeAddress.value).toEqual({ row: 5, column: 4 });
      expect(controller.session.history.undoStack).toHaveLength(3);
    },
  );
  test.each(["close", "navigation"] as const)(
    "keeps reentrant %s authoritative during new-sheet confirmation",
    async (action) => {
      const wrapper = await fixture(true);
      const controller = captured.controller!;
      const sourceId = controller.activeSheet.value.id;
      await wrapper.get('[data-insert-tool="pivot-table"]').trigger("click");
      await flushPromises();
      const editor = wrapper.getComponent(PivotTableDialog);
      const initial = editor.props("initial");
      const callbacks = editor.vm.$.vnode.props!;
      const close = callbacks.onClose as () => void;
      const confirm = callbacks.onConfirm as (draft: typeof initial) => void;
      let interrupted = false;
      // Observe the actual command-driven sheet transition synchronously, just
      // as a newer navigation or explicit cancellation can invalidate a session.
      const stop = watch(
        () => controller.activeSheet.value.id,
        (sheetId) => {
          if (interrupted || sheetId === sourceId) return;
          interrupted = true;
          if (action === "close") close();
          else controller.selectSheet(sourceId);
        },
        { flush: "sync" },
      );
      try {
        document
          .querySelector(".pivot-create")!
          .closest(".t-dialog")!
          .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!
          .click();
        await flushPromises();
        expect(interrupted).toBe(true);
        expect(controller.session.workbook.sheets.size).toBe(2);
        expect(controller.session.history.undoStack).toHaveLength(1);
        expect(controller.activeAddress.value).toEqual({ row: 0, column: 0 });
        expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
        expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(false);
        if (action === "navigation") expect(controller.activeSheet.value.id).toBe(sourceId);
        else expect(controller.activeSheet.value.id).not.toBe(sourceId);
        const after = serializeWorkbook(controller.session.workbook);
        confirm(initial);
        close();
        await flushPromises();
        expect(serializeWorkbook(controller.session.workbook)).toEqual(after);
        expect(controller.session.history.undoStack).toHaveLength(1);
      } finally {
        stop();
      }
    },
  );
});
